import fs from "node:fs";
import path from "node:path";
import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { PageHeader, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/server/lib/dates";

export const metadata = { title: "System log" };

type Line = { level: number; time: string; msg: string; rest: Record<string, unknown> };
const LEVELS: Record<number, { name: string; tone: "neutral" | "amber" | "red" | "blue" }> = { 20: { name: "debug", tone: "neutral" }, 30: { name: "info", tone: "blue" }, 40: { name: "warn", tone: "amber" }, 50: { name: "error", tone: "red" }, 60: { name: "fatal", tone: "red" } };

/** Local structured log (replaces Sentry/uptime tools, brief §4). Shows the newest 300 lines. */
function readTail(file: string, max = 300): Line[] {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  return text.trim().split("\n").slice(-max).reverse().flatMap((l) => {
    try {
      const { level, time, msg, pid: _p, hostname: _h, ...rest } = JSON.parse(l) as Record<string, unknown>;
      return [{ level: Number(level), time: String(time), msg: String(msg ?? ""), rest }];
    } catch {
      return [];
    }
  });
}

export default async function SystemLogPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "systemLog.view");
  const sp = await searchParams;
  const min = Number(sp.level ?? 30);
  const lines = readTail(path.join(process.env.LOG_DIR ?? "./logs", "app.log")).filter((l) => l.level >= min);
  return (
    <div className="space-y-3">
      <PageHeader title="System log" subtitle="Errors, job runs and restores. Never contains passwords, keys or decrypted data."
        actions={<span className="flex gap-2 text-sm"><a className="underline" href="?level=30">info+</a><a className="underline" href="?level=40">warnings+</a><a className="underline" href="?level=50">errors</a></span>} />
      <Card className="divide-y divide-line">
        {lines.length === 0 ? <p className="p-4 text-sm text-muted">Nothing logged at this level.</p> : null}
        {lines.map((l, i) => (
          <div key={i} className="px-3 py-2 text-xs">
            <span className="mr-2 text-muted">{formatDateTime(new Date(l.time))}</span>
            <Badge tone={LEVELS[l.level]?.tone ?? "neutral"}>{LEVELS[l.level]?.name ?? l.level}</Badge>
            <span className="ml-2 font-medium">{l.msg}</span>
            {Object.keys(l.rest).length ? <pre className="mt-1 whitespace-pre-wrap break-all text-muted">{JSON.stringify(l.rest)}</pre> : null}
          </div>
        ))}
      </Card>
    </div>
  );
}
