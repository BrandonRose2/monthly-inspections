/**
 * One-page-per-property inspection report, built from the API data.
 *
 * Replaces the old approach of clicking "Export to PDF" in the Events Browser,
 * which exported whatever a worker's login did — including scans at other
 * properties — and failed whenever the page's markup changed.
 */
const PDFDocument = require('pdfkit');
const { formatLocal } = require('./time');

const STATUS_LABEL = {
  pass: 'PASSED',
  late: 'COMPLETED LATE',
  partial: 'PARTIAL',
  other_sites_only: 'NOT INSPECTED',
  tour_no_scans: 'NO UNITS SCANNED',
  no_activity: 'NOT INSPECTED',
};

function unitLabel(e) {
  return e.checkpoint?.name || e.checkpoint_details || `Checkpoint ${e.checkpoint?.ID ?? '?'}`;
}

/** @returns {Promise<Buffer>} */
function buildReportPdf({ result, monthLabel, windows, generatedAt = new Date() }) {
  const tz = windows.timeZone;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, info: {
      Title: `${result.property} — Monthly Inspection — ${monthLabel}`,
      Author: 'ApartmentCorp Monthly Inspections',
    } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).font('Helvetica-Bold').text(`${result.property}`, { continued: false });
    doc.fontSize(11).font('Helvetica').fillColor('#555')
      .text(`${result.region}  ·  Monthly inspection  ·  ${monthLabel}`);
    doc.moveDown(0.8);

    doc.fillColor('#000').fontSize(13).font('Helvetica-Bold')
      .text(STATUS_LABEL[result.status] || result.status.toUpperCase());
    doc.fontSize(10.5).font('Helvetica').text(result.note);
    doc.moveDown(0.8);

    const inspectors = result.inspectors?.length ? result.inspectors.join(', ') : '—';
    doc.fontSize(10).fillColor('#333')
      .text(`Units scanned: ${result.units}   ·   On time: ${result.onTimeUnits}   ·   Forms filed: ${result.forms ?? 0}   ·   Inspector(s): ${inspectors}`)
      .text(`Due by: ${formatLocal(windows.dueEnd, tz)} (${tz})`);
    doc.moveDown(1);

    // Table
    const cols = [
      { h: 'Date / time', w: 130 },
      { h: 'Unit / checkpoint', w: 180 },
      { h: 'Inspector', w: 140 },
      { h: 'Form', w: 45 },
      { h: 'Tour', w: 45 },
    ];
    const x0 = doc.page.margins.left;
    const drawRow = (cells, bold) => {
      const y = doc.y;
      let x = x0;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000');
      cells.forEach((c, i) => {
        doc.text(String(c), x, y, { width: cols[i].w - 6, ellipsis: true, lineBreak: false });
        x += cols[i].w;
      });
      doc.moveDown(0.9);
      doc.x = x0;
      if (doc.y > doc.page.height - doc.page.margins.bottom - 20) doc.addPage();
    };

    drawRow(cols.map(c => c.h), true);
    doc.moveTo(x0, doc.y - 3).lineTo(x0 + cols.reduce((a, c) => a + c.w, 0), doc.y - 3).strokeColor('#999').stroke();

    if (!result.scans.length) {
      doc.font('Helvetica-Oblique').fontSize(9.5).text('No unit scans recorded for this property this month.', x0);
    }
    for (const e of result.scans) {
      const late = e.scanTimestamp > windows.dueEnd ? '  (late)' : '';
      drawRow([
        formatLocal(e.scanTimestamp, tz) + late,
        unitLabel(e),
        String(e.guard_details || '').replace(/\s*\([0-9a-f]{10}\)\s*$/i, ''),
        e.formID ? 'yes' : '—',
        e.patrolID ?? '',
      ]);
    }

    doc.moveDown(1.5);
    doc.font('Helvetica').fontSize(8).fillColor('#777')
      .text(`Source: MyLoneWorkers events API. Scans credited by checkpoint site.${result.forms ? " The pages after this one are MyLoneWorkers' own forms report for these scans." : ''} Generated ${generatedAt.toLocaleString('en-US', { timeZone: tz })}.`, x0);

    doc.end();
  });
}

module.exports = { buildReportPdf, STATUS_LABEL };
