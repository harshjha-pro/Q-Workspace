"use client";
import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/card";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  // Controlled so the values survive React's form reset when the TOTP step appears.
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className={state.needTotp ? "sr-only" : ""}>
        <Label htmlFor="username">Username</Label>
        <Input id="username" name="username" autoComplete="username" autoCapitalize="none" required value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div className={state.needTotp ? "sr-only" : ""}>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {state.needTotp ? (
        <div>
          <Label htmlFor="totp">6-digit code from your authenticator app</Label>
          <Input id="totp" name="totp" inputMode="numeric" pattern="[0-9 ]{6,7}" autoComplete="one-time-code" autoFocus required />
        </div>
      ) : null}
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "Signing in…" : state.needTotp ? "Verify" : "Sign in"}
      </Button>
    </form>
  );
}
