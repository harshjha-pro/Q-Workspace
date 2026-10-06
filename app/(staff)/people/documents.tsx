import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/server/lib/dates";
import { UploadEmployeeDoc } from "./upload-doc";

type Doc = { id: string; name: string; kind: string; createdAt: Date; versions: { sizeBytes: number }[] };

/** Employee KYC and certificates (P1-21). Visible to the person, HR and Partners only. */
export function EmployeeDocuments({ userId, docs, canUpload }: { userId: string; docs: Doc[]; canUpload: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>Documents (KYC, certificates)</CardTitle>{canUpload ? <UploadEmployeeDoc userId={userId} /> : null}</CardHeader>
      <CardContent className="space-y-1 text-sm">
        {docs.map((d) => (
          <div key={d.id} className="flex flex-wrap justify-between gap-2">
            <a className="text-brand hover:underline" href={`/api/files/${d.id}`}>{d.name}</a>
            <span className="text-xs text-muted">{d.kind.toLowerCase()} · {Math.ceil((d.versions[0]?.sizeBytes ?? 0) / 1024)} KB · {formatDateTime(d.createdAt)}</span>
          </div>
        ))}
        {docs.length === 0 ? <p className="text-muted">No documents.</p> : null}
      </CardContent>
    </Card>
  );
}
