import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from "docx";

/** Word output for templates and letters (spec 13.3). Plain paragraphs; a line starting "# " is a heading. */
export async function buildDocx(opts: { title?: string; header?: string[]; body: string }): Promise<Buffer> {
  const paras: Paragraph[] = [];
  for (const h of opts.header ?? []) paras.push(new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: h, bold: h === opts.header![0], size: h === opts.header![0] ? 28 : 18 })] }));
  if (opts.header?.length) paras.push(new Paragraph({ children: [] }));
  if (opts.title) paras.push(new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children: [new TextRun({ text: opts.title, bold: true })] }));
  for (const line of opts.body.split(/\r?\n/)) {
    if (line.startsWith("# ")) paras.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: line.slice(2), bold: true })] }));
    else paras.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }));
  }
  return Buffer.from(await Packer.toBuffer(new Document({ creator: "QEPEX Work Tracker", title: opts.title ?? "Document", sections: [{ children: paras }] })));
}
