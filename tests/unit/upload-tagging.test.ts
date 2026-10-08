import { describe, expect, it } from "vitest";
import { suggestItem, suggestTags, tokens } from "@/server/helpers/upload-tagging";

const items = [
  { id: "a", label: "Bank statements", keywords: "bank statements" },
  { id: "b", label: "Sales register / invoices", keywords: "sales register / invoices" },
  { id: "c", label: "Purchase register", keywords: "purchase register" },
  { id: "d", label: "Form 16", keywords: "form 16" },
  { id: "e", label: "Investment proofs", keywords: "investment proofs, 80c, lic premium" },
];

describe("tokens", () => {
  it("expands office abbreviations and folds plurals", () => {
    const t = tokens("HDFC_Stmt_Sep26.pdf Purch-Reg TB");
    for (const w of ["statement", "purchase", "register", "trial", "balance", "hdfc"]) expect(t.has(w)).toBe(true);
    expect(tokens("Form16_FY2025-26").has("16")).toBe(true);
  });
});

describe("suggestItem", () => {
  it("matches typical file names to the requested item", () => {
    expect(suggestItem("HDFC Bank Stmt Apr-Sep 2026.pdf", "", items)).toMatchObject({ id: "a" });
    expect(suggestItem("purchase_register_sept.xlsx", "", items)).toMatchObject({ id: "c" });
    expect(suggestItem("ICICI_Stmt_Q2.pdf", "", items)).toMatchObject({ id: "a" }); // bank name stands for "bank"
    expect(suggestItem("Form16_FY2025-26_Ravi.pdf", "", items)).toMatchObject({ id: "d" });
    expect(suggestItem("LIC premium receipt.jpg", "", items)).toMatchObject({ id: "e" });
  });

  it("uses the text when the name says nothing", () => {
    expect(suggestItem("IMG_2041.pdf", "STATEMENT OF ACCOUNT ... Bank: State Bank of India ... statement period", items)).toMatchObject({ id: "a" });
  });

  it("suggests nothing for weak or tied matches", () => {
    expect(suggestItem("scan001.pdf", "", items)).toBeNull();
    expect(suggestItem("register.xlsx", "", items)).toBeNull(); // sales register vs purchase register: tie
    expect(suggestItem("anything.pdf", "", [])).toBeNull();
  });

  it("handles Unicode and very long text", () => {
    expect(suggestItem("बैंक स्टेटमेंट.pdf", "", items)).toBeNull();
    expect(suggestItem("x.txt", "lorem ".repeat(200_000) + "bank statement", items)).toBeNull(); // only the first 5,000 characters are read
  });
});

describe("suggestTags", () => {
  it("tags from a fixed dictionary, preferring the specific Form 16A", () => {
    expect(suggestTags("HDFC Bank Statement.pdf", "")).toEqual(["bank-statement"]);
    expect(suggestTags("Form 16A Q2.pdf", "")).toEqual(["form-16a"]);
    expect(suggestTags("notes.txt", "Trial Balance as at 31 March 2026; Balance Sheet; Profit and Loss")).toEqual(["trial-balance", "financial-statements"]);
    expect(suggestTags("photo.jpg", "")).toEqual([]);
  });
});
