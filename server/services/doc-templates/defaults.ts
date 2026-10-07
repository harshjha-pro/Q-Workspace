/**
 * Default firm templates (spec 13.3), seeded as DRAFT version 1. These are plain-language starting
 * points written for QEPEX India to review: they carry no statutory numbers, sections or rates, and
 * each opens with a marker line the reviewing Partner removes before approving.
 * Merge fields are listed in MERGE_FIELDS (service.ts); {{extra.*}} fields are typed at generation.
 */
export type DefaultTemplate = { code: string; name: string; category: string; outputFormat: "PDF" | "DOCX"; body: string };

export const DRAFT_MARKER = "[FIRM DRAFT: review, edit and remove this line before approving]";

const sign = `For {{firm.name}}
Chartered Accountants

Partner
Place: Jaipur
Date: {{today.date}}`;

const letterTop = `{{today.date}}

{{client.name}}
{{client.address}}

Kind attention: {{client.contactName}}`;

const engagementLetter = (line: string, scope: string) => `${DRAFT_MARKER}
${letterTop}

Dear Sir / Madam,

# Engagement letter: ${line}

We are pleased to confirm our acceptance of the engagement "{{engagement.name}}" and set out below our understanding of its scope and terms.

# Scope of our work
${scope}

# Your responsibilities
You are responsible for the completeness and accuracy of the records and information you give us, for keeping proper books, and for giving us timely access to people and documents. Delays in information may move the timelines agreed below.

# Our responsibilities
We will carry out the work with due professional care, in line with the standards issued by the Institute of Chartered Accountants of India that apply to this kind of engagement. We will keep your information confidential.

# Team and timelines
Engagement partner: {{engagement.partner}}. Engagement manager: {{engagement.manager}}. Work starts on {{engagement.startDate}}; we will share a detailed timeline after our first meeting.

# Fees
Our professional fee is {{engagement.fee}} ({{engagement.feeBasis}}), plus applicable taxes and out-of-pocket expenses at actuals. Invoices are payable within the credit period stated on them.

# Acceptance
Please confirm your agreement by signing and returning a copy of this letter, or by accepting it on our client portal.

Yours faithfully,

${sign}

Accepted on behalf of {{client.name}}

Name and designation: ____________________    Date: ____________`;

const hrTop = `{{today.date}}

{{employee.name}}
Employee code: {{employee.employeeCode}}`;

const noticeReply = (authority: string) => `${DRAFT_MARKER}
{{today.date}}

To
The {{extra.officerDesignation}}
${authority}
{{extra.officeAddress}}

Subject: Reply to notice reference {{extra.noticeReference}} dated {{extra.noticeDate}} in the case of {{client.name}} (PAN {{client.pan}}) for {{extra.period}}

Respected Sir / Madam,

# Background
We act as authorised representatives of {{client.name}} ("the assessee"). The above notice asks for {{extra.matterRequested}}. Our authorisation is enclosed.

# Submissions
{{extra.submissions}}

# Documents enclosed
{{extra.enclosures}}

# Request
We request that the submissions be taken on record and the proceedings be closed. If any further information is needed, we request an opportunity of being heard before any adverse view is taken.

Yours faithfully,

For {{client.name}}
Through authorised representative

${sign}`;

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  // ---- Engagement letters, one per service line (code ENGAGEMENT_LETTER_<SERVICE_LINE>)
  { code: "ENGAGEMENT_LETTER_AUDIT", name: "Engagement letter: Audit & Assurance", category: "ENGAGEMENT_LETTER", outputFormat: "DOCX", body: engagementLetter("Audit & Assurance", "We will audit the financial statements for the period stated in the engagement name and report on them as required by the applicable law and auditing standards. An audit gives reasonable, not absolute, assurance; it is not designed to detect every misstatement or fraud. Management remains responsible for preparing the financial statements and for internal control.") },
  { code: "ENGAGEMENT_LETTER_ACCOUNTING", name: "Engagement letter: Accounting", category: "ENGAGEMENT_LETTER", outputFormat: "DOCX", body: engagementLetter("Accounting", "We will maintain your books of account from the vouchers and statements you provide, prepare periodic trial balances and management reports, and help prepare the year-end financial statements. We do not audit or verify the underlying documents.") },
  { code: "ENGAGEMENT_LETTER_DIRECT_TAX", name: "Engagement letter: Direct Tax", category: "ENGAGEMENT_LETTER", outputFormat: "DOCX", body: engagementLetter("Direct Tax", "We will compute your income, prepare and file the return of income and related forms, and advise on tax payments falling due during the engagement. Representation before tax authorities is outside this engagement unless agreed separately in writing.") },
  { code: "ENGAGEMENT_LETTER_GST", name: "Engagement letter: Indirect Tax (GST)", category: "ENGAGEMENT_LETTER", outputFormat: "DOCX", body: engagementLetter("Indirect Tax (GST)", "We will prepare and file your periodic GST returns from the sales, purchase and other data you provide, reconcile input tax credit with the data available on the GST portal, and tell you about mismatches we notice. Audits, refunds and notices are separate engagements.") },
  { code: "ENGAGEMENT_LETTER_COMPANY_LAW", name: "Engagement letter: Company Law & Secretarial", category: "ENGAGEMENT_LETTER", outputFormat: "DOCX", body: engagementLetter("Company Law & Secretarial", "We will prepare and file the annual and event-based forms with the Registrar, draft notices, resolutions and minutes of meetings, and maintain the statutory registers you ask us to maintain. Filings are made from the information and approvals the company gives us.") },
  { code: "ENGAGEMENT_LETTER_ADVISORY", name: "Engagement letter: Advisory", category: "ENGAGEMENT_LETTER", outputFormat: "DOCX", body: engagementLetter("Advisory", "We will carry out the advisory assignment described in the engagement name and deliver a written report of our findings and recommendations. Our advice is based on the facts you give us and the law as it stands on the date of the report.") },

  // ---- Resolutions, notices, minutes
  { code: "BOARD_RESOLUTION_GENERAL", name: "Board resolution (general)", category: "BOARD_RESOLUTION", outputFormat: "DOCX", body: `${DRAFT_MARKER}
# Certified true copy of the resolution passed by the Board of Directors of {{client.name}} at its meeting held on {{extra.meetingDate}} at {{extra.venue}}

{{extra.resolutionTitle}}

"RESOLVED THAT {{extra.resolutionText}}

RESOLVED FURTHER THAT any Director of the Company be and is hereby authorised to sign and file the necessary documents and to do all acts, deeds and things needed to give effect to this resolution."

Certified true copy
For {{client.name}}

Director
Name: {{extra.directorName}}
DIN: {{extra.directorDin}}
CIN: {{client.cin}}` },
  { code: "BOARD_RESOLUTION_AUDITOR_APPOINTMENT", name: "Board resolution: appointment of auditor (recommendation)", category: "BOARD_RESOLUTION", outputFormat: "DOCX", body: `${DRAFT_MARKER}
# Extract of the minutes of the meeting of the Board of Directors of {{client.name}} held on {{extra.meetingDate}}

Recommendation for appointment of statutory auditors

"RESOLVED THAT, subject to the approval of the members, {{firm.name}}, Chartered Accountants, be and are hereby recommended for appointment as the statutory auditors of the Company for the term proposed in the notice of the general meeting, on such remuneration as the Board may fix in consultation with the auditors.

RESOLVED FURTHER THAT the written consent and eligibility certificate received from the auditors be taken on record, and any Director be authorised to file the necessary forms."

Certified true copy
For {{client.name}}

Director` },
  { code: "SHAREHOLDER_RESOLUTION_ORDINARY", name: "Shareholder resolution (ordinary business)", category: "SHAREHOLDER_RESOLUTION", outputFormat: "DOCX", body: `${DRAFT_MARKER}
# Certified true copy of the resolution passed by the members of {{client.name}} at the general meeting held on {{extra.meetingDate}} at {{extra.venue}}

{{extra.resolutionTitle}}

"RESOLVED THAT {{extra.resolutionText}}"

Certified true copy
For {{client.name}}

Director / Company Secretary` },
  { code: "MEETING_NOTICE_BOARD", name: "Notice of Board meeting", category: "MEETING_NOTICE", outputFormat: "DOCX", body: `${DRAFT_MARKER}
{{client.name}}
CIN: {{client.cin}}
Registered office: {{client.address}}

# Notice of meeting of the Board of Directors

Notice is given that a meeting of the Board of Directors of the Company will be held on {{extra.meetingDate}} at {{extra.meetingTime}} at {{extra.venue}} to transact the business set out in the agenda below.

# Agenda
{{extra.agenda}}

Directors who wish to join by video conference are requested to inform the Company in advance.

By order of the Board
For {{client.name}}

Director / Company Secretary
Date: {{today.date}}` },
  { code: "MEETING_NOTICE_AGM", name: "Notice of annual general meeting", category: "MEETING_NOTICE", outputFormat: "DOCX", body: `${DRAFT_MARKER}
{{client.name}}
CIN: {{client.cin}}
Registered office: {{client.address}}

# Notice of annual general meeting

Notice is given that the annual general meeting of the members of {{client.name}} will be held on {{extra.meetingDate}} at {{extra.meetingTime}} at {{extra.venue}} to transact the following business.

# Ordinary business
1. To receive, consider and adopt the audited financial statements for the financial year, together with the reports of the Board and the auditors.
{{extra.otherBusiness}}

# Notes
A member entitled to attend and vote may appoint a proxy to attend and vote instead of himself or herself; a proxy need not be a member. The instrument of proxy must reach the registered office within the time stated in the proxy form.

By order of the Board
For {{client.name}}

Director / Company Secretary
Date: {{today.date}}` },
  { code: "MINUTES_BOARD", name: "Minutes of Board meeting", category: "MINUTES", outputFormat: "DOCX", body: `${DRAFT_MARKER}
# Minutes of the meeting of the Board of Directors of {{client.name}} held on {{extra.meetingDate}} at {{extra.meetingTime}} at {{extra.venue}}

Present: {{extra.present}}
In attendance: {{extra.inAttendance}}

# 1. Chairperson
{{extra.chairperson}} took the chair. The required quorum being present, the meeting was called to order.

# 2. Leave of absence
{{extra.leaveOfAbsence}}

# 3. Minutes of the previous meeting
The minutes of the previous meeting were read and confirmed.

# 4. Business transacted
{{extra.business}}

# 5. Vote of thanks
There being no other business, the meeting ended with a vote of thanks to the chair.

Chairperson
Date of signing: ____________` },

  // ---- Certificates
  { code: "CERTIFICATE_CA_GENERAL", name: "CA certificate (general format)", category: "CERTIFICATE", outputFormat: "PDF", body: `${DRAFT_MARKER}
# Certificate

To whom it may concern

We have examined the books of account, records and other documents of {{client.name}} (PAN {{client.pan}}), {{client.address}}, produced before us, for the purpose of certifying {{extra.purpose}}.

On the basis of our examination and the information and explanations given to us, we certify that {{extra.certifiedStatement}}

This certificate is issued at the request of the client for submission to {{extra.submittedTo}} and should not be used for any other purpose. Our responsibility is limited to the records produced to us; we have relied on management's representations where stated.

${sign}
UDIN: {{extra.udin}}` },
  { code: "CERTIFICATE_NET_WORTH", name: "Net worth certificate", category: "CERTIFICATE", outputFormat: "PDF", body: `${DRAFT_MARKER}
# Net worth certificate

To whom it may concern

At the request of {{client.name}} ({{client.constitution}}), {{client.address}}, we have examined the statement of assets and liabilities as on {{extra.asOnDate}} and the supporting records produced before us.

On the basis of that examination and the information and explanations given to us, we certify that the net worth of {{client.name}} as on {{extra.asOnDate}} is {{extra.netWorth}}, computed as shown in the annexure.

This certificate is issued for submission to {{extra.submittedTo}} and should not be used for any other purpose.

${sign}
UDIN: {{extra.udin}}` },
  { code: "CERTIFICATE_TURNOVER", name: "Turnover certificate", category: "CERTIFICATE", outputFormat: "PDF", body: `${DRAFT_MARKER}
# Turnover certificate

To whom it may concern

We have verified the books of account and the returns filed by {{client.name}} (PAN {{client.pan}}) for {{extra.period}}.

On the basis of that verification, we certify that the turnover of {{client.name}} for {{extra.period}} is {{extra.turnover}}.

This certificate is issued for submission to {{extra.submittedTo}} and should not be used for any other purpose.

${sign}
UDIN: {{extra.udin}}` },
  { code: "CERTIFICATE_CS_GENERAL", name: "CS certificate (secretarial, general format)", category: "CERTIFICATE", outputFormat: "PDF", body: `${DRAFT_MARKER}
# Certificate

We have examined the statutory registers, minutes and other records of {{client.name}} (CIN {{client.cin}}) produced before us for the purpose of certifying {{extra.purpose}}.

Based on our examination and the information and explanations given to us, we certify that {{extra.certifiedStatement}}

This certificate is issued at the request of the company for submission to {{extra.submittedTo}}.

For {{firm.name}}

Company Secretary in practice
Place: Jaipur
Date: {{today.date}}
UDIN: {{extra.udin}}` },

  // ---- Representation letter
  { code: "REPRESENTATION_LETTER_AUDIT", name: "Management representation letter (audit)", category: "REPRESENTATION_LETTER", outputFormat: "DOCX", body: `${DRAFT_MARKER}
(On the letterhead of {{client.name}})

{{today.date}}

{{firm.name}}
{{firm.address}}

Dear Sirs,

# Management representation letter

This letter is provided in connection with your audit of the financial statements of {{client.name}} for {{extra.period}}, for the purpose of expressing an opinion on whether they give a true and fair view.

We confirm, to the best of our knowledge and belief, that:
1. We have fulfilled our responsibility for preparing the financial statements in line with the applicable financial reporting framework.
2. We have given you all relevant information and access to records, and all transactions are recorded in the books.
3. We have disclosed all known actual or possible litigation, claims and contingent liabilities.
4. We have disclosed the identity of related parties and all related party transactions we are aware of.
5. We are not aware of any fraud or suspected fraud affecting the entity.
6. Events after the balance sheet date that need adjustment or disclosure have been adjusted or disclosed.
{{extra.additionalRepresentations}}

Yours faithfully,
For {{client.name}}

Director / Authorised signatory          Chief Financial Officer` },

  // ---- Notice replies (code NOTICE_REPLY_<AUTHORITY>, authority as in the notices register)
  { code: "NOTICE_REPLY_INCOME_TAX", name: "Notice reply: Income Tax", category: "NOTICE_REPLY", outputFormat: "DOCX", body: noticeReply("Income Tax Department") },
  { code: "NOTICE_REPLY_GST", name: "Notice reply: GST", category: "NOTICE_REPLY", outputFormat: "DOCX", body: noticeReply("Goods and Services Tax Department") },
  { code: "NOTICE_REPLY_TDS_TRACES", name: "Notice reply: TDS / TRACES", category: "NOTICE_REPLY", outputFormat: "DOCX", body: noticeReply("TDS Centralised Processing Cell / Assessing Officer (TDS)") },
  { code: "NOTICE_REPLY_MCA_ROC", name: "Notice reply: MCA / ROC", category: "NOTICE_REPLY", outputFormat: "DOCX", body: noticeReply("Office of the Registrar of Companies") },
  { code: "NOTICE_REPLY_OTHER", name: "Notice reply: other authority", category: "NOTICE_REPLY", outputFormat: "DOCX", body: noticeReply("{{extra.authority}}") },

  // ---- HR letters (codes HR_*)
  { code: "HR_OFFER", name: "Offer letter", category: "HR_LETTER", outputFormat: "PDF", body: `${DRAFT_MARKER}
{{today.date}}

{{extra.candidateName}}

Dear {{extra.candidateName}},

# Offer of employment

We are pleased to offer you the position of {{extra.position}} with {{firm.name}}, based at our Jaipur office. We expect you to join on {{extra.joiningDate}}.

Your total annual compensation will be {{extra.ctc}}, with the break-up given in the annexure. Other terms, including working hours, leave and the probation period, follow the firm's HR policy, a copy of which will be shared on joining.

This offer depends on satisfactory verification of your documents and references. Please confirm your acceptance by signing a copy of this letter by {{extra.acceptBy}}.

We look forward to working with you.

For {{firm.name}}

Partner / HR` },
  { code: "HR_APPOINTMENT", name: "Appointment letter", category: "HR_LETTER", outputFormat: "PDF", body: `${DRAFT_MARKER}
${hrTop}

Dear {{employee.name}},

# Letter of appointment

Further to our offer, we are pleased to appoint you as {{employee.designation}} with effect from {{employee.joiningDate}}.

1. Probation: you will be on probation for the period stated in the firm's HR policy; confirmation will be communicated in writing.
2. Compensation: as set out in the annexure to this letter, subject to the deductions required by law.
3. Confidentiality: you will keep all client and firm information confidential during and after your employment.
4. Conduct: you will follow the firm's policies, including the code of conduct and the independence policy.
5. Notice: either party may end this appointment by giving the notice stated in the firm's HR policy.

Please sign and return a copy of this letter as your acceptance.

For {{firm.name}}

Partner

Accepted: ____________________    Date: ____________` },
  { code: "HR_CONFIRMATION", name: "Confirmation letter", category: "HR_LETTER", outputFormat: "PDF", body: `${DRAFT_MARKER}
${hrTop}

Dear {{employee.name}},

# Confirmation of employment

We are pleased to confirm your services as {{employee.designation}} with effect from {{extra.confirmationDate}}, on completion of your probation. All other terms of your appointment remain unchanged.

We appreciate your contribution and wish you continued success with the firm.

For {{firm.name}}

Partner / HR` },
  { code: "HR_INCREMENT", name: "Increment letter", category: "HR_LETTER", outputFormat: "PDF", body: `${DRAFT_MARKER}
${hrTop}

Dear {{employee.name}},

# Revision of compensation

In recognition of your performance, we are pleased to revise your total annual compensation to {{extra.newCtc}} with effect from {{extra.effectiveFrom}}. The revised break-up is given in the annexure.

This letter is confidential. All other terms of your employment remain unchanged.

For {{firm.name}}

Partner` },
  { code: "HR_EXPERIENCE", name: "Experience certificate", category: "HR_LETTER", outputFormat: "PDF", body: `${DRAFT_MARKER}
{{today.date}}

# To whom it may concern

This is to certify that {{employee.name}} worked with {{firm.name}} from {{employee.joiningDate}} to {{extra.lastWorkingDate}}. At the time of leaving, the position held was {{extra.position}}.

We found the conduct and work satisfactory.

We wish {{employee.name}} every success.

For {{firm.name}}

Partner / HR` },
  { code: "HR_RELIEVING", name: "Relieving letter", category: "HR_LETTER", outputFormat: "PDF", body: `${DRAFT_MARKER}
${hrTop}

Dear {{employee.name}},

# Relieving letter

With reference to your resignation dated {{extra.resignationDate}}, you are relieved from the services of {{firm.name}} at the close of business on {{extra.lastWorkingDate}}.

We confirm that you have handed over all firm and client documents, devices, digital signature tokens and access in your custody, and that your full and final settlement will be processed as per the firm's policy.

We thank you for your contribution and wish you the very best.

For {{firm.name}}

Partner / HR` },

  // ---- Renewal letter and proposal (CRM)
  { code: "RENEWAL_LETTER", name: "Engagement renewal letter", category: "RENEWAL_LETTER", outputFormat: "PDF", body: `${DRAFT_MARKER}
${letterTop}

Dear Sir / Madam,

# Renewal of our engagement: {{engagement.name}}

Thank you for the opportunity to work with {{client.name}} on {{engagement.name}}. As the current term ends soon, we propose to renew the engagement on the following basis.

Scope: {{extra.scope}}
Proposed fee: {{extra.proposedFee}} plus applicable taxes
Proposed start: {{extra.startDate}}

{{extra.changesFromLastYear}}

If this is acceptable, please confirm by reply or accept it on our client portal, and we will send the engagement letter for the new term.

Warm regards,

For {{firm.name}}
{{client.partner}}` },
  { code: "PROPOSAL", name: "Fee proposal", category: "PROPOSAL", outputFormat: "PDF", body: `${DRAFT_MARKER}
${letterTop}

Dear Sir / Madam,

# Proposal for professional services

Thank you for considering {{firm.name}}. Based on our discussion, we are pleased to propose the following services.

# Scope of services
{{extra.scope}}

# Our approach and team
{{extra.approach}}

# Professional fees
{{extra.feeTable}}

Fees exclude applicable taxes and out-of-pocket expenses, which are billed at actuals. This proposal is valid until {{extra.validUntil}}.

# Next steps
On your acceptance we will carry out our standard client acceptance procedures and send an engagement letter.

We look forward to working with you.

For {{firm.name}}

Partner` },
];
