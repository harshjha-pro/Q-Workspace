"use server";
import * as svc from "@/server/services/hr/assets";
import type { ActionResult } from "@/lib/action";
import { act, opt, str } from "../recruitment/_act";

const P = ["/hr/assets", "/me/growth"];

export async function createAssetAction(_: ActionResult, f: FormData) {
  return act((a) => svc.createAsset(a, { tag: str(f, "tag"), kind: str(f, "kind") as "LAPTOP", description: str(f, "description"), serial: str(f, "serial"), purchaseDate: opt(f, "purchaseDate") }), "Asset added.", P);
}

export async function issueAssetAction(assetId: string, _: ActionResult, f: FormData) {
  return act((a) => svc.issueAsset(a, assetId, str(f, "userId"), str(f, "issuedAt")), "Issued.", P);
}

export async function returnAssetAction(assetId: string, _: ActionResult, f: FormData) {
  return act((a) => svc.returnAsset(a, assetId, str(f, "condition") as "GOOD", str(f, "returnedAt")), "Return recorded.", [...P, "/hr/exits"]);
}

export async function retireAssetAction(assetId: string) {
  return act((a) => svc.retireAsset(a, assetId), "Retired.", P);
}
