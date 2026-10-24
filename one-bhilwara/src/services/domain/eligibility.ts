import type { Scheme } from '@/types/models';

export interface EligibilityAnswers {
  age?: number;
  occupation?: 'farmer' | 'student' | 'business' | 'salaried' | 'worker' | 'homemaker' | 'retired';
  annualIncome?: number;
  rajasthanResident?: boolean;
  landOwner?: boolean;
  daughterUnder10?: boolean;
}

export interface EligibilityResult {
  scheme: Scheme;
  status: 'possible' | 'unlikely' | 'info';
  matched: string[];
  notConfirmed: string[];
  failed: string[];
}

/**
 * Informational screening only — it compares a few answers with simplified criteria and
 * never decides eligibility. Every result tells the user to confirm on the official portal.
 */
export function assess(scheme: Scheme, a: EligibilityAnswers): EligibilityResult {
  const r = scheme.rule;
  const matched: string[] = [];
  const failed: string[] = [];
  const notConfirmed: string[] = [...scheme.eligibility];
  const check = (cond: boolean | undefined, label: string) => {
    if (cond === undefined) return;
    (cond ? matched : failed).push(label);
  };
  if (r.occupation) check(a.occupation ? r.occupation.includes(a.occupation) : undefined, `Occupation: ${r.occupation.join(' / ')}`);
  if (r.landOwner) check(a.landOwner, 'Holds cultivable land');
  if (r.student) check(a.occupation ? a.occupation === 'student' : undefined, 'Currently a student');
  if (r.maxIncome !== undefined) check(a.annualIncome !== undefined ? a.annualIncome <= r.maxIncome : undefined, 'Within indicative income range');
  if (r.minAge !== undefined) check(a.age !== undefined ? a.age >= r.minAge : undefined, `Age ${r.minAge}+`);
  if (r.maxAge !== undefined) check(a.age !== undefined ? a.age <= r.maxAge : undefined, `Age up to ${r.maxAge}`);
  if (r.state) check(a.rajasthanResident, 'Resident of Rajasthan');
  if (r.daughterUnder10) check(a.daughterUnder10, 'Has a daughter within the age limit');
  const hasRules = Object.keys(r).length > 0;
  const status: EligibilityResult['status'] = !hasRules ? 'info' : failed.length ? 'unlikely' : 'possible';
  return { scheme, status, matched, failed, notConfirmed };
}
