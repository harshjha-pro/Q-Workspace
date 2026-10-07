import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { isDomainError } from "@/server/lib/errors";
import { getArticleship } from "@/server/services/hr/articleship";
import { PageHeader, EmptyState } from "@/components/ui/card";
import { ArticleshipDetail } from "../../hr/articleship/detail";

export const metadata = { title: "My articleship" };

export default async function MyArticleshipPage() {
  const actor = await requireStaff();
  requireCap(actor, "articleship.view");
  const d = await getArticleship(actor, actor.userId).catch((e) => (isDomainError(e) && e.code === "NOT_FOUND" ? null : Promise.reject(e)));
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="My articleship" subtitle="Your registration, leave against entitlement, exposure across service lines and your principal's feedback." />
      {d ? <ArticleshipDetail d={d} partners={[]} /> : <EmptyState title="No articleship record yet">HR adds your institute registration details here.</EmptyState>}
    </div>
  );
}
