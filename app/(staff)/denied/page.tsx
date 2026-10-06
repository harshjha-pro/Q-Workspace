import Link from "next/link";
import { EmptyState } from "@/components/ui/card";

export const metadata = { title: "No access" };

export default function DeniedPage() {
  return (
    <EmptyState title="You do not have access to this page">
      Access follows your role and the clients you are assigned to. <Link className="underline" href="/">Go to Home</Link>
    </EmptyState>
  );
}
