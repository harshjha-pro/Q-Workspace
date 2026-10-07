import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { getArticleship } from "@/server/services/hr/articleship";
import { PageHeader } from "@/components/ui/card";
import { peopleOptions } from "../../../registers/_lib/pickers";
import { ArticleshipDetail } from "../detail";

export const metadata = { title: "Articleship" };

export default async function ArticleshipDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "articleship.view");
  const { userId } = await params;
  const d = await load(() => getArticleship(actor, userId));
  const partners = d.canEdit ? await peopleOptions(["PARTNER"]) : [];
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <p className="text-sm"><Link href="/hr/articleship" className="text-brand hover:underline">← Articleship</Link></p>
      <PageHeader title={d.name} subtitle="Articleship record" />
      <ArticleshipDetail d={d} partners={partners} />
    </div>
  );
}
