"use server";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type PortalLoginState = { error?: string; needTotp?: boolean };

const MESSAGES: Record<string, string> = {
  INVALID: "Email, password or code is not right.",
  LOCKED: "Too many attempts. Your access is locked for a few minutes.",
};

export async function portalLoginAction(_prev: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  try {
    await signIn("portal", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      totp: String(form.get("totp") ?? ""),
      redirectTo: "/portal",
    });
    return {};
  } catch (e) {
    if (e instanceof AuthError) {
      const code = (e as AuthError & { code?: string }).code ?? "INVALID";
      if (code === "NEED_TOTP") return { needTotp: true };
      return { error: MESSAGES[code] ?? MESSAGES.INVALID, needTotp: Boolean(form.get("totp")) };
    }
    throw e; // successful sign-in redirects by throwing
  }
}
