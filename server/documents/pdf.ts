import PDFDocument from "pdfkit";

/**
 * One PDF builder for every generated document (invoices, payslips, Form 16, completion reports,
 * letters). Standard Helvetica only — no font files to ship — so amounts are written "Rs." (D-53).
 */
export type PdfBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string; size?: number; bold?: boolean; align?: "left" | "right" | "center" }
  | { type: "kv"; rows: [string, string][]; columns?: 1 | 2 }
  | { type: "table"; columns: { header: string; width: number; align?: "left" | "right" }[]; rows: string[][]; totals?: string[] }
  | { type: "spacer"; height?: number }
  | { type: "signature"; lines: string[] }
  | { type: "pageBreak" };

export type PdfSpec = {
  title: string;
  /** Letterhead lines, e.g. firm name, address, GSTIN. */
  header?: string[];
  subtitle?: string;
  blocks: PdfBlock[];
  footer?: string;
  /** Stamped diagonally on drafts. */
  watermark?: string;
};

const MARGIN = 48;
const INK = "#1f2937";
const MUTED = "#6b7280";
const LINE = "#d1d5db";

export function buildPdf(spec: PdfSpec): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, info: { Title: spec.title, Producer: "QEPEX Work Tracker" }, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const width = doc.page.width - MARGIN * 2;

  const ensure = (h: number) => {
    if (doc.y + h > doc.page.height - MARGIN - 24) doc.addPage();
  };

  if (spec.header?.length) {
    doc.font("Helvetica-Bold").fontSize(14).fillColor(INK).text(spec.header[0]!, { width });
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
    for (const l of spec.header.slice(1)) doc.text(l, { width });
    doc.moveDown(0.4).strokeColor(LINE).lineWidth(0.8).moveTo(MARGIN, doc.y).lineTo(MARGIN + width, doc.y).stroke().moveDown(0.6);
  }
  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text(spec.title, { width, align: "center" });
  if (spec.subtitle) doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(spec.subtitle, { width, align: "center" });
  doc.moveDown(0.8);

  for (const b of spec.blocks) {
    switch (b.type) {
      case "heading":
        ensure(30);
        doc.moveDown(0.3).font("Helvetica-Bold").fontSize(10.5).fillColor(INK).text(b.text, MARGIN, doc.y, { width }).moveDown(0.3);
        break;
      case "text":
        ensure(20);
        doc.font(b.bold ? "Helvetica-Bold" : "Helvetica").fontSize(b.size ?? 9.5).fillColor(INK).text(b.text, MARGIN, doc.y, { width, align: b.align ?? "left" }).moveDown(0.4);
        break;
      case "spacer":
        doc.moveDown((b.height ?? 10) / 12);
        break;
      case "pageBreak":
        doc.addPage();
        break;
      case "kv": {
        const cols = b.columns ?? 1;
        const colW = width / cols;
        for (let i = 0; i < b.rows.length; i += cols) {
          ensure(16);
          const y = doc.y;
          let maxY = y;
          for (let c = 0; c < cols; c += 1) {
            const row = b.rows[i + c];
            if (!row) continue;
            const x = MARGIN + c * colW;
            doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(row[0], x, y, { width: colW * 0.4 - 6 });
            doc.font("Helvetica").fontSize(9).fillColor(INK).text(row[1] || "—", x + colW * 0.4, y, { width: colW * 0.6 - 8 });
            maxY = Math.max(maxY, doc.y);
          }
          doc.y = maxY + 3;
        }
        doc.x = MARGIN;
        doc.moveDown(0.4);
        break;
      }
      case "table": {
        const total = b.columns.reduce((s, c) => s + c.width, 0);
        const widths = b.columns.map((c) => (c.width / total) * width);
        const drawRow = (cells: string[], bold: boolean, shade: boolean) => {
          doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
          const h = Math.max(...cells.map((t, i) => doc.heightOfString(t ?? "", { width: widths[i]! - 8 }))) + 8;
          ensure(h);
          const y = doc.y;
          if (shade) doc.rect(MARGIN, y, width, h).fill("#f3f4f6");
          let x = MARGIN;
          cells.forEach((t, i) => {
            doc.fillColor(INK).text(t ?? "", x + 4, y + 4, { width: widths[i]! - 8, align: b.columns[i]!.align ?? "left" });
            x += widths[i]!;
          });
          doc.strokeColor(LINE).lineWidth(0.5).moveTo(MARGIN, y + h).lineTo(MARGIN + width, y + h).stroke();
          doc.y = y + h;
        };
        drawRow(b.columns.map((c) => c.header), true, true);
        for (const r of b.rows) drawRow(r, false, false);
        if (b.totals) drawRow(b.totals, true, true);
        doc.x = MARGIN;
        doc.moveDown(0.6);
        break;
      }
      case "signature":
        ensure(70);
        doc.moveDown(2);
        for (const l of b.lines) doc.font("Helvetica").fontSize(9).fillColor(INK).text(l, MARGIN, doc.y, { width, align: "right" });
        doc.moveDown(0.5);
        break;
    }
  }

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);
    // Writing in the bottom margin would otherwise make pdfkit add a blank page.
    doc.page.margins.bottom = 0;
    if (spec.watermark) {
      doc.save().rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] }).font("Helvetica-Bold").fontSize(64).fillColor("#e5e7eb", 0.6)
        .text(spec.watermark, 0, doc.page.height / 2 - 40, { width: doc.page.width, align: "center", lineBreak: false }).restore();
    }
    const footer = `${spec.footer ? `${spec.footer}  ·  ` : ""}Page ${i + 1} of ${pages.count}`;
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(footer, MARGIN, doc.page.height - MARGIN + 8, { width, align: "center", lineBreak: false });
  }
  doc.end();
  return done;
}

/** Indian grouping for PDFs, e.g. 12,34,567.00 — paise in, "Rs. 12,34,567.00" out. */
export function rs(paise: number, withSymbol = true) {
  const neg = paise < 0;
  const v = Math.abs(paise);
  const whole = Math.floor(v / 100).toString();
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const s = `${rest ? `${rest},` : ""}${last3}.${String(v % 100).padStart(2, "0")}`;
  return `${neg ? "-" : ""}${withSymbol ? "Rs. " : ""}${s}`;
}
