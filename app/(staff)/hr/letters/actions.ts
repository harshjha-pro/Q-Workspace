"use server";
import * as svc from "@/server/services/hr/letters";
import type { ActionResult } from "@/lib/action";
import { act, bool, str } from "../recruitment/_act";

const P = ["/hr/letters", "/me/growth"];

export async function generateLetterAction(_: ActionResult, f: FormData) {
  const extra: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("extra:") && String(v).trim()) extra[k.slice(6)] = String(v).trim();
  return act((a) => svc.generateLetter(a, { userId: str(f, "userId"), kind: str(f, "kind") as svc.LetterKind, extra, allowMissing: bool(f, "allowMissing") }), "Letter generated. Check it, then mark it issued.", P);
}

export async function issueLetterAction(id: string) {
  return act((a) => svc.markLetterIssued(a, id), "Issued: the employee can now download it.", P);
}

export async function publishPolicyAction(_: ActionResult, f: FormData) {
  return act((a) => svc.publishPolicy(a, { title: str(f, "title"), kind: str(f, "kind") as "LEAVE", body: str(f, "body"), effectiveFrom: str(f, "effectiveFrom"), requiresAck: bool(f, "requiresAck") }), "Policy published.", P);
}
