import { describe, expect, it } from "vitest";
import { buildPdf, rs } from "@/server/documents/pdf";
import { buildDocx } from "@/server/documents/docx";
import { amountInWords, numberToIndianWords } from "@/server/documents/words";
import { renderMerge, fieldsIn } from "@/server/documents/merge";

describe("documents foundation", () => {
  it("formats rupees the Indian way and in words", () => {
    expect(rs(1234567_50)).toBe("Rs. 12,34,567.50");
    expect(rs(99_00, false)).toBe("99.00");
    expect(rs(-1500_00)).toBe("-Rs. 1,500.00");
    expect(numberToIndianWords(1_23_45_678)).toBe("One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight");
    expect(amountInWords(12500_50)).toBe("Rupees Twelve Thousand Five Hundred and Paise Fifty Only");
    expect(amountInWords(0)).toBe("Rupees Zero Only");
  });

  it("merges fields and reports the missing ones", () => {
    const r = renderMerge("Dear {{client.contactName}}, fee {{engagement.fee}} for {{client.name}}.", { client: { name: "Jaipur Gems", contactName: "" } });
    expect(r.text).toBe("Dear [[client.contactName]], fee [[engagement.fee]] for Jaipur Gems.");
    expect(r.missing.sort()).toEqual(["client.contactName", "engagement.fee"]);
    expect(fieldsIn("{{ a.b }} {{a.b}} {{c.d}}")).toEqual(["a.b", "c.d"]);
  });

  it("builds a multi-page PDF and a Word file", async () => {
    const pdf = await buildPdf({
      title: "Tax Invoice", header: ["QEPEX India", "Jaipur"], watermark: "DRAFT",
      blocks: [{ type: "kv", rows: [["Invoice no.", "QI/26-27/0001"], ["Date", "07-Oct-2026"]], columns: 2 }, { type: "table", columns: [{ header: "Description", width: 4 }, { header: "Amount", width: 1, align: "right" }], rows: Array.from({ length: 80 }, (_, i) => [`Line ${i}`, rs(i * 100)]), totals: ["Total", rs(1)] }, { type: "signature", lines: ["For QEPEX India", "Partner"] }],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toMatch(/\/Count [2-9]/);
    const docx = await buildDocx({ title: "Letter", header: ["QEPEX India"], body: "# Heading\nBody line" });
    expect(docx.subarray(0, 2).toString()).toBe("PK");
  });
});
