import { timingSafeEqual } from "node:crypto";
import { isDemoMode } from "@/server/lib/env";

/**
 * One-time import of the DEMO firm's files into Vercel Blob (web deployment, D-99). The demo database is
 * imported into MySQL as a SQL file; its documents (generated PDFs, sample uploads) are posted here one by one.
 * Refused unless DEMO_MODE=true, DEMO_FILE_IMPORT=true (switched off again after the import), Blob is configured
 * and the request carries the CRON_SECRET. Real firm data never goes through this route.
 */
export const dynamic = "force-dynamic";

function authorised(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function POST(req: Request) {
  if (!authorised(req)) return new Response("Unauthorized", { status: 401 });
  if (!isDemoMode() || process.env.DEMO_FILE_IMPORT !== "true" || !process.env.BLOB_READ_WRITE_TOKEN) return new Response("Not available", { status: 404 });
  const path = req.headers.get("x-storage-path") ?? "";
  // Same shape storeFile produces: safe segments, a random hex name and an allowed extension.
  if (!/^([A-Za-z0-9._-]+\/){1,6}[0-9a-f]{24}\.(pdf|jpg|jpeg|png|xlsx|docx|zip|xls|doc|csv|txt|json|xml)$/.test(path) || path.includes("..")) {
    return new Response("Bad path", { status: 400 });
  }
  const data = Buffer.from(await req.arrayBuffer());
  if (!data.length || data.length > 25 * 1024 * 1024) return new Response("Bad size", { status: 400 });
  const { put } = await import("@vercel/blob");
  await put(path, data, { access: "private", addRandomSuffix: false, allowOverwrite: true });
  return Response.json({ ok: true, path, bytes: data.length });
}
