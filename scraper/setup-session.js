/**
 * setup-session.js — one-time interactive login.
 *
 * Opens a real browser window with a persistent profile directory and waits for
 * you to sign in to MyLoneWorkers by hand. The session cookies persist in that
 * profile, so later headless scrape runs reuse it and no password is ever
 * stored in this repo, in CI secrets, or in the environment.
 *
 * Re-run this if a scrape reports that the session expired.
 *
 *   npm run setup:session
 */
const puppeteer = require('puppeteer');
const path = require('path');

const URL = process.env.MLW_URL || 'https://app.myloneworkers.com/patrolWeb/events-browser';
const PROFILE_DIR = process.env.MLW_PROFILE_DIR || path.join(require('os').homedir(), '.mlw-runner', 'browser-profile');

(async () => {
  console.log(`Profile directory: ${PROFILE_DIR}`);
  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: PROFILE_DIR,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const [page] = await browser.pages();
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

  console.log('\nSign in in the browser window that just opened.');
  console.log('Waiting for a signed-in session (up to 5 minutes)...\n');

  // Wait for a POSITIVE signal, not merely the absence of a password field.
  // MyLoneWorkers is an Angular app: right after navigation the login form has
  // not hydrated yet, so "no password input" is briefly true even when signed
  // out — which previously reported a false success.
  const signedIn = async () => {
    const url = page.url();
    if (/\/login/i.test(url)) return false;
    const hasPassword = await page.$('input[type="password"]').catch(() => null);
    return !hasPassword;
  };

  const deadline = Date.now() + 5 * 60 * 1000;
  let ok = false;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    if (await signedIn()) { ok = true; break; }
  }

  if (ok) {
    // Confirm by reloading the target page and checking we are not bounced
    // back to the login route.
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    if (/\/login/i.test(page.url())) {
      console.error(`Still redirected to ${page.url()} — session did not stick.`);
      process.exitCode = 1;
    } else {
      console.log(`Signed in and verified at ${page.url()}`);
      console.log('Session saved. Scrape runs will reuse it.');
    }
  } else {
    console.error('Timed out waiting for sign-in. Nothing verified.');
    process.exitCode = 1;
  }

  await browser.close();
})().catch(err => { console.error(err); process.exit(1); });
