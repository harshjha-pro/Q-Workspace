# QEPEX India Work Tracker — Permission Matrix (Phase 0, for approval)

Source: Product Spec §3.1–3.9 and §7.1, plus the brief §7. This file is the design;
in Phase 1 the code block below becomes `/server/permissions/matrix.ts` unchanged
(apart from formatting), and `tests/permissions` checks every role against every row.

## 1. Scopes

| Scope | Meaning (resolved server-side by `scopeWhere()`) |
|---|---|
| `none` | denied |
| `self` | only records about/owned by the actor (own entries, own payslip, own leave) |
| `assigned` | clients/engagements/tasks the actor is assigned to (EngagementAssignment / TaskAssignment); see Q-06 |
| `team` | Manager: clients where they are the client's Manager or lead of its ClientTeam, **and** people who report to them or sit in those teams |
| `team_read` | as `team`, read-only |
| `firm` | everything |
| `firm_read` | everything, read-only |
| `granted` | only where an explicit `CredentialGrant` exists (auto-revoked when the person leaves the client team or the firm) |
| `portal_own` | portal user: only the clients linked through `PortalUserClient`, and only portal-safe fields |

## 2. Matrix

```ts
// /server/permissions/matrix.ts  (design — becomes code in Phase 1)
export const ROLES = [
  'PARTNER', 'MANAGER', 'STAFF', 'ARTICLE', 'PRACTICE_ADMIN', 'HR_ADMIN', 'PORTAL',
] as const;
export type Role = (typeof ROLES)[number];

export type Scope =
  | 'none' | 'self' | 'assigned' | 'team' | 'team_read'
  | 'firm' | 'firm_read' | 'granted' | 'portal_own';

type Row = Record<Role, Scope>;
const row = (
  PARTNER: Scope, MANAGER: Scope, STAFF: Scope, ARTICLE: Scope,
  PRACTICE_ADMIN: Scope, HR_ADMIN: Scope, PORTAL: Scope,
): Row => ({ PARTNER, MANAGER, STAFF, ARTICLE, PRACTICE_ADMIN, HR_ADMIN, PORTAL });

//                                     PARTNER      MANAGER      STAFF        ARTICLE      PR_ADMIN     HR_ADMIN     PORTAL
export const MATRIX = {
  // ---- Work & time (spec 3.8 "Log own work", "View others' entries")
  'work.log':                     row('self',      'self',      'self',      'self',      'self',      'self',      'none'),
  'work.viewOthers':              row('firm',      'team',      'none',      'none',      'firm_read', 'none',      'none'),
  'work.correction.approve':      row('firm',      'team',      'none',      'none',      'none',      'none',      'none'),
  'work.lock.extend':             row('firm',      'none',      'none',      'none',      'none',      'none',      'none'),

  // ---- Clients, engagements, tasks
  'client.view':                  row('firm',      'team',      'assigned',  'assigned',  'firm',      'none',      'portal_own'),
  'client.manage':                row('firm',      'team',      'none',      'none',      'firm',      'none',      'none'),
  'client.flags.edit':            row('firm',      'team',      'none',      'none',      'firm',      'none',      'none'),
  'engagement.view':              row('firm',      'team',      'assigned',  'assigned',  'firm_read', 'none',      'portal_own'),
  'engagement.manage':            row('firm',      'team',      'none',      'none',      'none',      'none',      'none'),
  'task.view':                    row('firm',      'team',      'assigned',  'assigned',  'firm_read', 'none',      'portal_own'),
  'task.work':                    row('firm',      'team',      'assigned',  'assigned',  'none',      'none',      'none'),   // stage moves, pending, outcome
  'task.recordFiling':            row('firm',      'team',      'assigned',  'assigned',  'none',      'none',      'none'),
  'task.bulk':                    row('firm',      'team',      'none',      'none',      'none',      'none',      'none'),   // reassign, change checker, NA
  'task.notApplicable':           row('firm',      'team',      'none',      'none',      'firm',      'none',      'none'),
  'task.regenerate':              row('none',      'none',      'none',      'none',      'firm',      'none',      'none'),   // Rules Spec 3.3: Admin only

  // ---- Review & sign-off (3.8 "Review (checker)", "Final sign-off / UDIN")
  'review.check':                 row('firm',      'team',      'assigned',  'none',      'none',      'none',      'none'),   // STAFF only if isSenior
  'signoff.final':                row('firm',      'none',      'none',      'none',      'none',      'none',      'none'),
  'udin.record':                  row('firm',      'none',      'none',      'none',      'firm',      'none',      'none'),
  'eqr.perform':                  row('firm',      'none',      'none',      'none',      'none',      'none',      'none'),

  // ---- Compliance master
  'dueDateMaster.manage':         row('firm',      'none',      'none',      'none',      'firm',      'none',      'none'),
  'extension.publish':            row('firm',      'none',      'none',      'none',      'firm',      'none',      'none'),
  'settings.manage':              row('firm',      'none',      'none',      'none',      'firm',      'none',      'none'),
  'holidays.manage':              row('firm',      'none',      'none',      'none',      'firm',      'firm',      'none'),

  // ---- Registers
  'notice.view':                  row('firm',      'team',      'assigned',  'assigned',  'firm_read', 'none',      'none'),
  'notice.manage':                row('firm',      'team',      'assigned',  'assigned',  'none',      'none',      'none'),
  'dsc.view':                     row('firm',      'team_read', 'assigned',  'assigned',  'firm',      'none',      'none'),
  'dsc.manage':                   row('firm',      'none',      'none',      'none',      'firm',      'none',      'none'),
  'dsc.movement.record':          row('firm',      'team',      'assigned',  'assigned',  'firm',      'none',      'none'),
  'inwardOutward.manage':         row('firm',      'team',      'assigned',  'assigned',  'firm',      'none',      'none'),
  'vault.view':                   row('firm',      'team',      'granted',   'granted',   'firm',      'none',      'none'),
  'vault.manage':                 row('firm',      'team',      'none',      'none',      'firm',      'none',      'none'),
  'vault.grant':                  row('firm',      'team',      'none',      'none',      'firm',      'none',      'none'),

  // ---- Billing (7.1: never in Staff/Article screens; Manager read-only own clients)
  'billing.view':                 row('firm',      'team_read', 'none',      'none',      'firm',      'none',      'portal_own'),
  'billing.raise':                row('firm',      'none',      'none',      'none',      'firm',      'none',      'none'),
  'billing.receipt.record':       row('firm',      'none',      'none',      'none',      'firm',      'none',      'none'),
  'billing.approve':              row('firm',      'none',      'none',      'none',      'none',      'none',      'none'),   // write-offs, retainer drafts, chargeable flags
  'disbursement.manage':          row('firm',      'none',      'none',      'none',      'firm',      'none',      'none'),

  // ---- CRM
  'crm.view':                     row('firm',      'team',      'assigned',  'none',      'firm',      'none',      'none'),
  'crm.manage':                   row('firm',      'team',      'none',      'none',      'firm',      'none',      'none'),
  'proposal.approve':             row('firm',      'none',      'none',      'none',      'none',      'none',      'none'),
  'conflictCheck.decide':         row('firm',      'none',      'none',      'none',      'none',      'none',      'none'),
  'campaign.manage':              row('firm',      'team',      'none',      'none',      'firm',      'none',      'none'),

  // ---- HR (salary columns are a separate capability)
  'hr.records.view':              row('firm',      'team',      'self',      'self',      'none',      'firm',      'none'),
  'hr.records.manage':            row('none',      'none',      'none',      'none',      'none',      'firm',      'none'),
  'salary.view':                  row('firm',      'self',      'self',      'self',      'self',      'firm',      'none'),
  'salary.revise.approve':        row('firm',      'none',      'none',      'none',      'none',      'none',      'none'),
  'payroll.prepare':              row('none',      'none',      'none',      'none',      'none',      'firm',      'none'),
  'payroll.approve':              row('firm',      'none',      'none',      'none',      'none',      'none',      'none'),
  'leave.apply':                  row('self',      'self',      'self',      'self',      'self',      'self',      'none'),
  'leave.approve':                row('firm',      'team',      'none',      'none',      'none',      'none',      'none'),
  'expense.claim':                row('self',      'self',      'self',      'self',      'self',      'self',      'none'),
  'expense.approve':              row('firm',      'team',      'none',      'none',      'none',      'none',      'none'),
  'attendance.regularise.approve':row('firm',      'team',      'none',      'none',      'none',      'none',      'none'),
  'appraisal.write':              row('firm',      'team',      'self',      'self',      'self',      'self',      'none'),   // self = self-review
  'appraisal.moderate':           row('firm',      'none',      'none',      'none',      'none',      'none',      'none'),
  'articleship.view':             row('firm',      'team',      'none',      'self',      'none',      'firm',      'none'),
  'recruitment.manage':           row('firm',      'team_read', 'none',      'none',      'none',      'firm',      'none'),
  'assets.manage':                row('firm_read', 'none',      'none',      'none',      'none',      'firm',      'none'),
  'exit.manage':                  row('firm',      'team_read', 'none',      'none',      'firm_read', 'firm',      'none'),
  'users.manage':                 row('firm',      'none',      'none',      'none',      'firm',      'firm',      'none'),   // HR: employee side; PA: logins & teams
  'applause.give':                row('firm',      'team',      'none',      'none',      'none',      'none',      'none'),

  // ---- Analytics (3.8 "Analytics")
  'analytics.personal':           row('self',      'self',      'self',      'self',      'self',      'self',      'none'),
  'analytics.team':               row('firm',      'team',      'none',      'none',      'none',      'none',      'none'),
  'analytics.firm':               row('firm',      'none',      'none',      'none',      'none',      'none',      'none'),   // firm, profitability, CRM, MIS
  'analytics.operational':        row('firm',      'none',      'none',      'none',      'firm',      'none',      'none'),
  'analytics.hr':                 row('firm',      'none',      'none',      'none',      'none',      'firm',      'none'),

  // ---- Portal
  'portal.configure':             row('firm',      'none',      'none',      'none',      'none',      'none',      'none'),
  'portal.accounts.manage':       row('firm',      'none',      'none',      'none',      'firm',      'none',      'none'),
  'portal.share':                 row('firm',      'team',      'assigned',  'assigned',  'firm',      'none',      'none'),   // share docs, reply to messages
  'portal.use':                   row('none',      'none',      'none',      'none',      'none',      'none',      'portal_own'),

  // ---- Other modules
  'dms.view':                     row('firm',      'team',      'assigned',  'assigned',  'firm_read', 'none',      'portal_own'),
  'qc.manage':                    row('firm',      'team_read', 'none',      'none',      'none',      'none',      'none'),
  'qc.declare':                   row('self',      'self',      'self',      'self',      'none',      'none',      'none'),   // independence declarations
  'templates.manage':             row('firm',      'none',      'none',      'none',      'firm',      'firm',      'none'),   // HR: HR letters only
  'templates.approve':            row('firm',      'none',      'none',      'none',      'none',      'none',      'none'),
  'knowledge.write':              row('firm',      'team',      'none',      'none',      'firm',      'firm',      'none'),
  'helpdesk.raise':               row('self',      'self',      'self',      'self',      'self',      'self',      'none'),
  'helpdesk.queue':               row('firm',      'none',      'none',      'none',      'firm',      'firm',      'none'),   // HR: HR-query category only
  'meetings.manage':              row('firm',      'team',      'assigned',  'none',      'none',      'none',      'none'),

  // ---- System
  'audit.search':                 row('firm',      'team',      'self',      'self',      'firm',      'none',      'none'),
  'export.run':                   row('firm',      'team',      'self',      'self',      'firm',      'firm',      'none'),
  'import.run':                   row('firm',      'none',      'none',      'none',      'firm',      'firm',      'none'),
  'backup.download':              row('firm',      'none',      'none',      'none',      'none',      'none',      'none'),
  'backup.restore.request':       row('firm',      'none',      'none',      'none',      'firm',      'none',      'none'),
  'backup.restore.approve':       row('firm',      'none',      'none',      'none',      'none',      'none',      'none'),
  'jobs.runNow':                  row('firm',      'none',      'none',      'none',      'firm',      'firm',      'none'),   // HR: HR jobs only
  'systemLog.view':               row('firm',      'none',      'none',      'none',      'firm',      'none',      'none'),
  'demo.reset':                   row('firm',      'none',      'none',      'none',      'none',      'none',      'none'),   // demo mode only
} as const satisfies Record<string, Row>;

export type Capability = keyof typeof MATRIX;
```

## 3. Invariants that are not a single matrix cell

Enforced in services (and covered by `tests/permissions/invariants.test.ts`):

1. **Maker ≠ checker** on the same task, at every review level including EQR.
2. **Articles are never final checkers** and never `review.check`, even if granted other rights.
3. `review.check` for `STAFF` requires `user.isSenior = true` *and* a review level the template allows Seniors to clear.
4. **Billing** fields never appear in Staff/Article responses — enforced by response DTOs, not only by page guards.
5. **Salary** (structure, payslip amounts, cost rate, stipend) readable only by Partner, HR Admin and the employee themself.
   Manager's `hr.records.view = team` returns DTOs with salary fields stripped.
6. **HR Admin has no client data**: every client-scoped `scopeWhere` returns `{ id: '__none__' }` for HR_ADMIN.
7. **Portal users** get portal DTOs only: no hours, staff names beyond the assigned contact, internal notes, review points or other clients.
8. **Offboarding** (deactivate): `active=false`, `sessionEpoch++`, team memberships ended, credential grants revoked,
   portal threads removed, custody list (DSC, InwardOutward, AssetAssignment) generated; authored history untouched.
9. **Sensitive views** (credentials, financial statements, notices, salary, billing) always write `SensitiveViewLog`.
10. Mandatory 2FA roles cannot reach any page except TOTP enrolment until enrolled.
11. **Extensions and due-date master changes** require a preview confirmation step (Rules Spec §5.2).
12. Weekly-locked entries are editable only through an approved CorrectionRequest.
13. Only a Partner grants, changes, resets or deactivates the Partner, Practice Admin and HR Admin roles (D-29).
14. Everyone reads their own employee record and documents (D-30).
15. Engagement fees / chargeability change only with `billing.approve` (Partner) after creation (D-32).
16. The last active Partner cannot be deactivated; nobody can deactivate themself.
17. Fee fields are zeroed in engagement responses for roles without `billing.view` (Staff, Article).

## 4. Guard API (Phase 1)

```ts
authorize(actor, 'task.recordFiling', { clientId, engagementId, taskId }); // throws DomainError('FORBIDDEN')
const where = scopeWhere(actor, 'task');            // Prisma where-fragment for list queries
const dto   = shape(actor, 'invoice', invoiceRow);  // strips fields the role may not see
```

## 5. Test plan (built in Phase 1)

`tests/unit/permissions-matrix.test.ts` checks every role × capability against the matrix; `tests/permissions/scopes.test.ts` is table-driven: for each `Capability × Role` it seeds a
fixture (own record, team record, other-team record, unassigned record, other portal client)
and asserts allow/deny for each. 85 capabilities × 7 roles × up to 5 fixture positions.
