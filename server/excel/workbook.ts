import ExcelJS from "exceljs";

/** Column definition shared by import templates and exports. */
export type Column = { key: string; header: string; required?: boolean; example?: string | number; note?: string; width?: number };
export type SheetSpec = { name: string; columns: Column[] };

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } };

/** Build an import template: one sheet per spec with a bold header and one example row, plus an Instructions sheet. */
export async function buildTemplate(specs: SheetSpec[], instructions: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "QEPEX Work Tracker";
  const info = wb.addWorksheet("Instructions");
  info.getColumn(1).width = 110;
  instructions.forEach((line, i) => (info.getCell(i + 1, 1).value = line));
  for (const spec of specs) {
    const ws = wb.addWorksheet(spec.name);
    ws.columns = spec.columns.map((c) => ({ header: c.required ? `${c.header} *` : c.header, key: c.key, width: c.width ?? Math.max(14, c.header.length + 4) }));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = HEADER_FILL;
    ws.addRow(Object.fromEntries(spec.columns.map((c) => [c.key, c.example ?? ""])));
    ws.getRow(2).font = { italic: true, color: { argb: "FF6B7280" } };
    spec.columns.forEach((c, i) => {
      if (c.note) ws.getCell(1, i + 1).note = c.note;
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Plain export: one sheet, header + rows (used by scoped exports). */
export async function buildSheet(name: string, columns: Column[], rows: Record<string, unknown>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 4) }));
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export type ParsedRow = { rowNumber: number; data: Record<string, string> };

function cellToString(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // Excel dates have no timezone; exceljs gives the calendar date at UTC midnight.
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("result" in v) return cellToString(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("").trim();
    if ("hyperlink" in v) return String((v as { text?: string }).text ?? "").trim();
  }
  return String(v).trim();
}

/**
 * Read a sheet by its template columns. Header matching ignores case, "*" and spaces, so a
 * re-typed header still works. Blank rows and the italic example row (if left unchanged) are skipped.
 */
export async function readSheets(buffer: Buffer, specs: SheetSpec[]): Promise<Record<string, ParsedRow[]>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const norm = (s: string) => s.toLowerCase().replace(/[*\s_]/g, "");
  const out: Record<string, ParsedRow[]> = {};
  for (const spec of specs) {
    const ws = wb.getWorksheet(spec.name);
    out[spec.name] = [];
    if (!ws) continue;
    const headerIndex = new Map<string, number>();
    ws.getRow(1).eachCell((cell, col) => headerIndex.set(norm(cellToString(cell.value)), col));
    const colFor = (c: Column) => headerIndex.get(norm(c.header)) ?? headerIndex.get(norm(c.key));
    const example = spec.columns.map((c) => String(c.example ?? ""));
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const data: Record<string, string> = {};
      for (const c of spec.columns) {
        const idx = colFor(c);
        data[c.key] = idx ? cellToString(row.getCell(idx).value) : "";
      }
      const values = spec.columns.map((c) => data[c.key]);
      if (values.every((v) => v === "")) return;
      if (rowNumber === 2 && values.every((v, i) => v === example[i])) return;
      out[spec.name]!.push({ rowNumber, data });
    });
  }
  return out;
}
