/**
 * CSV for Excel. Cells that start with = + - @ (or tab/CR) are prefixed with an apostrophe so a
 * client name or description can never run as a formula when the file is opened.
 */
export function csvCell(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: unknown[][]) {
  // BOM so Excel opens UTF-8 (₹, Indian names) correctly.
  return "﻿" + [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n") + "\r\n";
}
