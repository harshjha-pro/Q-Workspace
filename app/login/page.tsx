import { redirect } from "next/navigation";
import { getSession } from "@/server/context";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const s = await getSession();
  if (s?.actor.kind === "USER") redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-brand text-lg font-bold text-white">Q</div>
          <h1 className="text-lg font-semibold">QEPEX Work Tracker</h1>
          <p className="text-sm text-muted">Track work. Never miss a due date.</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-muted">Forgot your password? Ask your Practice Admin to reset it.</p>
      </div>
    </main>
  );
}
