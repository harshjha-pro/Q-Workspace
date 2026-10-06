import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { staffLogin } from "@/server/services/auth/login";
import { revokeSession } from "@/server/services/auth/sessions";

/** Carries our login status code ("NEED_TOTP", "LOCKED", "INVALID") back to the login form. */
class LoginError extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

function clientIp(req: Request | undefined): string | undefined {
  const fwd = req?.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || undefined;
}

/**
 * Auth.js (credentials, JWT cookie). The JWT only carries our UserSession id ("sid");
 * every request re-validates that row (server/context.ts), so revocation, idle timeout
 * and deactivation take effect immediately (decisions D-09).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 12 * 3600 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      id: "staff",
      credentials: { username: {}, password: {}, totp: {} },
      async authorize(credentials, request) {
        const username = String(credentials?.username ?? "");
        const password = String(credentials?.password ?? "");
        const totp = credentials?.totp ? String(credentials.totp) : undefined;
        if (!username || !password) throw new LoginError("INVALID");
        const result = await staffLogin(
          { username, password, totp },
          { ip: clientIp(request), userAgent: request?.headers.get("user-agent") ?? undefined },
        );
        if (result.status !== "OK") throw new LoginError(result.status);
        return { id: result.userId, sid: result.sessionId } as { id: string; sid: string };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user && "sid" in user) token.sid = (user as { sid: string }).sid;
      return token;
    },
    session({ session, token }) {
      (session as unknown as { sid?: string }).sid = token.sid as string | undefined;
      return session;
    },
  },
  events: {
    async signOut(message) {
      const sid = "token" in message ? (message.token?.sid as string | undefined) : undefined;
      if (sid) await revokeSession(sid, "LOGOUT");
    },
  },
});
