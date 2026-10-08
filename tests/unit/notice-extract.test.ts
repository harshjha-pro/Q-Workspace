import { describe, expect, it } from "vitest";
import { extractNoticeFields, findDates, suggestedDueDate } from "@/server/helpers/notice-extract";

describe("dates in Indian notices", () => {
  it("reads day-first numeric, written-month and ISO forms; rejects impossible dates", () => {
    expect(findDates("on 05/11/2026 and 5-11-2026 and 05.11.2026").map((d) => d.iso)).toEqual(["2026-11-05", "2026-11-05", "2026-11-05"]);
    expect(findDates("15th November 2026, 15-Nov-2026, November 15, 2026, 2026-11-15").map((d) => d.iso)).toEqual(["2026-11-15", "2026-11-15", "2026-11-15", "2026-11-15"]);
    expect(findDates("31/02/2026 and 12/13/2026")).toEqual([]);
  });
});

describe("extractNoticeFields", () => {
  it("income-tax scrutiny notice u/s 143(2)", () => {
    const s = extractNoticeFields(`INCOME TAX DEPARTMENT — National Faceless Assessment Centre
DIN & Notice No: ITBA/AST/S/143(2)/2026-27/1061234567(1)    Dated: 12/10/2026
To: SHARMA TEXTILES PRIVATE LIMITED, PAN: AAACS1234K
Assessment Year: 2025-26
Notice under section 143(2) of the Income-tax Act, 1961.
You are requested to furnish your submissions on or before 27/10/2026.`);
    expect(s).toMatchObject({
      authority: "INCOME_TAX", section: "143(2)", ayOrPeriod: "AY 2025-26", referenceNo: "ITBA/AST/S/143(2)/2026-27/1061234567(1)",
      noticeDate: "2026-10-12", responseDueDate: "2026-10-27", noticeType: "Scrutiny notice",
    });
    expect(s.evidence.section).toBe("under section 143(2)");
    expect(extractNoticeFields("(Ref. No. ABC/2026/77) issued").referenceNo).toBe("ABC/2026/77");
  });

  it("GST DRC-01 show cause u/s 73 with a demand", () => {
    const s = extractNoticeFields(`FORM GST DRC-01  Reference No: ZD0810260012345   Date: 02-Oct-2026
GSTIN: 08AAACS1234K1Z5. Tax period: April 2024 to March 2025.
Show cause notice under Section 73 of the CGST Act, 2017. A demand of Rs. 1,23,456 is proposed.
Reply may be filed within 30 days.`);
    expect(s).toMatchObject({ authority: "GST", section: "73", ayOrPeriod: "April 2024 to March 2025", referenceNo: "ZD0810260012345", noticeDate: "2026-10-02", noticeType: "DRC-01 (show cause notice)", demandRupees: 123456, responseWithinDays: 30 });
    expect(s.responseDueDate).toBeUndefined();
    expect(suggestedDueDate(s, "2026-10-05")).toBe("2026-11-01"); // 30 days from the notice date
  });

  it("TRACES short-deduction intimation for a quarter", () => {
    const s = extractNoticeFields("TRACES — Centralized Processing Cell (TDS). Short deduction default for Q3 FY 2025-26 (Form 26Q). Amount payable ₹ 18,250.");
    expect(s).toMatchObject({ authority: "TDS_TRACES", ayOrPeriod: "FY 2025-26 Q3", noticeType: "Short deduction default", demandRupees: 18250 });
  });

  it("ROC notice with a rule and sections", () => {
    const s = extractNoticeFields("Office of the Registrar of Companies, Jaipur. Notice u/s 206(1) of the Companies Act, 2013. Letter No. ROC/JPR/206/2026/415 dated 1st October 2026.");
    expect(s).toMatchObject({ authority: "MCA_ROC", section: "206(1)", referenceNo: "ROC/JPR/206/2026/415", noticeDate: "2026-10-01" });
  });

  it("subsections with letters, and 'under section' wording", () => {
    expect(extractNoticeFields("Notice under section 148A(b) for A.Y. 2022-23").section).toBe("148A(b)");
    expect(extractNoticeFields("intimation u/s 143(1)(a) for AY 2025-26").noticeType).toBe("Intimation u/s 143(1)");
    expect(extractNoticeFields("intimation u/s 143(1)(a) for AY 2025-26").section).toBe("143(1)(a)");
  });

  it("guesses nothing from text without clear cues", () => {
    expect(extractNoticeFields("")).toEqual({ evidence: {} });
    const s = extractNoticeFields("Please call us about the documents. Meeting on 03/11/2026 or 05/11/2026.");
    expect(s.authority).toBeUndefined();
    expect(s.section).toBeUndefined();
    expect(s.noticeDate).toBeUndefined(); // two plain dates, no cue: no guess
    expect(s.demandRupees).toBeUndefined();
  });

  it("is safe on very long and unusual input", () => {
    const big = "x ".repeat(100_000) + "u/s 139(9) AY 2024-25";
    expect(extractNoticeFields(big)).toMatchObject({ section: "139(9)", ayOrPeriod: "AY 2024-25", noticeType: "Defective return" });
    expect(() => extractNoticeFields("₹₹₹ Rs. ,,, dated 99/99/9999 section ()")).not.toThrow();
  });
});
