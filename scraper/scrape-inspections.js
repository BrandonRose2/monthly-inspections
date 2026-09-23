/**
 * scrape-inspections.js
 *
 * Pulls a month of inspection activity from MyLoneWorkers, decides pass/fail
 * for every portal property, and files the result (status + reason + PDF)
 * into the portal. The PDF is a one-page summary followed by MyLoneWorkers'
 * own "Print All Forms" report (every unit's form: rooms, notes, photos).
 *
 * How it works:
 *   1. Borrow the API token from the runner's signed-in browser profile
 *      (`npm run setup:session` creates that profile; no password is stored).
 *   2. Fetch every event for every worker from the 1st to the end of the month
 *      via the same JSON API the Events Browser page uses.
 *   3. Credit each unit scan to the property where it happened (checkpoint
 *      site), not to the login that did it. See lib/attribute.js.
 *   4. For each property with unit scans, fetch MyLoneWorkers' forms report
 *      for those scans' form submissions (the same report as Export To ->
 *      Print All Forms -> Export Form to PDF) and put the summary in front.
 *   5. File each property's result into the portal.
 *
 *   PORTAL_BASE_URL=https://portal-production-1ac7.up.railway.app INGEST_TOKEN=... npm run scrape
 *
 * Options (environment variables):
 *   MONTH=YYYY-MM     month to process (default: current month in TIME_ZONE)
 *   START_MONTH / END_MONTH=YYYY-MM   process a range instead (inclusive)
 *   RUN_ID=12         the portal run this scrape reports progress to
 *   DRY_RUN=true      write output/ but file nothing into the portal
 *   MIN_UNITS=3       units needed for a pass; fewer is "partial"
 *   DUE_DAY=21        deadline day of month
 *   TIME_ZONE=America/Los_Angeles
 *   ONLY="Lexington,Breckenridge"   limit filing to these portal properties
 *   HEADLESS=false    show the browser while borrowing the token
 *   EXPORT_FORMS=false  skip the forms report; attach only the summary page
 */
const fs = require('fs');
const path = require('path');
const { monthWindows, currentMonthKey, monthRange, formatLocalDate } = require('./lib/time');
const { fetchAllEvents, fetchFormsPdfs, SessionExpiredError } = require('./lib/mlw-api');
const { attribute } = require('./lib/attribute');
const { buildReportPdf } = require('./lib/report-pdf');
const { mergePdfs } = require('./lib/pdf-merge');
const { makeReporter } = require('./lib/progress');

const STATUS_ICON = { pass: '✅', late: '⚠️', partial: '❌', other_sites_only: '❌', tour_no_scans: '❌', no_activity: '❌' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const CONFIG = {
  portalBaseUrl: (process.env.PORTAL_BASE_URL || '').replace(/\/$/, ''),
  ingestToken: process.env.INGEST_TOKEN,
  dryRun: process.env.DRY_RUN === 'true',
  timeZone: process.env.TIME_ZONE || 'America/Los_Angeles',
  dueDay: Number(process.env.DUE_DAY || 21),
  minUnits: Number(process.env.MIN_UNITS || 3),
  only: (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean),
  headless: process.env.HEADLESS !== 'false',
  exportForms: process.env.EXPORT_FORMS !== 'false',
  outputDir: path.join(__dirname, 'output'),
  diagnosticsDir: path.join(__dirname, 'diagnostics'),
};

const readJson = f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));

function loadPropertyMap() {
  const raw = readJson('property-map.json');
  const map = { ...raw.confirmed };
  for (const [k, v] of Object.entries(raw.needs_confirmation || {})) if (v !== null) map[k] = v;
  return map;
}

async function borrowToken() {
  // MLW_TOKEN is for local testing only; the runner always uses the browser session.
  if (process.env.MLW_TOKEN) return process.env.MLW_TOKEN;
  const { getApiToken } = require('./lib/session'); // loads puppeteer only when needed
  return getApiToken({ headless: CONFIG.headless, diagnosticsDir: CONFIG.diagnosticsDir });
}

// Large forms reports go up as raw bytes first (no base64, no JSON size limit).
// Returns null when the portal predates that route, so the caller falls back.
async function uploadPdf({ monthKey, property, pdf }) {
  const qs = new URLSearchParams({ monthKey, property, fileName: pdf.fileName });
  const res = await fetch(`${CONFIG.portalBaseUrl}/api/ingest/pdf?${qs}`, {
    method: 'POST',
    headers: { 'content-type': 'application/pdf', authorization: `Bearer ${CONFIG.ingestToken}` },
    body: pdf.buffer,
  });
  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`PDF upload failed (${res.status}, ${(pdf.buffer.length / 1048576).toFixed(1)} MB): ${text.slice(0, 200)}`);
  return JSON.parse(text).url;
}

async function fileResult({ monthKey, result, pdf }) {
  let file = {};
  if (pdf) {
    const url = await uploadPdf({ monthKey, property: result.property, pdf });
    file = url
      ? { fileName: pdf.fileName, pdfUrl: url, fileSize: pdf.buffer.length }
      : { fileName: pdf.fileName, fileBase64: pdf.buffer.toString('base64'), fileSize: pdf.buffer.length };
  }
  const res = await fetch(`${CONFIG.portalBaseUrl}/api/trpc/inspections.ingestInspectionResult`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${CONFIG.ingestToken}` },
    body: JSON.stringify({
      json: {
        monthKey,
        region: result.region,
        property: result.property,
        checked: result.checked,
        xed: result.xed,
        note: result.note,
        ...file,
      },
    }),
  });
  const body = await res.text();
  if (!res.ok || body.includes('"error"')) throw new Error(`portal ingest failed (${res.status}): ${body.slice(0, 300)}`);
}

function githubRunUrl() {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  return GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : undefined;
}

function monthsToRun() {
  const single = (process.env.MONTH || '').trim();
  const start = (process.env.START_MONTH || '').trim() || single || currentMonthKey(CONFIG.timeZone);
  const end = (process.env.END_MONTH || '').trim() || start;
  const months = monthRange(start, end);
  if (!months.length) throw new Error(`END_MONTH (${end}) is before START_MONTH (${start})`);
  return months;
}

const reporter = makeReporter({
  portalBaseUrl: CONFIG.portalBaseUrl,
  ingestToken: CONFIG.ingestToken,
  enabled: !CONFIG.dryRun && Boolean(CONFIG.portalBaseUrl && CONFIG.ingestToken),
});

// Running totals across every month of the run, shown in Scrape Activity.
const totals = { passed: 0, failed: 0, total: 0, pdfs: 0, errors: 0 };

async function runMonth({ monthKey, index, count, token, portal, siteMap, workers, propertyMap, guardIds }) {
  const windows = monthWindows(monthKey, { timeZone: CONFIG.timeZone, dueDay: CONFIG.dueDay });
  const [y, m] = monthKey.split('-').map(Number);
  const monthLabel = `${MONTHS[m - 1]} ${y}`;
  const step = count > 1 ? ` (${index + 1} of ${count})` : '';

  console.log(`\nMonthly Inspections — ${monthLabel}${step}${CONFIG.dryRun ? ' (DRY RUN)' : ''}`);
  await reporter.line(`━━━ Starting ${monthLabel}${step} ━━━`);
  console.log(`Deadline: day ${CONFIG.dueDay} of the month, ${CONFIG.timeZone}; pass = at least ${CONFIG.minUnits} units scanned`);
  await reporter.update({ currentMonthKey: monthKey, currentProperty: null, progressMessage: `Fetching ${monthLabel} from MyLoneWorkers${step}` });

  const to = Math.min(windows.monthEnd, Math.floor(Date.now() / 1000));
  const events = await fetchAllEvents(token, { guardIds, from: windows.start, to });
  console.log(`Fetched ${events.length} events from MyLoneWorkers`);
  await reporter.line(`✅ Fetched ${events.length} events from MyLoneWorkers (${formatLocalDate(windows.start, CONFIG.timeZone)} – ${formatLocalDate(to, CONFIG.timeZone)})`);

  const { results, unmatchedSites, unknownWorkers } = attribute({
    events, windows, portal, siteMap, workers, propertyMap, minUnits: CONFIG.minUnits,
  });

  const pdfDir = path.join(CONFIG.outputDir, 'pdfs', monthKey);
  fs.mkdirSync(pdfDir, { recursive: true });

  let filed = 0, failed = 0;
  const summary = [];
  const toFile = results.filter(r => !r.skip && !(CONFIG.only.length && !CONFIG.only.includes(r.property)));
  const before = { ...totals };
  let n = 0;
  for (const r of results) {
    const line = `${r.status.padEnd(20)} ${r.region} / ${r.property} — ${r.note}`;
    if (r.skip || (CONFIG.only.length && !CONFIG.only.includes(r.property))) {
      console.log(`  skip  ${line}`);
      summary.push({ ...r, scans: undefined, tourEvents: undefined, filed: false });
      continue;
    }
    n++;
    await reporter.line(`[${n}/${toFile.length}] ${r.property}`);
    await reporter.update({ currentProperty: r.property, progressMessage: `${monthLabel}${step}: filing ${r.property}` });
    try {
      let pdf = null;
      let formsPages = 0;
      if (r.scans.length) {
        const parts = [];
        const formIds = [...new Set(r.scans.map(e => e.formID).filter(Boolean))];
        if (CONFIG.exportForms && formIds.length) {
          await reporter.line(`📄 Downloading forms report (${formIds.length} form${formIds.length === 1 ? '' : 's'})...`);
          try {
            parts.push(...(await fetchFormsPdfs(token, formIds)));
          } catch (err) {
            if (err instanceof SessionExpiredError) throw err;
            console.warn(`     forms report not attached: ${err.message}`);
            await reporter.line(`⚠️ Forms report not attached: ${err.message}`);
            r.note += ' (MyLoneWorkers forms report could not be attached; see the scraper log.)';
          }
        }
        const cover = await buildReportPdf({ result: r, monthLabel, windows });
        const buffer = parts.length ? await mergePdfs([cover, ...parts]) : cover;
        formsPages = parts.length ? (await require('pdf-lib').PDFDocument.load(buffer)).getPageCount() - 1 : 0;
        const fileName = `${r.property.replace(/[^a-z0-9]/gi, '_')}_${monthKey}.pdf`;
        fs.writeFileSync(path.join(pdfDir, fileName), buffer);
        pdf = { fileName, buffer };
      }
      if (!CONFIG.dryRun) await fileResult({ monthKey, result: r, pdf });
      filed++;
      totals.total++;
      if (r.checked) totals.passed++;
      if (r.xed) totals.failed++;
      if (pdf) totals.pdfs++;
      console.log(`  ${CONFIG.dryRun ? 'dry ' : 'filed'} ${line}${formsPages ? ` [+${formsPages} form pages]` : ''}`);
      await reporter.line(`${STATUS_ICON[r.status] || '•'} ${r.property}: ${r.note}`);
      if (pdf) await reporter.line(`✅ PDF filed (${(pdf.buffer.length / 1048576).toFixed(1)} MB${formsPages ? `, ${formsPages + 1} pages` : ''})`);
      summary.push({ region: r.region, property: r.property, status: r.status, checked: r.checked, xed: r.xed,
        note: r.note, units: r.units, onTimeUnits: r.onTimeUnits, inspectors: r.inspectors, pdf: pdf?.fileName ?? null, formsPages,
        filed: !CONFIG.dryRun });
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err;
      failed++;
      totals.errors++;
      console.warn(`  FAIL  ${line}\n        ${err.message}`);
      await reporter.line(`❌ ${r.property}: could not be filed — ${err.message.slice(0, 300)}`);
      summary.push({ region: r.region, property: r.property, status: r.status, error: err.message, filed: false });
    }
    await reporter.update({ passed: totals.passed, failed: totals.failed, total: totals.total, pdfs: totals.pdfs });
  }

  if (unmatchedSites.length) {
    console.warn('\nScans at sites that are not mapped to a portal property (add them to site-map.json):');
    for (const u of unmatchedSites) {
      console.warn(`  "${u.site}" — ${u.scans} scans by ${u.workers.join(', ')}`);
      await reporter.line(`⚠️ Unmapped MyLoneWorkers site "${u.site}": ${u.scans} scans not credited to any property`);
    }
  }
  if (unknownWorkers.length) {
    console.warn(`\nWorkers not in workers.json (their tours cannot be tied to a property): ${unknownWorkers.join(', ')}`);
  }

  const counts = summary.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {});
  const monthResult = {
    monthKey, generatedAt: new Date().toISOString(), dryRun: CONFIG.dryRun, minUnits: CONFIG.minUnits,
    eventsFetched: events.length, counts, filed, failed, unmatchedSites, unknownWorkers, results: summary,
  };
  fs.writeFileSync(path.join(CONFIG.outputDir, `results-${monthKey}.json`), JSON.stringify(monthResult, null, 2));
  console.log(`\n${monthLabel} done — ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}. Filed ${filed}, failed ${failed}.`);
  await reporter.line(`✅ ${monthLabel} done — ${totals.passed - before.passed} passed · ${totals.failed - before.failed} issues · ${totals.pdfs - before.pdfs} PDFs`);
  await reporter.update({ completedMonths: index + 1 });
  return monthResult;
}

async function run() {
  if (!CONFIG.dryRun && (!CONFIG.portalBaseUrl || !CONFIG.ingestToken)) {
    throw new Error('PORTAL_BASE_URL and INGEST_TOKEN are required (or set DRY_RUN=true)');
  }
  const months = monthsToRun();
  const runId = Number(process.env.RUN_ID) || undefined;
  await reporter.begin({
    runId,
    startMonthKey: months[0],
    endMonthKey: months[months.length - 1],
    properties: CONFIG.only.length ? CONFIG.only : undefined,
    githubRunUrl: githubRunUrl(),
  });

  const portal = readJson('portal-properties.json');
  const siteMap = readJson('site-map.json');
  const workers = readJson('workers.json');
  const propertyMap = loadPropertyMap();
  const guardIds = workers.workers.map(w => w.id);
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  await reporter.line('🔐 Signing in to MyLoneWorkers...');
  const token = await borrowToken();
  await reporter.line('✅ Signed in');
  const monthResults = [];
  for (const [index, monthKey] of months.entries()) {
    monthResults.push(await runMonth({ monthKey, index, count: months.length, token, portal, siteMap, workers, propertyMap, guardIds }));
  }

  fs.writeFileSync(path.join(CONFIG.outputDir, 'results.json'), JSON.stringify({
    months, generatedAt: new Date().toISOString(), dryRun: CONFIG.dryRun, totals,
    perMonth: monthResults.map(({ monthKey, counts, filed, failed, unmatchedSites }) => ({ monthKey, counts, filed, failed, unmatchedSites })),
  }, null, 2));

  const failedAny = totals.errors > 0;
  await reporter.line(`━━━ Scraper complete ━━━`);
  await reporter.line(`${failedAny ? '⚠️' : '✅'} ${totals.passed} passed · ${totals.failed} issues · ${totals.pdfs} PDFs${failedAny ? ` · ${totals.errors} could not be filed` : ''}`);
  await reporter.update({
    status: failedAny ? 'completed_with_errors' : 'completed',
    currentProperty: null,
    completedMonths: months.length,
    passed: totals.passed, failed: totals.failed, total: totals.total, pdfs: totals.pdfs,
    progressMessage: `${totals.passed} passed · ${totals.failed} issues · ${totals.pdfs} PDFs${failedAny ? ` · ${totals.errors} could not be filed` : ''}`,
    ...(failedAny ? { errorMessage: `${totals.errors} propert${totals.errors === 1 ? 'y' : 'ies'} could not be filed; see the GitHub run log.` } : {}),
  });
  console.log(`\nAll done — ${months.length} month${months.length === 1 ? '' : 's'}. Details: scraper/output/results*.json; PDFs: scraper/output/pdfs/`);
  if (failedAny) process.exitCode = 1;
}

run().catch(async err => {
  const message = err instanceof SessionExpiredError
    ? `${err.message}. Run \`npm run setup:session\` on the runner and sign in again.`
    : err.message;
  console.error(`\n${err instanceof SessionExpiredError ? '' : 'Fatal: '}${message}`);
  await reporter.line(`❌ ${message}`);
  await reporter.update({ status: 'failed', currentProperty: null, errorMessage: message.slice(0, 4000),
    passed: totals.passed, failed: totals.failed, total: totals.total, pdfs: totals.pdfs });
  process.exit(1);
});
