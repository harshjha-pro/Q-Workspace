import { describe, expect, it } from "vitest";
import { encrypt, decrypt, encryptJson, decryptJson } from "@/server/lib/crypto";
import { addDays, diffDays, formatDate, fyLabel, ayLabelForFy, fyStartYear, weekStart, isIsoDate, todayIst, dayOfWeek } from "@/server/lib/dates";
import { formatInr, formatInrCompact, parseInrToPaise, formatMinutes } from "@/server/lib/money";
import { gstinCheckChar, isValidGstin } from "@/server/domain/gstin";

describe("crypto (AES-256-GCM)", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("secret-pass", "VAULT");
    const b = encrypt("secret-pass", "VAULT");
    expect(a).not.toEqual(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(decrypt(a, "VAULT")).toBe("secret-pass");
  });
  it("keys are separate: vault ciphertext does not open with the PII key", () => {
    expect(() => decrypt(encrypt("x", "VAULT"), "PII")).toThrow();
  });
  it("detects tampering", () => {
    const parts = encrypt("hello", "PII").split(":");
    parts[3] = Buffer.from("jello").toString("base64url");
    expect(() => decrypt(parts.join(":"), "PII")).toThrow();
  });
  it("handles JSON and Unicode", () => {
    const v = { name: "श्रीनिवास", basic: 2_500_000 };
    expect(decryptJson(encryptJson(v, "PII"), "PII")).toEqual(v);
  });
});

describe("dates (IST, FY/AY)", () => {
  it("formats DD-MMM-YYYY", () => expect(formatDate("2026-10-06")).toBe("06-Oct-2026"));
  it("FY and AY labels (Q-08: AY 2027-28 for FY 2026-27)", () => {
    expect(fyStartYear("2026-10-06")).toBe(2026);
    expect(fyStartYear("2027-03-31")).toBe(2026);
    expect(fyStartYear("2026-04-01")).toBe(2026);
    expect(fyLabel(2026)).toBe("FY 2026-27");
    expect(ayLabelForFy(2026)).toBe("AY 2027-28");
    expect(fyLabel(2099)).toBe("FY 2099-00");
  });
  it("date arithmetic across month ends and leap years", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(diffDays("2026-09-30", "2026-10-31")).toBe(31);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });
  it("week starts Monday", () => {
    expect(weekStart("2026-10-04")).toBe("2026-09-28"); // Sunday
    expect(weekStart("2026-10-05")).toBe("2026-10-05"); // Monday
    expect(dayOfWeek("2026-10-06")).toBe(2);
  });
  it("IST rollover: 20:00 UTC is next day in IST", () => {
    expect(todayIst(new Date("2026-10-06T20:00:00Z"))).toBe("2026-10-07");
  });
});

describe("money (paise, lakh/crore)", () => {
  it("Indian grouping", () => {
    expect(formatInr(123456789)).toBe("₹12,34,567.89");
    expect(formatInr(100000000)).toBe("₹10,00,000");
    expect(formatInr(-50)).toBe("-₹0.50");
    expect(formatInr(99900)).toBe("₹999");
  });
  it("compact", () => {
    expect(formatInrCompact(12_50_000_00)).toBe("₹12.5 L");
    expect(formatInrCompact(3_20_00_000_00)).toBe("₹3.2 Cr");
  });
  it("parses input", () => {
    expect(parseInrToPaise("12,34,567.5")).toBe(123456750);
    expect(parseInrToPaise("₹ 100")).toBe(10000);
    expect(parseInrToPaise("abc")).toBeNull();
  });
  it("hours are shown as effort, never as x/8", () => {
    expect(formatMinutes(360)).toBe("6 hrs");
    expect(formatMinutes(375)).toBe("6 hrs 15 min");
    expect(formatMinutes(60)).toBe("1 hr");
    expect(formatMinutes(45)).toBe("45 min");
  });
});

describe("GSTIN checksum", () => {
  it("accepts a valid GSTIN and rejects a wrong check digit", () => {
    const base = "27AAPFU0939F1Z";
    const g = base + gstinCheckChar(base);
    expect(isValidGstin(g)).toBe(true);
    const wrong = base + (g.endsWith("A") ? "B" : "A");
    expect(isValidGstin(wrong)).toBe(false);
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
  });
});
