"use server";
import * as svc from "@/server/services/hr/expenses";
import type { ActionResult } from "@/lib/action";
import { act, bool, fileOf, opt, rupees, str } from "../recruitment/_act";

const PATHS = ["/me/expenses", "/hr/expenses"];

export async function createClaimAction(_: ActionResult, f: FormData) {
  const receipt = await fileOf(f, "receipt");
  const km = str(f, "distanceKm");
  const visits = str(f, "visits");
  return act(
    (a) => svc.createClaim(a, {
      date: str(f, "date"), kind: str(f, "kind") as "CONVEYANCE", amountPaise: rupees(f, "amount"), mode: (opt(f, "mode") as "TWO_WHEELER" | null) ?? null,
      distanceKm: km ? Number(km) : null, visits: visits ? Number(visits) : null, clientId: opt(f, "clientId"), workEntryId: opt(f, "workEntryId"),
      clientRecoverable: bool(f, "clientRecoverable"), description: str(f, "description"),
    }, receipt),
    "Claim submitted for approval.", PATHS,
  );
}

export async function cancelClaimAction(id: string) {
  return act((a) => svc.cancelClaim(a, id), "Withdrawn.", PATHS);
}

export async function decideClaimAction(id: string, _: ActionResult, f: FormData) {
  return act((a) => svc.decideClaim(a, id, str(f, "decision") === "approve", str(f, "note")), "Decision recorded.", [...PATHS, "/billing/disbursements"]);
}

export async function markPaidAction(id: string, via: "PAYROLL" | "SEPARATE") {
  return act((a) => svc.markClaimPaid(a, id, via), "Marked paid.", PATHS);
}

export async function addRateAction(_: ActionResult, f: FormData) {
  return act((a) => svc.addConveyanceRate(a, { mode: str(f, "mode") as "TWO_WHEELER", ratePaise: rupees(f, "rate") ?? 0, effectiveFrom: str(f, "effectiveFrom") }), "Rate saved.", PATHS);
}
