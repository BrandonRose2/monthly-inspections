const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const { fetchFormsPdfs, FORMS_URL, FORMS_PER_REQUEST, SessionExpiredError } = require('../lib/mlw-api');
const { mergePdfs } = require('../lib/pdf-merge');

async function tinyPdf(pages) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage();
  return Buffer.from(await d.save());
}

test('forms endpoint is printMobileForm next to the events endpoint', () => {
  assert.equal(FORMS_URL, 'https://ws.myloneworkers.com/api/v3/printMobileForm');
});

test('requests the forms report in chunks with the body the site sends', async t => {
  const calls = [];
  const pdf = await tinyPdf(2);
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body), token: opts.headers['x-access-token'] });
    return new Response(pdf, { status: 200, headers: { 'content-type': 'application/pdf' } });
  });
  const ids = Array.from({ length: FORMS_PER_REQUEST + 3 }, (_, i) => 1242000 + i);
  const parts = await fetchFormsPdfs('tok', [...ids, ids[0], null]);
  assert.equal(parts.length, 2);
  assert.equal(calls[0].body.reportType, 'pdf');
  assert.equal(typeof calls[0].body.FormSubmissions, 'string'); // a JSON string, as the site sends
  assert.deepEqual(JSON.parse(calls[0].body.FormSubmissions), ids.slice(0, FORMS_PER_REQUEST));
  assert.deepEqual(JSON.parse(calls[1].body.FormSubmissions), ids.slice(FORMS_PER_REQUEST));
  assert.equal(calls[0].token, 'tok');
  const merged = await PDFDocument.load(await mergePdfs([await tinyPdf(1), ...parts]));
  assert.equal(merged.getPageCount(), 5);
});

test('an expired session is reported as such; a non-PDF reply is an error', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 401 }));
  await assert.rejects(fetchFormsPdfs('tok', [1]), SessionExpiredError);
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>oops</html>', { status: 200 }));
  await assert.rejects(fetchFormsPdfs('tok', [1]), /forms report request failed/);
});
