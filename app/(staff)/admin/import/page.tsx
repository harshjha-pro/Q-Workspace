import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { importKindsFor, listImportJobs, getImportJob } from "@/server/services/import/service";
import { PageHeader, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDateTime } from "@/server/lib/dates";
import { ImportUpload, ApplyImport } from "./import-ui";
import Link from "next/link";

export const metadata = { title: "Import" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "import.run");
  const sp = await searchParams;
  const kinds = importKindsFor(actor);
  const [jobs, job] = await Promise.all([listImportJobs(actor), sp.job ? getImportJob(actor, sp.job) : null]);
  return (
    <div className="space-y-4">
      <PageHeader title="Import from Excel" subtitle="1. Download the template · 2. Fill it · 3. Upload to check every row · 4. Apply. Nothing is saved before Apply." />
      <Card>
        <CardHeader><CardTitle>Templates</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          {kinds.map((k) => <a key={k.kind} className="rounded border border-line bg-white px-3 py-1.5 hover:bg-gray-50" href={`/api/import/template/${k.kind}`}>{k.title} (.xlsx)</a>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Upload and check</CardTitle></CardHeader>
        <CardContent><ImportUpload kinds={kinds} /></CardContent>
      </Card>
      {job ? (
        <Card>
          <CardHeader>
            <CardTitle>Validation report — {job.fileName}</CardTitle>
            <span className="text-sm">{job.validRows} valid · <span className={job.errorRows ? "text-red-700" : ""}>{job.errorRows} with errors</span> · <Badge tone={job.status === "VALIDATED" ? "green" : job.status === "APPLIED" ? "blue" : "red"}>{job.status.toLowerCase()}</Badge></span>
          </CardHeader>
          <CardContent className="space-y-3">
            {job.preview.length ? <div className="rounded bg-gray-50 p-3 text-xs"><p className="mb-1 font-medium">Preview</p>{job.preview.map((l, i) => <p key={i}>{l}</p>)}</div> : null}
            {job.status === "VALIDATED" ? <ApplyImport jobId={job.id} /> : null}
            {job.result ? <p className="text-sm">Applied: {job.result.created} created.</p> : null}
            <Table>
              <THead><tr><TH>Sheet</TH><TH>Row</TH><TH>Data</TH><TH>Problems</TH></tr></THead>
              <TBody>
                {job.rows.map((r) => (
                  <TR key={r.id} className={r.errors.length ? "bg-red-50/50" : ""}>
                    <TD>{r.sheet}</TD><TD>{r.rowNumber}</TD>
                    <TD className="max-w-xs truncate text-xs text-muted">{Object.values(r.data).filter(Boolean).slice(0, 4).join(" · ")}</TD>
                    <TD className="text-xs text-red-700">{r.errors.join("; ") || <span className="text-green-700">OK</span>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Recent imports</CardTitle></CardHeader>
        <Table>
          <THead><tr><TH>When</TH><TH>Type</TH><TH>File</TH><TH>Rows</TH><TH>Status</TH></tr></THead>
          <TBody>
            {jobs.map((j) => (
              <TR key={j.id}>
                <TD className="text-xs">{formatDateTime(j.createdAt)}</TD><TD>{j.kind.toLowerCase().replace("_", " ")}</TD>
                <TD><Link className="text-brand hover:underline" href={`/admin/import?job=${j.id}`}>{j.fileName}</Link></TD>
                <TD>{j.validRows}/{j.totalRows}</TD><TD>{j.status.toLowerCase()}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
