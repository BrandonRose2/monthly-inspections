// Small PDF builder for the portal's downloadable reports (Summary, Compare,
// Pre-Due). Plain text tables, letter size, the portal's navy header.
import { jsPDF } from "jspdf";
import { pdfFileName } from "@shared/properties";

export interface ReportSection {
  title: string;
  /** Header background, as RGB. */
  tint?: [number, number, number];
  headers: string[];
  /** Relative column widths; defaults to equal. */
  widths?: number[];
  rows: string[][];
}

export interface ReportSpec {
  title: string;
  subtitle: string;
  stats?: { label: string; value: string }[];
  sections: ReportSection[];
  emptyMessage?: string;
}

const NAVY: [number, number, number] = [30, 45, 74];
const MARGIN = 40;

export function buildReportPdf(spec: ReportSpec): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const inner = W - MARGIN * 2;
  let y = MARGIN;

  const ensure = (h: number) => {
    if (y + h > H - MARGIN - 16) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // Header band
  doc.setFillColor(...NAVY);
  doc.roundedRect(MARGIN, y, inner, 46, 4, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(15).text(spec.title, MARGIN + 12, y + 20);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(147, 180, 216).text(spec.subtitle, MARGIN + 12, y + 35);
  y += 58;

  if (spec.stats?.length) {
    const w = inner / spec.stats.length;
    doc.setDrawColor(229, 231, 235);
    doc.rect(MARGIN, y, inner, 40);
    spec.stats.forEach((s, i) => {
      const cx = MARGIN + w * i + w / 2;
      if (i) doc.line(MARGIN + w * i, y, MARGIN + w * i, y + 40);
      doc.setTextColor(30, 45, 74).setFont("helvetica", "bold").setFontSize(15).text(s.value, cx, y + 18, { align: "center" });
      doc.setTextColor(107, 114, 128).setFont("helvetica", "normal").setFontSize(7.5).text(s.label, cx, y + 31, { align: "center" });
    });
    y += 52;
  }

  if (!spec.sections.some(s => s.rows.length) && spec.emptyMessage) {
    doc.setTextColor(22, 163, 74).setFont("helvetica", "bold").setFontSize(11).text(spec.emptyMessage, W / 2, y + 14, { align: "center" });
    y += 30;
  }

  for (const section of spec.sections) {
    if (!section.rows.length) continue;
    const widths = section.widths ?? section.headers.map(() => 1);
    const total = widths.reduce((a, b) => a + b, 0);
    const cols = widths.map(w => (w / total) * inner);

    ensure(40);
    doc.setFillColor(...(section.tint ?? [240, 244, 248]));
    doc.rect(MARGIN, y, inner, 16, "F");
    doc.setTextColor(30, 45, 74).setFont("helvetica", "bold").setFontSize(8).text(section.title.toUpperCase(), MARGIN + 6, y + 11);
    y += 20;

    const drawRow = (cells: string[], bold: boolean) => {
      doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(8).setTextColor(bold ? 75 : 31, bold ? 85 : 41, bold ? 99 : 55);
      const lines = cells.map((c, i) => doc.splitTextToSize(c ?? "", cols[i] - 8) as string[]);
      const h = Math.max(...lines.map(l => l.length)) * 10 + 4;
      ensure(h);
      let x = MARGIN;
      lines.forEach((l, i) => {
        doc.text(l, x + 4, y + 9);
        x += cols[i];
      });
      y += h;
      doc.setDrawColor(243, 244, 246).line(MARGIN, y, MARGIN + inner, y);
    };
    drawRow(section.headers, true);
    for (const r of section.rows) drawRow(r, false);
    y += 10;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(156, 163, 175);
    doc.text(`Generated ${new Date().toLocaleString()} · ApartmentCorp Monthly Inspections`, MARGIN, H - MARGIN + 10);
    doc.text(`${i} / ${pages}`, W - MARGIN, H - MARGIN + 10, { align: "right" });
  }
  return doc;
}

export function downloadReportPdf(spec: ReportSpec, name: string) {
  buildReportPdf(spec).save(pdfFileName(name));
}
