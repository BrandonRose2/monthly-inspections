/**
 * Use the runner's signed-in browser profile.
 *
 * The persistent Chrome profile (created by `npm run setup:session`) holds the
 * MyLoneWorkers login. We open the Events Browser once, read the API token the
 * site itself sends, and close the browser; everything else goes through the
 * JSON API.
 *
 * The token is only held in memory and never logged or written to disk.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
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

async function saveDiagnostics(page, dir, label) {
  if (!dir || !page) return;
  fs.mkdirSync(dir, { recursive: true });
  const stamp = label.replace(/[^a-z0-9_-]/gi, '_');
  try {
    await page.screenshot({ path: path.join(dir, `${stamp}.png`), fullPage: true });
    console.warn(`  diagnostics written: diagnostics/${stamp}.png`);
  } catch { /* best effort */ }
}

function hasCredentials() {
  return Boolean(process.env.MLW_USERNAME && process.env.MLW_PASSWORD);
}

/**
 * Sign in on the MyLoneWorkers login page using MLW_USERNAME / MLW_PASSWORD
 * (GitHub secrets). Used on GitHub-hosted runners, which have no saved profile.
 * The password is typed into the page only; it is never logged or written to disk.
 */
async function signInWithCredentials(page, diagnosticsDir) {
  // Angular hydrates the form after navigation, so wait for a visible password box.
  const pwd = await page.waitForSelector('input[type="password"]', { visible: true, timeout: 30000 }).catch(() => null);
  if (!pwd) {
    await saveDiagnostics(page, diagnosticsDir, 'login-form-missing');
    throw new Error('MyLoneWorkers login page did not show a password field.');
  }
  // The username box is the first visible text-like input on the form.
  const user = await page.evaluateHandle(() => {
    const inputs = [...document.querySelectorAll('input')];
    return inputs.find(el => {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      const visible = el.offsetParent !== null;
      return visible && ['text', 'email', 'tel', ''].includes(t);
    }) || null;
  });
  if (!user || !(await user.asElement())) {
    await saveDiagnostics(page, diagnosticsDir, 'login-form-missing');
    throw new Error('MyLoneWorkers login page did not show a username field.');
  }
  await user.asElement().click({ clickCount: 3 });
  await user.asElement().type(process.env.MLW_USERNAME, { delay: 20 });
  await pwd.click({ clickCount: 3 });
  await pwd.type(process.env.MLW_PASSWORD, { delay: 20 });

  const submit = await page.$('button[type="submit"]');
  if (submit) await submit.click(); else await pwd.press('Enter');

  // Wait until the app leaves the login route.
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline && /\/login/i.test(page.url())) await sleep(500);
  await sleep(1500);
}

/** @returns {Promise<{ browser, page, token }>} caller must browser.close() */
async function openSession({ headless = true, diagnosticsDir, downloadDir } = {}) {
  const browser = await puppeteer.launch({
    headless,
    userDataDir: PROFILE_DIR,
    defaultViewport: { width: 1500, height: 950 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = (await browser.pages())[0] || (await browser.newPage());

    if (downloadDir) {
      fs.mkdirSync(downloadDir, { recursive: true });
      const cdp = await page.target().createCDPSession();
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true }).catch(() => {});
      await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir }).catch(() => {});
    }

    let token = null;
    page.on('request', req => {
      if (token || !req.url().includes('ws.myloneworkers.com')) return;
      const t = req.headers()['x-access-token'];
      if (t && t.split('.').length === 3) token = t;
    });

    await page.goto(MLW_URL, { waitUntil: 'networkidle2', timeout: 90000 });
    for (let i = 0; i < 20 && !token; i++) {
      await sleep(500);
      if (/\/login/i.test(page.url())) break;
    }

    if (/\/login/i.test(page.url()) && hasCredentials()) {
      await signInWithCredentials(page, diagnosticsDir);
      // Reload the target page so the app sends an API request we can read the token from.
      await page.goto(MLW_URL, { waitUntil: 'networkidle2', timeout: 90000 });
      for (let i = 0; i < 20 && !token; i++) {
        await sleep(500);
        if (/\/login/i.test(page.url())) break;
      }
    }

    if (/\/login/i.test(page.url())) {
      await saveDiagnostics(page, diagnosticsDir, 'session-expired');
      throw new Error(hasCredentials()
        ? 'MyLoneWorkers sign-in failed with MLW_USERNAME / MLW_PASSWORD. Check those secrets in GitHub.'
        : 'MyLoneWorkers session has expired. Run `npm run setup:session` on the runner and sign in again.');
    }
    if (!token) {
      const raw = await page.evaluate(() => localStorage.getItem('qrp_api_jwt')).catch(() => null);
      token = tokenFromStorageValue(raw);
    }
    if (!token) {
      await saveDiagnostics(page, diagnosticsDir, 'no-token');
      throw new Error('Signed in, but could not find the MyLoneWorkers API token on the page.');
    }
    return { browser, page, token };
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}

async function getApiToken(opts) {
  const { browser, token } = await openSession(opts);
  await browser.close().catch(() => {});
  return token;
}

module.exports = { getApiToken, openSession, tokenFromStorageValue, saveDiagnostics, PROFILE_DIR, MLW_URL };
