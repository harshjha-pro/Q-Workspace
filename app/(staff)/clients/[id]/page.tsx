import Link from "next/link";
import { requireStaff } from "@/server/context";
import { getClient } from "@/server/services/clients/service";
import { listEngagements } from "@/server/services/engagements/service";
import { can } from "@/server/permissions/guards";
import { load } from "@/lib/page";
import { clientFormOptions } from "@/lib/options";
import { PageHeader, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { CONSTITUTION_LABELS, CLIENT_FLAGS, isCompany, type Constitution, SERVICE_LINE_LABELS, type ServiceLine } from "@/server/domain/enums";
import { FLAG_INFO } from "@/server/domain/flags";
import { formatDate, formatDateTime } from "@/server/lib/dates";
import { clientStatusTone } from "@/components/status";
import { ClientDialogs, GstinEditDialog, DirectorCeaseDialog } from "./dialogs";

export const metadata = { title: "Client" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right">{value || "—"}</span>
    </div>
  );
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireStaff();
  const { client: c, canManage } = await load(() => getClient(actor, id));
  const canFlags = canManage && can(actor, "client.flags.edit");
  const engagements = can(actor, "engagement.view") ? await listEngagements(actor, { clientId: id }) : [];
  const options = canManage ? await clientFormOptions(actor) : null;
  const ptStates = options?.states.filter((s) => s.ptLevied) ?? [];
  const company = isCompany(c.constitution);

  return (
    <div className="space-y-4">
      <PageHeader
        title={c.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{c.code}</span>
            <span>{CONSTITUTION_LABELS[c.constitution as Constitution]}</span>
            {c.group ? <Link href={`/groups/${c.group.id}`} className="underline">{c.group.name}</Link> : null}
            <Badge tone={clientStatusTone(c.status)}>{c.status.toLowerCase()}</Badge>
          </span>
        }
        actions={
          <span className="flex flex-wrap gap-2">
            {can(actor, "task.view") ? <Link href={`/tasks?clientId=${c.id}&all=1`} className={buttonVariants({ variant: "secondary" })}>Tasks</Link> : null}
            {can(actor, "vault.view") ? <Link href={`/clients/${c.id}/vault`} className={buttonVariants({ variant: "secondary" })}>Credentials</Link> : null}
            {can(actor, "dms.view") ? <Link href={`/documents?clientId=${c.id}`} className={buttonVariants({ variant: "secondary" })}>Documents</Link> : null}
            {can(actor, "crm.view") ? <Link href={`/crm/clients/${c.id}/communications`} className={buttonVariants({ variant: "secondary" })}>Communications</Link> : null}
            {can(actor, "crm.manage") ? <Link href={`/crm/onboarding/${c.id}`} className={buttonVariants({ variant: "secondary" })}>Onboarding</Link> : null}
            {canManage ? <Link href={`/clients/${c.id}/edit`} className={buttonVariants({ variant: "secondary" })}>Edit details</Link> : null}
          </span>
        }
      />

      {canManage ? (
        <ClientDialogs
          clientId={c.id}
          status={c.status}
          canFlags={canFlags}
          company={company}
          directorsAllowed={company || c.constitution === "LLP"}
          flags={Object.fromEntries(CLIENT_FLAGS.map((f) => [f, c[f]]))}
          ptStates={ptStates.map((s) => ({ code: s.code, name: s.name }))}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Identifiers</CardTitle></CardHeader>
          <CardContent>
            <Row label="PAN" value={<span className="font-mono">{c.pan}</span>} />
            <Row label="TAN" value={<span className="font-mono">{c.tan}</span>} />
            <Row label={c.constitution === "LLP" ? "LLPIN" : "CIN"} value={<span className="font-mono">{c.cinLlpin}</span>} />
            <Row label="Udyam" value={c.udyam} />
            <Row label="State" value={c.stateCode} />
            <Row label="Incorporated / born" value={formatDate(c.incorporationDate)} />
            <Row label="Financial year ends" value={c.fyEnd} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Responsibility</CardTitle></CardHeader>
          <CardContent>
            <Row label="Partner" value={c.partner?.displayName} />
            <Row label="Manager" value={c.manager?.displayName} />
            <Row label="Client team" value={c.team?.name} />
            <Row label="Books maintained by" value={c.booksBy === "FIRM" ? "Firm" : "Client"} />
            <Row label="Category" value={c.category} />
            <Row label="KYC" value={c.kycStatus.toLowerCase()} />
            <Row label="Preferred channel" value={c.preferredChannel.toLowerCase()} />
            <Row label="Onboarded" value={formatDate(c.onboardingDate)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Applicability flags</CardTitle><span className="text-xs text-muted">Changes take effect from a date you choose and are kept in the history below.</span></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {CLIENT_FLAGS.filter((f) => f !== "dpt3Applicable" || company).map((f) => (
            <div key={f} className="flex items-start gap-2 text-sm">
              <Badge tone={c[f] ? "green" : "neutral"}>{c[f] ? "Yes" : "No"}</Badge>
              <span><span className="font-medium">{FLAG_INFO[f].label}</span> <span className="text-muted">— {FLAG_INFO[f].appliesWhen}</span></span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>GSTINs ({c.gstins.length})</CardTitle><span className="text-xs text-muted">Each GSTIN has its own state and filing frequency; GST tasks are generated per GSTIN.</span></CardHeader>
        <Table>
          <THead><tr><TH>GSTIN</TH><TH>State</TH><TH>Frequency</TH><TH>IFF</TH><TH>GSTR-9 / 9C</TH><TH>Status</TH><TH /></tr></THead>
          <TBody>
            {c.gstins.length === 0 ? <TR><TD colSpan={7} className="text-muted">Not GST registered.</TD></TR> : null}
            {c.gstins.map((g) => (
              <TR key={g.id}>
                <TD className="font-mono">{g.gstin}</TD>
                <TD>{g.stateCode}</TD>
                <TD>{g.frequency.toLowerCase()} <span className="text-xs text-muted">from {formatDate(g.frequencyEffectiveFrom)}</span></TD>
                <TD>{g.iffOpted ? "Yes" : "—"}</TD>
                <TD>{g.annualReturnApplicable ? "9" : "—"}{g.gstr9cApplicable ? " / 9C" : ""}</TD>
                <TD><Badge tone={g.status === "ACTIVE" ? "green" : "neutral"}>{g.status.toLowerCase()}</Badge></TD>
                <TD>{canFlags ? <GstinEditDialog clientId={c.id} gstin={g} /> : null}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {company || c.constitution === "LLP" ? (
        <Card>
          <CardHeader><CardTitle>{c.constitution === "LLP" ? "Designated partners" : "Directors"} ({c.directors.filter((d) => !d.ceasedOn).length})</CardTitle><span className="text-xs text-muted">DIR-3 KYC is one obligation per director (DIN), held on their primary company.</span></CardHeader>
          <Table>
            <THead><tr><TH>DIN</TH><TH>Name</TH><TH>Designation</TH><TH>Appointed</TH><TH>DIR-3 KYC held here</TH><TH /></tr></THead>
            <TBody>
              {c.directors.map((d) => (
                <TR key={d.id} className={d.ceasedOn ? "opacity-60" : ""}>
                  <TD className="font-mono">{d.director.din}</TD>
                  <TD>{d.director.name}</TD>
                  <TD>{d.designation.toLowerCase().replace(/_/g, " ")}{d.ceasedOn ? ` (ceased ${formatDate(d.ceasedOn)})` : ""}</TD>
                  <TD>{formatDate(d.appointedOn)}</TD>
                  <TD>{d.director.primaryClientId === c.id ? "Yes" : "No"}</TD>
                  <TD>{canManage && !d.ceasedOn ? <DirectorCeaseDialog clientId={c.id} directorId={d.director.id} name={d.director.name} /> : null}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Contacts</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {c.contacts.map((ct) => (
              <div key={ct.id} className="text-sm">
                <span className="font-medium">{ct.name}</span> {ct.role ? <span className="text-muted">({ct.role})</span> : null}
                {ct.isPrimary ? <Badge tone="brand" className="ml-1">primary</Badge> : null}
                {ct.isBilling ? <Badge className="ml-1">billing</Badge> : null}
                <div className="text-xs text-muted">{[ct.email, ct.phone, ct.whatsapp ? `WhatsApp ${ct.whatsapp}` : null].filter(Boolean).join(" · ")}</div>
              </div>
            ))}
            {c.contacts.length === 0 ? <p className="text-sm text-muted">No contacts yet.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Professional Tax registrations</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {c.ptRegistrations.map((p) => (
              <div key={p.id}>{p.stateCode} · {p.kind.toLowerCase()} · {p.registrationNo ?? "no number"} · from {formatDate(p.effectiveFrom)}{p.effectiveTo ? ` to ${formatDate(p.effectiveTo)}` : ""}</div>
            ))}
            {c.ptRegistrations.length === 0 ? <p className="text-muted">None.</p> : null}
          </CardContent>
        </Card>
      </div>

      {can(actor, "engagement.view") ? (
        <Card>
          <CardHeader>
            <CardTitle>Engagements</CardTitle>
            {can(actor, "engagement.manage") ? <Link href={`/engagements/new?client=${c.id}`} className={buttonVariants({ size: "sm", variant: "secondary" })}>New engagement</Link> : null}
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {engagements.map((e) => (
              <div key={e.id} className="flex flex-wrap justify-between gap-2">
                <Link href={`/engagements/${e.id}`} className="text-brand hover:underline">{e.code} — {e.name}</Link>
                <span className="text-muted">{SERVICE_LINE_LABELS[e.serviceLine as ServiceLine]} · {e.status.toLowerCase()}</span>
              </div>
            ))}
            {engagements.length === 0 ? <p className="text-muted">No engagements you can see.</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Change history (flags, status, GSTINs, PT)</CardTitle></CardHeader>
        <Table>
          <THead><tr><TH>Effective</TH><TH>What</TH><TH>From → To</TH><TH>Reason</TH><TH>Recorded</TH></tr></THead>
          <TBody>
            {c.flagHistory.map((h) => (
              <TR key={h.id}>
                <TD>{formatDate(h.effectiveDate)}</TD>
                <TD>{h.flag in FLAG_INFO ? FLAG_INFO[h.flag as keyof typeof FLAG_INFO].label : h.flag}</TD>
                <TD>{h.oldValue ?? "—"} → {h.newValue ?? "—"}</TD>
                <TD>{h.reason}</TD>
                <TD className="text-xs text-muted">{formatDateTime(h.changedAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
