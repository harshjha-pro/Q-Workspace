import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { listBackups } from "@/server/services/backup/service";
import { can } from "@/server/permissions/guards";
import { PageHeader, Card, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDateTime } from "@/server/lib/dates";
import { BackupNow, RestoreControls, UploadBackup } from "./backup-ui";

export const metadata = { title: "Backup & restore" };

export default async function BackupsPage() {
  const actor = await requireStaff();
  requireCap(actor, "backup.restore.request");
  const rows = await listBackups(actor);
  const isPartner = can(actor, "backup.restore.approve");
  return (
    <div className="space-y-4">
      <PageHeader title="Backup & restore" subtitle="A backup holds the database and every uploaded file. Automatic backup runs nightly at 23:30 IST."
        actions={<><BackupNow />{can(actor, "backup.download") ? <UploadBackup /> : null}</>} />
      <Alert tone="warn">Restoring replaces all current data with the backup. A Practice Admin can request it; a Partner must approve. The current state is saved first as a pre-restore backup. Keep a copy of the .env file too — without its keys, encrypted fields in a backup cannot be read.</Alert>
      <Card>
        <Table>
          <THead><tr><TH>Taken</TH><TH>Kind</TH><TH>File</TH><TH>Size</TH><TH>Status</TH><TH /></tr></THead>
          <TBody>
            {rows.map((b) => (
              <TR key={b.id}>
                <TD className="text-xs">{formatDateTime(b.createdAt)}</TD>
                <TD>{b.kind.toLowerCase().replace("_", "-")}</TD>
                <TD className="font-mono text-xs">{b.fileName}</TD>
                <TD>{(b.sizeBytes / 1024 / 1024).toFixed(1)} MB</TD>
                <TD>{!b.exists ? <Badge tone="red">file missing</Badge> : b.status === "RESTORE_REQUESTED" ? <Badge tone="amber">restore requested</Badge> : <Badge tone="green">ok</Badge>}</TD>
                <TD>{b.exists ? <RestoreControls id={b.id} requested={b.status === "RESTORE_REQUESTED"} isPartner={isPartner} canDownload={can(actor, "backup.download")} /> : null}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
