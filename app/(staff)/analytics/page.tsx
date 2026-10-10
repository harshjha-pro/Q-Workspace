import Link from "next/link";
import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { PageHeader, Card } from "@/components/ui/card";

export const metadata = { title: "Analytics" };

/** Analytics home: the dashboards this person may open (P5). */
export default async function AnalyticsHome() {
  const actor = await requireStaff();
  const practice = can(actor, "analytics.team") || can(actor, "analytics.operational");
  const items = [
    { href: "/analytics/me", title: "My dashboard", text: "Your own effort, tasks, reviews and CPE.", show: can(actor, "analytics.personal") },
    { href: "/analytics/compliance", title: "Compliance", text: "Filings due, on time and late, client delays and late-fee exposure.", show: practice },
    { href: "/analytics/engagements", title: "Engagements", text: "Budget against effort for every active engagement.", show: practice },
    { href: "/analytics/firm", title: "Firm", text: "Headline numbers for the whole firm with a 12-month trend.", show: can(actor, "analytics.firm") },
  ].filter((i) => i.show);
  return (
    <div className="space-y-4">
      <PageHeader title="Analytics" subtitle="Read-only views of what you can already see. Hours are effort, never a score." />
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((i) => (
          <Link key={i.href} href={i.href}><Card className="p-4 hover:bg-gray-50"><div className="font-medium">{i.title}</div><p className="text-sm text-muted">{i.text}</p></Card></Link>
        ))}
      </div>
    </div>
  );
}
