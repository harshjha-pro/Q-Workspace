import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { listExtensions, listHolidays, listMaster } from "@/server/services/compliance/admin";
import { listStates } from "@/server/services/clients/service";
import { CONSTITUTIONS, CONSTITUTION_LABELS, GST_FREQUENCIES } from "@/server/domain/enums";
import { formatDate, formatDateTime, todayIst } from "@/server/lib/dates";
import { PageHeader, Card, CardContent, CardHeader, CardTitle, Alert, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { verifyLateFeeAction, verifyRuleAction, setTypeActiveAction, removeHolidayAction } from "./actions";
import {
  ActButton, AddHolidayDialog, AddLateFeeDialog, AddRuleDialog, CreateExtensionDialog, ExtensionPublish, HolidayPolicyDialog, POLICY_LABELS, RegenerateAll,
} from "./compliance-ui";

export const metadata = { title: "Due-date master" };

const TABS = [
  { key: "types", label: "Types & rules" },
  { key: "latefees", label: "Late fees" },
  { key: "extensions", label: "Extensions" },
  { key: "holidays", label: "Holidays" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const rupees = (paise: number | null) => (paise === null ? "No cap" : `₹${(paise / 100).toLocaleString("en-IN")}`);
const Verified = ({ at }: { at: Date | null }) => (at ? <Badge tone="green" title={`Verified ${formatDateTime(at)}`}>Verified</Badge> : <Badge tone="amber">Unverified</Badge>);

export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ tab?: string; year?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "dueDateMaster.manage");
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "types";
  const isPartner = actor.role === "PARTNER" || actor.role === "PRACTICE_ADMIN"; // may verify (Q-29)
  const today = todayIst();

  return (
    <div className="space-y-4">
      <PageHeader title="Due-date master" subtitle="Compliance types, due-date rules, late fees, extensions and holidays."
        actions={can(actor, "task.regenerate") ? <RegenerateAll /> : null} />
      <Alert tone="warn">
        Statutory values here (due dates, late fees, interest, extensions) are editable by admins and are seeded as <strong>Unverified</strong>.
        Check each against the official notification or circular before relying on it. Only the Practice Admin or a Partner can mark a value as verified.
      </Alert>

      <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/compliance?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined}
            className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm", tab === t.key ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-ink")}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "types" ? <TypesTab actor={actor} isPartner={isPartner} today={today} /> : null}
      {tab === "latefees" ? <LateFeesTab actor={actor} isPartner={isPartner} /> : null}
      {tab === "extensions" ? <ExtensionsTab actor={actor} /> : null}
      {tab === "holidays" ? <HolidaysTab actor={actor} year={/^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : Number(today.slice(0, 4))} /> : null}
    </div>
  );
}

type Actor = Awaited<ReturnType<typeof requireStaff>>;

async function TypesTab({ actor, isPartner, today }: { actor: Actor; isPartner: boolean; today: string }) {
  const types = await load(() => listMaster(actor));
  if (!types.length) return <EmptyState title="No compliance types yet" />;
  return (
    <Card>
      <Table>
        <THead><TR><TH>Type</TH><TH>Applies when</TH><TH>Current rule</TH><TH>Holiday policy</TH><TH>Status</TH><TH /></TR></THead>
        <TBody>
          {types.map((t) => {
            // Highest version already in force; a later-dated version shows as "upcoming".
            const current = t.rules.find((r) => r.effectiveFrom <= today) ?? t.rules[t.rules.length - 1];
            const upcoming = t.rules.filter((r) => r.effectiveFrom > today);
            return (
              <TR key={t.code} className={cn(!t.active && "opacity-60")}>
                <TD>
                  <p className="font-medium">{t.name}</p>
                  <p className="font-mono text-xs text-muted">{t.code} · {t.frequency.toLowerCase().replace(/_/g, " ")}</p>
                </TD>
                <TD className="max-w-56 text-xs">{t.appliesWhen || <span className="text-muted">—</span>}</TD>
                <TD className="min-w-56">
                  {current ? (
                    <div className="space-y-1">
                      <p className="flex flex-wrap items-center gap-1.5"><span className="font-medium">v{current.version}</span><Verified at={current.verifiedAt} /><span className="text-xs text-muted">from {formatDate(current.effectiveFrom)}</span></p>
                      <p className="text-xs text-muted">{current.kind}{current.source ? ` · ${current.source}` : ""}</p>
                      {isPartner && !current.verifiedAt ? <ActButton action={verifyRuleAction.bind(null, current.id)} label="Verify" confirm={`Confirm v${current.version} of ${t.code} matches the official notification?`} /> : null}
                      {upcoming.map((u) => (
                        <p key={u.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                          <Badge tone="blue">Upcoming v{u.version}</Badge> from {formatDate(u.effectiveFrom)} <Verified at={u.verifiedAt} />
                          {isPartner && !u.verifiedAt ? <ActButton action={verifyRuleAction.bind(null, u.id)} label="Verify" /> : null}
                        </p>
                      ))}
                      {t.rules.length > 1 ? (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-brand">History ({t.rules.length} versions)</summary>
                          <ul className="mt-1 space-y-1">
                            {t.rules.map((r) => (
                              <li key={r.id} className="flex flex-wrap items-center gap-1.5">
                                v{r.version} · {formatDate(r.effectiveFrom)} · {r.kind} <Verified at={r.verifiedAt} />
                                {r.notificationRef ? <span className="text-muted">{r.notificationRef}</span> : null}
                                <code className="block w-full break-all text-[10px] text-muted">{r.paramsJson}</code>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  ) : <span className="text-xs text-muted">No rule</span>}
                </TD>
                <TD className="text-xs">
                  {POLICY_LABELS[t.weekendHolidayPolicy] ?? t.weekendHolidayPolicy}
                  <div><HolidayPolicyDialog typeCode={t.code} policy={t.weekendHolidayPolicy} /></div>
                </TD>
                <TD>
                  <Badge tone={t.active ? "green" : "neutral"}>{t.active ? "Active" : "Inactive"}</Badge>
                  <div className="mt-1"><ActButton variant="ghost" action={setTypeActiveAction.bind(null, t.code, !t.active)} label={t.active ? "Deactivate" : "Activate"}
                    confirm={t.active ? `Deactivate ${t.code}? No new tasks will be generated for it.` : undefined} /></div>
                </TD>
                <TD><AddRuleDialog typeCode={t.code} typeName={t.name} currentParams={current?.paramsJson} /></TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );
}

async function LateFeesTab({ actor, isPartner }: { actor: Actor; isPartner: boolean }) {
  const types = await load(() => listMaster(actor));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Late fee rates per compliance type. Amounts are per day with an optional cap; interest is % per month on tax due.</p>
      {types.map((t) => (
        <Card key={t.code}>
          <CardHeader>
            <CardTitle>{t.name} <span className="font-mono text-xs font-normal text-muted">{t.code}</span></CardTitle>
            <AddLateFeeDialog typeCode={t.code} typeName={t.name} />
          </CardHeader>
          {t.lateFeeRates.length ? (
            <Table>
              <THead><TR><TH>From</TH><TH>Per day</TH><TH>Cap</TH><TH>Interest / month</TH><TH>Source</TH><TH>Status</TH></TR></THead>
              <TBody>
                {t.lateFeeRates.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap">{formatDate(r.effectiveFrom)}{r.effectiveTo ? ` – ${formatDate(r.effectiveTo)}` : ""}</TD>
                    <TD>{rupees(r.perDayPaise)}</TD>
                    <TD>{rupees(r.maxPaise)}</TD>
                    <TD>{(r.interestBpPerMonth / 100).toLocaleString("en-IN")}%</TD>
                    <TD className="text-xs">{r.source}{r.note ? <span className="block text-muted">{r.note}</span> : null}</TD>
                    <TD>
                      <Verified at={r.verifiedAt} />
                      {isPartner && !r.verifiedAt ? <div className="mt-1"><ActButton action={verifyLateFeeAction.bind(null, r.id)} label="Verify" /></div> : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <CardContent className="text-sm text-muted">No late fee rates recorded.</CardContent>}
        </Card>
      ))}
    </div>
  );
}

const EXT_TONE = { DRAFT: "amber", PUBLISHED: "green", SUPERSEDED: "neutral" } as const;

async function ExtensionsTab({ actor }: { actor: Actor }) {
  const canPublish = can(actor, "extension.publish");
  const [extensions, types] = await Promise.all([load(() => listExtensions(actor)), load(() => listMaster(actor))]);
  const typeName = new Map(types.map((t) => [t.code, t.name]));
  const published = extensions.filter((e) => e.status === "PUBLISHED").map((e) => ({ id: e.id, label: `${e.notificationRef || "Extension"} → ${formatDate(e.newEffectiveDueDate)}` }));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Extensions are append-only. To correct a published one, publish a new extension that supersedes it.</p>
        {canPublish ? (
          <CreateExtensionDialog types={types.filter((t) => t.active).map((t) => ({ code: t.code, name: t.name }))}
            constitutions={CONSTITUTIONS.map((c) => ({ value: c, label: CONSTITUTION_LABELS[c] }))} gstFrequencies={[...GST_FREQUENCIES]} published={published} />
        ) : null}
      </div>
      {extensions.length === 0 ? <EmptyState title="No extensions yet" /> : extensions.map((e) => (
        <Card key={e.id}>
          <CardHeader>
            <CardTitle>{e.notificationRef || "Extension"} → new due date {formatDate(e.newEffectiveDueDate)}</CardTitle>
            <Badge tone={EXT_TONE[e.status as keyof typeof EXT_TONE] ?? "neutral"}>{e.status.toLowerCase()}</Badge>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted">Types:</span> {e.types.map((t) => typeName.get(t.complianceTypeCode) ?? t.complianceTypeCode).join(", ")}</p>
            <p><span className="text-muted">Periods:</span> {e.periodsMode === "ALL_OPEN" ? "All open periods" : e.periodKeys.split(",").join(", ")}</p>
            <p><span className="text-muted">Clients:</span> {e.scopes.length === 0 ? "All clients" : e.scopes.map((s) => `${s.field}: ${s.valuesCsv.split(",").join(", ")}`).join(" · ")}</p>
            <p><span className="text-muted">Reason:</span> {e.reason}</p>
            <p className="text-xs text-muted">
              Created {formatDateTime(e.createdAt)}{e.publishedAt ? ` · published ${formatDateTime(e.publishedAt)}` : ""}{e.previewCount !== null ? ` · last preview ${e.previewCount} task(s)` : ""}
              {e.supersedesId ? " · supersedes an earlier extension" : ""}
            </p>
            {e.status === "DRAFT" && canPublish ? <ExtensionPublish id={e.id} /> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function HolidaysTab({ actor, year }: { actor: Actor; year: number }) {
  const canManage = can(actor, "holidays.manage");
  const [holidays, states] = await Promise.all([load(() => listHolidays(actor, year)), listStates()]);
  const stateName = new Map(states.map((s) => [s.code, s.name]));
  const yearLink = (y: number) => `/admin/compliance?tab=holidays&year=${y}`;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1">
          <Link href={yearLink(year - 1)} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label="Previous year">‹ {year - 1}</Link>
          <CardTitle className="px-2">{year}</CardTitle>
          <Link href={yearLink(year + 1)} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label="Next year">{year + 1} ›</Link>
        </div>
        {canManage ? <AddHolidayDialog states={states.map((s) => ({ code: s.code, name: s.name }))} year={year} /> : null}
      </CardHeader>
      {holidays.length === 0 ? <CardContent><EmptyState title={`No holidays recorded for ${year}`} /></CardContent> : (
        <Table>
          <THead><TR><TH>Date</TH><TH>Name</TH><TH>Kind</TH><TH /></TR></THead>
          <TBody>
            {holidays.map((h) => (
              <TR key={h.id}>
                <TD className="whitespace-nowrap">{formatDate(h.date)}</TD>
                <TD>{h.name}</TD>
                <TD className="text-xs">{h.kind === "STATE" ? `State · ${stateName.get(h.stateCode) ?? h.stateCode}` : h.kind === "FIRM" ? "Firm" : "National"}</TD>
                <TD>{canManage ? <ActButton variant="ghost" action={removeHolidayAction.bind(null, h.id)} label="Remove" confirm={`Remove ${h.name} (${formatDate(h.date)})?`} /> : null}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
