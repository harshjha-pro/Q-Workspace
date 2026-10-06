import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { listTeams } from "@/server/services/teams/service";
import { listUserOptions } from "@/server/services/users/service";
import { PageHeader, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamControls, NewTeam, RemoveMember } from "./team-controls";

export const metadata = { title: "Client teams" };

export default async function TeamsPage() {
  const actor = await requireStaff();
  requireCap(actor, "users.manage");
  const [teams, people] = await Promise.all([listTeams(actor), listUserOptions(actor, ["PARTNER", "MANAGER", "STAFF", "ARTICLE"])]);
  const managers = people.filter((p) => p.role === "MANAGER" || p.role === "PARTNER").map((p) => ({ id: p.id, name: p.displayName }));
  return (
    <div className="space-y-4">
      <PageHeader title="Client teams" subtitle="Visibility is scoped by client team. Leaving a team removes vault access for its clients at once." actions={<NewTeam managers={managers} />} />
      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((t) => (
          <Card key={t.id}>
            <CardHeader><CardTitle>{t.name}</CardTitle><span className="text-xs text-muted">Lead: {t.leadManager?.displayName ?? "—"} · {t._count.clients} clients</span></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {t.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between">
                  <span>{m.user.displayName} <span className="text-xs text-muted">{m.user.role.toLowerCase()}</span></span>
                  <RemoveMember teamId={t.id} userId={m.userId} />
                </div>
              ))}
              <TeamControls teamId={t.id} people={people.map((p) => ({ id: p.id, name: `${p.displayName} (${p.role.toLowerCase()})` }))} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
