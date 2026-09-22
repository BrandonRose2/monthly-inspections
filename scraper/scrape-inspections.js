/**
 * scrape-inspections.js
 *
 * Pulls a month of inspection activity from MyLoneWorkers, decides pass/fail
 * for every portal property, builds a PDF report for each property that had
 * unit scans, and files the result (status + reason + PDF) into the portal.
 *
 * How it works:
 *   1. Borrow the API token from the runner's signed-in browser profile
 *      (`npm run setup:session` creates that profile; no password is stored).
 *   2. Fetch every event for every worker from the 1st to the end of the month
 *      via the same JSON API the Events Browser page uses.
 *   3. Credit each unit scan to the property where it happened (checkpoint
 *      site), not to the login that did it. See lib/attribute.js.
 *   4. File each property's result into the portal.
 *
 *   PORTAL_BASE_URL=https://portal-production-1ac7.up.railway.app INGEST_TOKEN=... npm run scrape
 *
 * Options (environment variables):
 *   MONTH=YYYY-MM     month to process (default: current month in TIME_ZONE)
 *   DRY_RUN=true      write output/ but file nothing into the portal
 *   MIN_UNITS=3       units needed for a pass; fewer is "partial"
 *   DUE_DAY=21        deadline day of month
 *   TIME_ZONE=America/Los_Angeles
 *   ONLY="Lexington,Breckenridge"   limit filing to these portal properties
 *   HEADLESS=false    show the browser while borrowing the token
 */
const fs = require('fs');
const path = require('path');
const { monthWindows, currentMonthKey } = require('./lib/time');
const { fetchAllEvents, SessionExpiredError } = require('./lib/mlw-api');
const { attribute } = require('./lib/attribute');
const { buildReportPdf } = require('./lib/report-pdf');

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
  // For local testing you can hand in a token directly; the runner never does.
  if (process.env.MLW_TOKEN) return process.env.MLW_TOKEN;
  const { getApiToken } = require('./lib/session'); // loads puppeteer only when needed
  return getApiToken({ headless: CONFIG.headless, diagnosticsDir: CONFIG.diagnosticsDir });
}

async function fileResult({ monthKey, result, pdf }) {
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
        ...(pdf ? { fileName: pdf.fileName, fileBase64: pdf.buffer.toString('base64'), fileSize: pdf.buffer.length } : {}),
      },
    }),
  });
  const body = await res.text();
  if (!res.ok || body.includes('"error"')) throw new Error(`portal ingest failed (${res.status}): ${body.slice(0, 300)}`);
}

async function run() {
  if (!CONFIG.dryRun && (!CONFIG.portalBaseUrl || !CONFIG.ingestToken)) {
    throw new Error('PORTAL_BASE_URL and INGEST_TOKEN are required (or set DRY_RUN=true)');
  }
  const monthKey = (process.env.MONTH || '').trim() || currentMonthKey(CONFIG.timeZone);
  const windows = monthWindows(monthKey, { timeZone: CONFIG.timeZone, dueDay: CONFIG.dueDay });
  const [y, m] = monthKey.split('-').map(Number);
  const monthLabel = `${MONTHS[m - 1]} ${y}`;

  const portal = readJson('portal-properties.json');
  const siteMap = readJson('site-map.json');
  const workers = readJson('workers.json');
  const propertyMap = loadPropertyMap();
  const guardIds = workers.workers.map(w => w.id);

  console.log(`\nMonthly Inspections — ${monthLabel}${CONFIG.dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`Deadline: day ${CONFIG.dueDay} of the month, ${CONFIG.timeZone}; pass = at least ${CONFIG.minUnits} units scanned`);

  const token = await borrowToken();
  const to = Math.min(windows.monthEnd, Math.floor(Date.now() / 1000));
  const events = await fetchAllEvents(token, { guardIds, from: windows.start, to });
  console.log(`Fetched ${events.length} events from MyLoneWorkers`);

  const { results, unmatchedSites, unknownWorkers } = attribute({
    events, windows, portal, siteMap, workers, propertyMap, minUnits: CONFIG.minUnits,
  });

  const pdfDir = path.join(CONFIG.outputDir, 'pdfs', monthKey);
  fs.mkdirSync(pdfDir, { recursive: true });

  let filed = 0, failed = 0;
  const summary = [];
  for (const r of results) {
    const line = `${r.status.padEnd(20)} ${r.region} / ${r.property} — ${r.note}`;
    if (r.skip || (CONFIG.only.length && !CONFIG.only.includes(r.property))) {
      console.log(`  skip  ${line}`);
      summary.push({ ...r, scans: undefined, tourEvents: undefined, filed: false });
      continue;
    }
    try {
      let pdf = null;
      if (r.scans.length) {
        const fileName = `${r.property.replace(/[^a-z0-9]/gi, '_')}_${monthKey}.pdf`;
        const buffer = await buildReportPdf({ result: r, monthLabel, windows });
        fs.writeFileSync(path.join(pdfDir, fileName), buffer);
        pdf = { fileName, buffer };
      }
      if (!CONFIG.dryRun) await fileResult({ monthKey, result: r, pdf });
      filed++;
      console.log(`  ${CONFIG.dryRun ? 'dry ' : 'filed'} ${line}`);
      summary.push({ region: r.region, property: r.property, status: r.status, checked: r.checked, xed: r.xed,
        note: r.note, units: r.units, onTimeUnits: r.onTimeUnits, inspectors: r.inspectors, pdf: pdf?.fileName ?? null,
        filed: !CONFIG.dryRun });
    } catch (err) {
      failed++;
      console.warn(`  FAIL  ${line}\n        ${err.message}`);
      summary.push({ region: r.region, property: r.property, status: r.status, error: err.message, filed: false });
    }
  }

  if (unmatchedSites.length) {
    console.warn('\nScans at sites that are not mapped to a portal property (add them to site-map.json):');
    for (const u of unmatchedSites) console.warn(`  "${u.site}" — ${u.scans} scans by ${u.workers.join(', ')}`);
  }
  if (unknownWorkers.length) {
    console.warn(`\nWorkers not in workers.json (their tours cannot be tied to a property): ${unknownWorkers.join(', ')}`);
  }

  const counts = summary.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {});
  fs.writeFileSync(path.join(CONFIG.outputDir, 'results.json'), JSON.stringify({
    monthKey, generatedAt: new Date().toISOString(), dryRun: CONFIG.dryRun, minUnits: CONFIG.minUnits,
    eventsFetched: events.length, counts, filed, failed, unmatchedSites, unknownWorkers, results: summary,
  }, null, 2));

  console.log(`\nDone — ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}. Filed ${filed}, failed ${failed}.`);
  console.log('Details: scraper/output/results.json; PDFs: scraper/output/pdfs/');
  if (failed) process.exitCode = 1;
}

run().catch(err => {
  if (err instanceof SessionExpiredError) {
    console.error(`\n${err.message}. Run \`npm run setup:session\` on the runner and sign in again.`);
  } else {
    console.error(`\nFatal: ${err.message}`);
  }
  process.exit(1);
});
