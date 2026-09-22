/**
 * Borrow the API token from the signed-in browser profile.
 *
 * The runner's persistent Chrome profile (created by `npm run setup:session`)
 * holds the MyLoneWorkers login. We open the Events Browser once, read the
 * token the site itself sends on its API calls, and close the browser. After
 * that everything goes through the JSON API — no clicking, no selectors, no
 * PDF downloads to wait on.
 *
 * The token is only held in memory and never logged or written to disk.
 */
const puppeteer = require('puppeteer');
const os = require('os');
const path = require('path');

const MLW_URL = process.env.MLW_URL || 'https://app.myloneworkers.com/patrolWeb/events-browser';
const PROFILE_DIR = process.env.MLW_PROFILE_DIR || path.join(os.homedir(), '.mlw-runner', 'browser-profile');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function tokenFromStorageValue(raw) {
  if (!raw) return null;
  let v = raw;
  try {
    const parsed = JSON.parse(raw);
    v = typeof parsed === 'string' ? parsed : parsed?.token || parsed?.jwt || parsed?.access_token || null;
  } catch { /* stored as a bare string */ }
  return typeof v === 'string' && v.split('.').length === 3 ? v : null;
}

async function getApiToken({ headless = true, diagnosticsDir } = {}) {
  const browser = await puppeteer.launch({
    headless,
    userDataDir: PROFILE_DIR,
    defaultViewport: { width: 1400, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = (await browser.pages())[0] || (await browser.newPage());

    // Preferred source: the header on the site's own API requests.
    let captured = null;
    page.on('request', req => {
      if (captured || !req.url().includes('ws.myloneworkers.com')) return;
      const t = req.headers()['x-access-token'];
      if (t && t.split('.').length === 3) captured = t;
    });

    await page.goto(MLW_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    for (let i = 0; i < 20 && !captured; i++) {
      await sleep(500);
      if (/\/login/i.test(page.url())) break;
    }

    if (/\/login/i.test(page.url())) {
      if (diagnosticsDir) await saveDiagnostics(page, diagnosticsDir, 'session-expired');
      throw new Error('MyLoneWorkers session has expired. Run `npm run setup:session` on the runner and sign in again.');
    }

    // Fallback: the site keeps the same token in localStorage.
    if (!captured) {
      const raw = await page.evaluate(() => localStorage.getItem('qrp_api_jwt')).catch(() => null);
      captured = tokenFromStorageValue(raw);
    }
    if (!captured) {
      if (diagnosticsDir) await saveDiagnostics(page, diagnosticsDir, 'no-token');
      throw new Error('Signed in, but could not find the MyLoneWorkers API token on the page.');
    }
    return captured;
  } finally {
    await browser.close();
  }
}

async function saveDiagnostics(page, dir, label) {
  const fs = require('fs');
  fs.mkdirSync(dir, { recursive: true });
  try {
    await page.screenshot({ path: path.join(dir, `${label}.png`), fullPage: true });
    console.warn(`  diagnostics written: diagnostics/${label}.png`);
  } catch { /* best effort */ }
}

module.exports = { getApiToken, tokenFromStorageValue, PROFILE_DIR };
