import { z } from "zod";
import { CONSTITUTIONS, PAN_RE, TAN_RE, UDYAM_RE, zIsoDate } from "../enums";

/** Shared by the client service (server) and the client form (React Hook Form). */
export const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
export const optUpper = (re: RegExp, msg: string) =>
  z.preprocess(blankToNull, z.string().trim().toUpperCase().regex(re, msg).nullable().optional());

export const clientInput = z.object({
  name: z.string().trim().min(2).max(160),
  groupId: z.preprocess(blankToNull, z.string().nullable().optional()),
  constitution: z.enum(CONSTITUTIONS),
  pan: optUpper(PAN_RE, "PAN format is AAAAA9999A"),
  tan: optUpper(TAN_RE, "TAN format is AAAA99999A"),
  cinLlpin: z.preprocess(blankToNull, z.string().trim().toUpperCase().nullable().optional()),
  udyam: optUpper(UDYAM_RE, "Udyam format is UDYAM-XX-00-0000000"),
  stateCode: z.preprocess(blankToNull, z.string().nullable().optional()),
  address: z.string().default(""),
  incorporationDate: z.preprocess(blankToNull, zIsoDate.nullable().optional()),
  fyEnd: z.string().regex(/^\d{2}-\d{2}$/).default("03-31"),
  booksBy: z.enum(["FIRM", "CLIENT"]).default("CLIENT"),
  partnerId: z.preprocess(blankToNull, z.string().nullable().optional()),
  managerId: z.preprocess(blankToNull, z.string().nullable().optional()),
  teamId: z.preprocess(blankToNull, z.string().nullable().optional()),
  category: z.preprocess(blankToNull, z.enum(["A", "B", "C"]).nullable().optional()),
  tags: z.string().default(""),
  publicInterest: z.boolean().default(false),
  leadSource: z.preprocess(blankToNull, z.string().nullable().optional()),
  onboardingDate: z.preprocess(blankToNull, zIsoDate.nullable().optional()),
  kycStatus: z.enum(["PENDING", "PARTIAL", "COMPLETE"]).default("PENDING"),
  preferredChannel: z.enum(["EMAIL", "WHATSAPP", "PHONE"]).default("EMAIL"),
});
export type ClientInput = z.input<typeof clientInput>;

