/**
 * scrape-inspections.js
 *
 * Downloads monthly inspection PDFs from MyLoneWorkers and files each one into
 * the inspections portal via its authenticated ingest endpoint.
 *
 * Reuses the browser session established by `npm run setup:session`, so no
 * credentials are read from the environment or stored in this repo.
 *
 *   PORTAL_BASE_URL=https://monthly-inspections.vercel.app \
 *   INGEST_TOKEN=... \
 *   npm run scrape
 *
 * Every failure writes a screenshot and the page HTML to ./diagnostics/ so a
 * broken selector can be diagnosed from real evidence rather than guesswork.
 * The selectors below came from a recovered draft that had never run end to end
 * (it used jQuery/Playwright selector syntax that Puppeteer rejects), so expect
 * the first run to need selector corrections informed by those diagnostics.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG = {
  url: process.env.MLW_URL || 'https://app.myloneworkers.com/patrolWeb/events-browser',
  profileDir: process.env.MLW_PROFILE_DIR || path.join(os.homedir(), '.mlw-runner', 'browser-profile'),
  portalBaseUrl: process.env.PORTAL_BASE_URL,
  ingestToken: process.env.INGEST_TOKEN,
  headless: process.env.HEADLESS !== 'false',
  downloadDir: path.join(__dirname, 'output', 'pdfs'),
  diagnosticsDir: path.join(__dirname, 'diagnostics'),
  dryRun: process.env.DRY_RUN === 'true',
};

// Date range: 1st → 21st of the target month, matching the original tool.
// MONTH ("YYYY-MM") overrides the default of the current month, so past
// months can be back-filled.
function getDateRange() {
  const override = (process.env.MONTH || '').trim();
  let y, m;
  if (override) {
    if (!/^\d{4}-\d{2}$/.test(override)) {
      throw new Error(`MONTH must look like YYYY-MM, got "${override}"`);
    }
    [y, m] = override.split('-');
  } else {
    const now = new Date();
    y = String(now.getFullYear());
    m = String(now.getMonth() + 1).padStart(2, '0');
  }
  return { start: `${y}-${m}-01 00:00:00`, end: `${y}-${m}-21 23:59:59`, label: `${y}-${m}` };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadPropertyMap() {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'property-map.json'), 'utf8'));
  const map = { ...raw.confirmed };
  for (const [k, v] of Object.entries(raw.needs_confirmation || {})) {
    if (v !== null) map[k] = v; // null means "not inspected here" — skip it
  }
  return map;
}

function workerIdsByProperty() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'workers.json'), 'utf8'));
  const skip = new Set(['Admin', 'User blank', 'user', 'Worker47', 'Worker48', 'test pelican']);
  const out = {};
  for (const w of data.workers) {
    if (!w.property || skip.has(w.name)) continue;
    (out[w.property] ||= []).push(w.id);
  }
  for (const g of data.groups || []) {
    out[g.property] = [...new Set([...(out[g.property] || []), ...g.workerIds])];
  }
  return out;
}

async function saveDiagnostics(page, label) {
  fs.mkdirSync(CONFIG.diagnosticsDir, { recursive: true });
  const stamp = label.replace(/[^a-z0-9]/gi, '_');
  try {
    await page.screenshot({ path: path.join(CONFIG.diagnosticsDir, `${stamp}.png`), fullPage: true });
    fs.writeFileSync(path.join(CONFIG.diagnosticsDir, `${stamp}.html`), await page.content());
    console.warn(`     diagnostics written: diagnostics/${stamp}.{png,html}`);
  } catch (e) {
    console.warn(`     could not write diagnostics: ${e.message}`);
  }
}

// Click an element by its visible text using real CDP input events.
//
// An in-page element.click() is not a trusted user gesture, so Chrome treats
// the resulting download as an "automatic download" and blocks every one after
// the first. That produced exactly one successful export per run. Driving the
// click through Puppeteer's input domain makes it a genuine user gesture.
async function clickByText(page, selectors, texts) {
  for (const sel of selectors) {
    for (const handle of await page.$$(sel)) {
      const label = await handle
        .evaluate(el => (el.textContent || '').trim().replace(/\s+/g, ' '))
        .catch(() => '');
      if (!label || !texts.some(t => label.includes(t))) continue;
      const usable = await handle
        .evaluate(el => !el.disabled && !!(el.offsetParent || el.getClientRects().length))
        .catch(() => false);
      if (!usable) continue;
      try {
        await handle.click();          // trusted input, unlike el.click()
        return label;
      } catch {
        // Obscured or detached — fall back to an in-page click so a blocked
        // menu item does not abort the whole property.
        await handle.evaluate(el => el.click()).catch(() => {});
        return label;
      }
    }
  }
  return null;
}

async function fileToPortal({ monthKey, region, property, fileName, buffer }) {
  if (CONFIG.dryRun) {
    console.log(`     DRY_RUN: would file ${fileName} as ${region} / ${property}`);
    return true;
  }
  const res = await fetch(`${CONFIG.portalBaseUrl}/api/trpc/inspections.ingestInspectionPdf`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${CONFIG.ingestToken}`,
    },
    body: JSON.stringify({
      json: {
        monthKey, region, property, fileName,
        fileBase64: buffer.toString('base64'),
        fileSize: buffer.length,
        checked: true,
        note: 'Filed automatically from MyLoneWorkers',
      },
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`portal ingest failed (${res.status}): ${body.slice(0, 300)}`);
  if (body.includes('"error"')) throw new Error(`portal ingest error: ${body.slice(0, 300)}`);
  return true;
}

async function run() {
  if (!CONFIG.dryRun && (!CONFIG.portalBaseUrl || !CONFIG.ingestToken)) {
    throw new Error('PORTAL_BASE_URL and INGEST_TOKEN are required (or set DRY_RUN=true)');
  }

  const range = getDateRange();
  const propertyMap = loadPropertyMap();
  const workerIds = workerIdsByProperty();
  const targets = Object.keys(propertyMap).filter(p => workerIds[p]?.length);
  const missingWorkers = Object.keys(propertyMap).filter(p => !workerIds[p]?.length);

  console.log(`\nMonthly Inspections scrape — ${range.label}`);
  console.log(`Range: ${range.start} -> ${range.end}`);
  console.log(`Mapped properties with workers: ${targets.length}`);
  if (missingWorkers.length) {
    console.warn(`Mapped but no worker IDs found (skipped): ${missingWorkers.join(', ')}`);
  }

  fs.mkdirSync(CONFIG.downloadDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: CONFIG.headless,
    userDataDir: CONFIG.profileDir,
    defaultViewport: { width: 1400, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());

  const cdp = await page.target().createCDPSession();
  // Browser-level first (survives navigations), then page-level as a fallback
  // for older Chrome builds that only implement the page domain.
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow', downloadPath: CONFIG.downloadDir, eventsEnabled: true,
  }).catch(() => {});
  await cdp.send('Page.setDownloadBehavior', {
    behavior: 'allow', downloadPath: CONFIG.downloadDir,
  }).catch(() => {});

  await page.goto(CONFIG.url, { waitUntil: 'networkidle2', timeout: 60000 });

  // The persistent profile should already be signed in. Never type a password
  // here: if the session is gone, stop and ask for an interactive setup run.
  // Check the URL as well as the form — the app is Angular, so immediately
  // after navigation the login form has not hydrated and testing only for a
  // password input reports a false "signed in".
  await sleep(2000);
  const onLoginPage = /\/login/i.test(page.url());
  const hasPasswordField = !!(await page.$('input[type="password"]').catch(() => null));
  if (onLoginPage || hasPasswordField) {
    await saveDiagnostics(page, 'session-expired');
    await browser.close();
    throw new Error(`Not signed in (url: ${page.url()}). Run \`npm run setup:session\` on the runner to re-establish the session.`);
  }

  // Set the reporting window. The pickers are Syncfusion datetimepickers with
  // stable ids and a "YYYY-MM-DD HH:mm:ss" display format; they default to
  // today, so without this the export would only cover the current day.
  async function setDateRange() {
    for (const [sel, value] of [['#fromDatePicker_input', range.start],
                                ['#toDatePicker_input', range.end]]) {
      const el = await page.$(sel);
      if (!el) throw new Error(`date input ${sel} not found`);
      await el.click({ clickCount: 3 });   // select the existing text
      await el.type(value, { delay: 15 });
      await page.keyboard.press('Enter');
      await sleep(400);
    }
    const applied = await page.evaluate(() => ({
      from: document.querySelector('#fromDatePicker_input')?.value || '',
      to: document.querySelector('#toDatePicker_input')?.value || '',
    }));
    console.log(`Date range applied: ${applied.from} -> ${applied.to}`);
    if (!applied.from.startsWith(range.label) || !applied.to.startsWith(range.label)) {
      throw new Error(`date range did not take (got ${applied.from} -> ${applied.to})`);
    }
  }

  await setDateRange();

  const results = [];
  let filed = 0, failed = 0;

  for (const mlwName of targets) {
    const dest = propertyMap[mlwName];
    const destinations = Array.isArray(dest) ? dest : [dest];
    console.log(`\n- ${mlwName} -> ${destinations.map(d => d.property).join(' + ')}`);

    try {
      // Every export downloads under the same date-range filename
      // ("Events report_01_08_2026_21_08_2026.pdf"), so a later download
      // overwrites the earlier one instead of appearing as a new name.
      // Comparing against a snapshot of filenames therefore missed every
      // export after the first. Clear the directory and wait for any PDF.
      for (const f of fs.readdirSync(CONFIG.downloadDir)) {
        fs.unlinkSync(path.join(CONFIG.downloadDir, f));
      }

      // Select this property's workers, then export the visible events to PDF.
      //
      // The guard list is a Syncfusion grid: each tr.e-row holds the worker ID
      // in its first cell and the checkbox (input.e-checkselect) in the second.
      // The checkbox's own container carries no text, so matching the ID has to
      // walk the row's cells rather than the checkbox's ancestors.
      const ids = workerIds[mlwName];
      const selected = await page.evaluate((wanted) => {
        const rows = [...document.querySelectorAll('tr.e-row')];
        let hits = 0;
        for (const tr of rows) {
          const cb = tr.querySelector('input.e-checkselect');
          if (!cb) continue;
          const rowId = (tr.querySelector('td')?.textContent || '').trim();
          const want = wanted.includes(rowId);
          if (want !== cb.checked) cb.click();
          if (want) hits++;
        }
        return hits;
      }, ids);

      if (!selected) throw new Error(`no worker checkboxes matched ids ${ids.join(', ')}`);
      await sleep(1500);

      // Changing filters does not reload the grid on its own — the refresh
      // button must be clicked, and until events load the export control stays
      // disabled. Verified against the live site.
      await page.evaluate(() => {
        const r = document.querySelector('button.refresh-btn');
        if (r && !r.disabled) r.click();
      });
      await sleep(6000);

      const state = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
          .find(b => (b.textContent || '').includes('Export To'));
        const text = document.body.innerText;
        return {
          exportDisabled: btn ? btn.disabled : true,
          noRecords: /No records to display/i.test(text),
          total: (text.match(/Total Events:\s*(\d+)/i) || [null, '0'])[1],
        };
      });

      if (state.noRecords || state.total === '0') {
        console.log(`     no events in ${range.label} — nothing to file`);
        results.push({ mlwName, destinations, events: 0, skipped: true, ok: true });
        continue;
      }
      console.log(`     ${state.total} events`);
      if (state.exportDisabled) throw new Error('export control still disabled after refresh');

      await cdp.send('Browser.setDownloadBehavior', {
        behavior: 'allow', downloadPath: CONFIG.downloadDir, eventsEnabled: true,
      }).catch(() => {});

      const exportClicked = await clickByText(page, ['button', 'a', '[role="button"]'], ['Export To', 'Export to']);
      if (!exportClicked) throw new Error('Export control not found');
      await sleep(800);

      // The menu renders as button.mat-menu-item — not li/a/[role=menuitem],
      // which is why the recovered draft could never have found it. Match the
      // exact label rather than any text containing "PDF".
      const pdfClicked = await clickByText(
        page,
        ['button.mat-menu-item', '.mat-menu-item', 'button', 'li', '[role="menuitem"]'],
        ['Export to PDF']
      );
      if (!pdfClicked) throw new Error('"Export to PDF" menu item not found');

      // Wait for a completed PDF: present, no .crdownload partial alongside it,
      // and a stable size across two polls.
      let newFile = null, lastSize = -1;
      for (let i = 0; i < 40; i++) {
        await sleep(1000);
        const files = fs.readdirSync(CONFIG.downloadDir);
        if (files.some(f => f.endsWith('.crdownload'))) continue;
        const pdf = files.find(f => f.toLowerCase().endsWith('.pdf'));
        if (!pdf) continue;
        const size = fs.statSync(path.join(CONFIG.downloadDir, pdf)).size;
        if (size > 0 && size === lastSize) { newFile = pdf; break; }
        lastSize = size;
      }
      if (!newFile) throw new Error('no PDF appeared in the download directory');

      const buffer = fs.readFileSync(path.join(CONFIG.downloadDir, newFile));
      if (buffer.subarray(0, 4).toString() !== '%PDF') throw new Error('downloaded file is not a PDF');

      for (const d of destinations) {
        const fileName = `${d.property.replace(/[^a-z0-9]/gi, '_')}_${range.label}.pdf`;
        await fileToPortal({ monthKey: range.label, region: d.region, property: d.property, fileName, buffer });
        console.log(`     filed: ${d.region} / ${d.property} (${buffer.length} bytes)`);
        filed++;
      }
      results.push({ mlwName, destinations, bytes: buffer.length, ok: true });
    } catch (err) {
      failed++;
      console.warn(`     FAILED: ${err.message}`);
      await saveDiagnostics(page, `fail-${mlwName}`);
      results.push({ mlwName, error: err.message, ok: false });
    }
  }

  await browser.close();

  fs.writeFileSync(
    path.join(__dirname, 'output', 'results.json'),
    JSON.stringify({ monthKey: range.label, filed, failed, results }, null, 2)
  );

  console.log(`\nDone — filed ${filed}, failed ${failed}. See scraper/output/results.json`);
  if (failed) process.exitCode = 1;
}

run().catch(err => { console.error(`\nFatal: ${err.message}`); process.exit(1); });
