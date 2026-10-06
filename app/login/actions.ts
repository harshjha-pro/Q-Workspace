"use server";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = { error?: string; needTotp?: boolean };

const MESSAGES: Record<string, string> = {
  INVALID: "Username, password or code is not right.",
  LOCKED: "Too many attempts. The account is locked for a few minutes.",
};

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  try {
    await signIn("staff", {
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
      totp: String(form.get("totp") ?? ""),
      redirectTo: "/",
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
