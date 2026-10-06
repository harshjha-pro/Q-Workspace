import type { ClientFlag } from "./enums";

/** Plain-language labels for applicability flags (spec 4.1 "Applies when", P2-23). */
export const FLAG_INFO: Record<ClientFlag, { label: string; appliesWhen: string }> = {
  tdsApplicable: { label: "TDS", appliesWhen: "Client deducts tax at source — monthly TDS payment" },
  tdsSalary: { label: "TDS on salary (24Q)", appliesWhen: "Client pays salaries above the exemption limit" },
  tdsNonSalary: { label: "TDS non-salary (26Q)", appliesWhen: "Client pays contractors, rent, professional fees etc." },
  tdsNonResident: { label: "TDS non-resident (27Q)", appliesWhen: "Client pays non-residents" },
  tcsApplicable: { label: "TCS (27EQ)", appliesWhen: "Client collects tax at source on sales" },
  taxAuditApplicable: { label: "Tax audit", appliesWhen: "ITR with tax audit (3CA/3CB-3CD) — audit-case due date" },
  transferPricingApplicable: { label: "Transfer pricing", appliesWhen: "International / specified domestic transactions — Form 3CEB" },
  statutoryAuditApplicable: { label: "Statutory audit", appliesWhen: "Accounts audited under the governing law (always for companies)" },
  advanceTaxApplicable: { label: "Advance tax", appliesWhen: "Estimated tax above the threshold — four instalments" },
  pfApplicable: { label: "PF", appliesWhen: "Registered under EPF — monthly ECR and payment" },
  esiApplicable: { label: "ESI", appliesWhen: "Registered under ESIC — monthly return and payment" },
  msmeApplicable: { label: "MSME Form 1", appliesWhen: "Company owes MSME suppliers beyond 45 days — half-yearly return" },
  dpt3Applicable: { label: "DPT-3", appliesWhen: "Company has outstanding loans / money received — annual return" },
};
