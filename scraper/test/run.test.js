const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { monthRange } = require('../lib/time');

function scrape(env) {
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scrape-')), 'calls.jsonl');
  fs.writeFileSync(log, '');
  const out = spawnSync(process.execPath, ['-r', './test/helpers/fake-fetch.js', 'scrape-inspections.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORTAL_BASE_URL: 'http://portal.test', INGEST_TOKEN: 'tok', MLW_TOKEN: 'mlw', FAKE_LOG: log, GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '77', ...env },
    encoding: 'utf8',
  });
  const calls = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  return { ...out, calls };
}

test('monthRange spans years and rejects bad input', () => {
  assert.deepEqual(monthRange('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepEqual(monthRange('2026-03', '2026-02'), []);
  assert.throws(() => monthRange('2026-13', '2026-12'));
});

test('a portal-started range run reports progress for every month and files results', () => {
  const { status, calls, stderr } = scrape({ RUN_ID: '12', START_MONTH: '2026-08', END_MONTH: '2026-09' });
  assert.equal(status, 0, stderr);
  assert.ok(calls.every(c => c.auth === 'Bearer tok'));

  const begin = calls[0];
  assert.equal(begin.procedure, 'scraper.begin');
  assert.deepEqual(begin.json, { runId: 12, startMonthKey: '2026-08', endMonthKey: '2026-09', githubRunUrl: 'https://github.com/o/r/actions/runs/77' });

  const progress = calls.filter(c => c.procedure === 'scraper.progress');
  assert.ok(progress.every(c => c.json.id === 12));
  assert.deepEqual(progress.filter(c => c.json.completedMonths && !c.json.status).map(c => c.json.completedMonths), [1, 2]);
  assert.ok(progress.some(c => c.json.currentMonthKey === '2026-08'));
  assert.ok(progress.some(c => c.json.currentProperty === 'Breckenridge Village'));

  const last = progress.at(-1).json;
  assert.equal(last.status, 'completed');
  assert.match(last.progressMessage, /passed · \d+ issues · \d+ PDFs/);

  const filed = calls.filter(c => c.procedure === 'inspections.ingestInspectionResult');
  const months = new Set(filed.map(c => c.json.monthKey));
  assert.deepEqual([...months].sort(), ['2026-08', '2026-09']);
  const brk = filed.find(c => c.json.monthKey === '2026-09' && c.json.property === 'Breckenridge Village');
  assert.equal(brk.json.checked, true);
  // PDFs go up as raw bytes, then the result points at the stored file.
  assert.equal(brk.json.fileBase64, undefined);
  assert.equal(brk.json.pdfUrl, '/files/inspections/2026-09/Breckenridge Village.pdf');
  const up = calls.find(c => c.procedure === 'upload' && c.json.property === 'Breckenridge Village' && c.json.monthKey === '2026-09');
  assert.equal(up.json.pdf, '%PDF');
  assert.equal(up.auth, 'Bearer tok');
  assert.equal(last.total, filed.length);
  assert.equal(last.passed, filed.filter(c => c.json.checked).length);
});

test('falls back to base64 when the portal has no upload route yet', () => {
  const { status, calls, stderr } = scrape({ RUN_ID: '4', MONTH: '2026-09', ONLY: 'Breckenridge Village', FAKE_NO_UPLOAD: '1' });
  assert.equal(status, 0, stderr);
  const filed = calls.find(c => c.procedure === 'inspections.ingestInspectionResult');
  assert.match(filed.json.fileBase64, /chars/);
  assert.equal(filed.json.pdfUrl, undefined);
});

test('a mapping test files only the chosen properties', () => {
  const { status, calls, stderr } = scrape({ RUN_ID: '5', MONTH: '2026-09', ONLY: 'Lexington,Grace Townhomes' });
  assert.equal(status, 0, stderr);
  assert.deepEqual(calls[0].json.properties, ['Lexington', 'Grace Townhomes']);
  const filed = calls.filter(c => c.procedure === 'inspections.ingestInspectionResult').map(c => c.json.property).sort();
  assert.deepEqual(filed, ['Grace Townhomes', 'Lexington']);
});

test('an inverted range is rejected before anything is filed', () => {
  const { status, calls } = scrape({ RUN_ID: '8', START_MONTH: '2026-09', END_MONTH: '2026-08' });
  assert.equal(status, 1);
  assert.equal(calls.length, 0);
});

test('an expired MyLoneWorkers session marks the run failed with the fix', () => {
  const { status, calls } = scrape({ RUN_ID: '9', MONTH: '2026-09', FAKE_MLW_STATUS: '401' });
  assert.equal(status, 1);
  const last = calls.at(-1);
  assert.equal(last.procedure, 'scraper.progress');
  assert.equal(last.json.status, 'failed');
  assert.match(last.json.errorMessage, /setup:session/);
});

test('a scheduled run with no RUN_ID creates its own run', () => {
  const { status, calls, stderr } = scrape({ MONTH: '2026-09', ONLY: 'Crossroads' });
  assert.equal(status, 0, stderr);
  assert.equal(calls[0].json.runId, undefined);
  assert.ok(calls.filter(c => c.procedure === 'scraper.progress').every(c => c.json.id === 99));
});

test('dry runs report nothing to the portal', () => {
  const { status, calls, stderr } = scrape({ DRY_RUN: 'true', RUN_ID: '3', MONTH: '2026-09', ONLY: 'Crossroads' });
  assert.equal(status, 0, stderr);
  assert.equal(calls.length, 0);
});
