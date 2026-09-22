/** Concatenate PDFs (cover page first, then MyLoneWorkers' forms report). */
const { PDFDocument } = require('pdf-lib');

async function mergePdfs(buffers) {
  const out = await PDFDocument.create();
  for (const buf of buffers.filter(Boolean)) {
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach(p => out.addPage(p));
  }
  return Buffer.from(await out.save());
}

module.exports = { mergePdfs };
