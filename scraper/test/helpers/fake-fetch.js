// Preloaded (node -r) by run.test.js: stands in for MyLoneWorkers and the
// portal so the whole scrape can run offline. Every portal call is appended
// to FAKE_LOG as one JSON line.
const fs = require('fs');
const { septemberEvents } = require('../fixtures');

const events = septemberEvents();
const log = entry => fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(entry) + '\n');
let pdf;

globalThis.fetch = async (url, init = {}) => {
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
  if (url.includes('/api/v3/events')) {
    if (process.env.FAKE_MLW_STATUS) return new Response('no', { status: Number(process.env.FAKE_MLW_STATUS) });
    if (body.want_count) return Response.json({ total: 0 });
    const page = events.filter(e => e.scanTimestamp >= body.fromDate && e.scanTimestamp <= body.toDate);
    return Response.json(body.offset ? [] : page);
  }
  if (url.includes('printMobileForm')) {
    if (!pdf) {
      const { PDFDocument } = require('pdf-lib');
      const d = await PDFDocument.create();
      d.addPage();
      pdf = Buffer.from(await d.save());
    }
    return new Response(pdf, { headers: { 'content-type': 'application/pdf' } });
  }
  if (url.startsWith('http://portal.test/api/ingest/pdf')) {
    const q = new URL(url).searchParams;
    log({ procedure: 'upload', auth: init.headers.authorization, json: { monthKey: q.get('monthKey'), property: q.get('property'), bytes: init.body.length, pdf: init.body.subarray(0, 4).toString() } });
    if (process.env.FAKE_NO_UPLOAD) return new Response('Cannot POST', { status: 404 });
    return Response.json({ url: `/files/inspections/${q.get('monthKey')}/${q.get('property')}.pdf`, size: init.body.length });
  }
  if (url.startsWith('http://portal.test/api/trpc/')) {
    const procedure = url.slice('http://portal.test/api/trpc/'.length);
    const json = { ...body.json };
    if (json.fileBase64) json.fileBase64 = `<${json.fileBase64.length} chars>`;
    log({ procedure, auth: init.headers.authorization, json });
    const data = procedure === 'scraper.begin' ? { id: json.runId ?? 99 } : { success: true };
    return Response.json({ result: { data: { json: data } } });
  }
  throw new Error(`unexpected fetch ${url}`);
};
