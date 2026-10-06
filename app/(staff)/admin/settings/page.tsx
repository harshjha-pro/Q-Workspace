import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { listSettings } from "@/server/services/settings/service";
import { isDemoMode } from "@/server/lib/env";
import { can } from "@/server/permissions/guards";
import { PageHeader, Card, CardContent, CardHeader, CardTitle, Alert } from "@/components/ui/card";
import { SettingRow, DemoReset } from "./settings-ui";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requireStaff();
  requireCap(actor, "settings.manage");
  const settings = await listSettings();
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="Firm-level settings. Statutory values (due dates, rates, slabs) live in their own dated tables, not here." />
      <Card>
        <CardHeader><CardTitle>General</CardTitle></CardHeader>
        <CardContent className="divide-y divide-line">
          {settings.map((s) => <SettingRow key={s.key} k={s.key} description={s.description} value={s.value} isDefault={s.isDefault} />)}
        </CardContent>
      </Card>
      {isDemoMode() && can(actor, "demo.reset") ? (
        <Card>
          <CardHeader><CardTitle>Demo data</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Alert tone="warn">Demo mode is on. Reset wipes every record and reloads the demo firm. This button does not exist when DEMO_MODE is false.</Alert>
            <DemoReset />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
