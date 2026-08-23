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
  console.log('Waiting for the password field to disappear (up to 5 minutes)...\n');

  const deadline = Date.now() + 5 * 60 * 1000;
  let signedIn = false;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const hasPassword = await page.$('input[type="password"]').catch(() => null);
    if (!hasPassword) { signedIn = true; break; }
  }

  if (signedIn) {
    console.log('Signed in. Session saved to the profile directory.');
    console.log('You can close the browser window; scrape runs will reuse this session.');
  } else {
    console.error('Timed out waiting for sign-in. Nothing was saved as verified.');
    process.exitCode = 1;
  }

  await browser.close();
})().catch(err => { console.error(err); process.exit(1); });
