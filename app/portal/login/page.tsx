import { redirect } from "next/navigation";
import { getSession } from "@/server/context";
import { PortalLoginForm } from "./login-form";
import { AuthCard } from "../_ui/auth-card";

export const metadata = { title: "Client portal sign in" };

export default async function PortalLoginPage() {
  const s = await getSession();
  if (s?.actor.kind === "PORTAL") redirect("/portal");
  return (
    <AuthCard title="QEPEX Client Portal" subtitle="Your documents, filings and invoices in one place." footer="First time, or forgot your password? Ask the firm for a new invite link.">
      <PortalLoginForm />
    </AuthCard>
  );
}
