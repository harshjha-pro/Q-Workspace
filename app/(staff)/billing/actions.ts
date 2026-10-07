"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import * as svc from "@/server/services/billing/service";
import { db } from "@/server/lib/db";
import { assertClientAccess } from "@/server/permissions/scopes";
import { parseInrToPaise } from "@/server/lib/money";
import { toActionError, type ActionResult } from "@/lib/action";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const money = (f: FormData, k: string, required = true): number | undefined => {
  const v = str(f, k);
  if (!v) return required ? Number.NaN : undefined;
  const p = parseInrToPaise(v);
  return p === null ? Number.NaN : p;
};
function moneyOrThrow(f: FormData, k: string, required = true) {
  const v = money(f, k, required);
  if (v !== undefined && Number.isNaN(v)) throw Object.assign(new Error("money"), { field: k });
  return v;
}
function wrap(e: unknown): ActionResult<never> {
  if (e instanceof Error && e.message === "money") {
    const field = (e as Error & { field: string }).field;
    return { ok: false, error: "Enter a valid amount in rupees.", fieldErrors: { [field]: "Enter an amount like 12,500 or 12500.50" } };
  }
  return toActionError(e);
}
const refresh = (id?: string) => {
  revalidatePath("/billing");
  revalidatePath("/billing/invoices");
  if (id) revalidatePath(`/billing/invoices/${id}`);
};

// ---- Invoice builder -------------------------------------------------------

export type BuilderData = {
  engagements: { id: string; label: string; feeBasis: string }[];
  gstins: { gstin: string; stateCode: string }[];
  disbursements: { id: string; date: string; amountPaise: number; description: string; kind: string }[];
  clientState: string | null;
};

export async function builderDataAction(clientId: string): Promise<ActionResult<BuilderData>> {
  const actor = await requireStaff();
  try {
    await assertClientAccess(actor, "billing.raise", clientId);
    const [client, engagements, disbursements] = await Promise.all([
      db().client.findUniqueOrThrow({ where: { id: clientId }, select: { stateCode: true, gstins: { where: { status: "ACTIVE" }, select: { gstin: true, stateCode: true } } } }),
      db().engagement.findMany({ where: { clientId, status: { notIn: ["CANCELLED", "ARCHIVED"] } }, select: { id: true, code: true, name: true, feeBasis: true }, orderBy: { name: "asc" } }),
      svc.unrecoveredForClient(actor, clientId),
    ]);
    return {
      ok: true,
      data: {
        clientState: client.stateCode, gstins: client.gstins,
        engagements: engagements.map((e) => ({ id: e.id, label: `${e.name} (${e.code})`, feeBasis: e.feeBasis })),
        disbursements: disbursements.map((d) => ({ id: d.id, date: d.date, amountPaise: d.amountPaise, description: d.description, kind: d.kind })),
      },
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function suggestLinesAction(engagementId: string, from: string, to: string): Promise<ActionResult<svc.LineInput[]>> {
  const actor = await requireStaff();
  try {
    return { ok: true, data: await svc.suggestFeeLines(actor, engagementId, { from: from || undefined, to: to || undefined }) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveDraftAction(id: string | null, input: svc.DraftInput): Promise<ActionResult<{ id: string }>> {
  const actor = await requireStaff();
  try {
    const inv = id ? await svc.updateDraft(actor, id, { ...input, clientId: undefined } as Partial<svc.DraftInput>) : await svc.createDraft(actor, input);
    refresh(inv.id);
    return { ok: true, data: { id: inv.id }, message: "Draft saved." };
  } catch (e) {
    return toActionError(e);
  }
}

// ---- Invoice lifecycle -----------------------------------------------------

export async function issueAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const inv = await svc.issueInvoice(actor, id, { date: str(f, "date") || undefined });
    refresh(id);
    return { ok: true, message: `Issued as ${inv.number}.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.cancelInvoice(actor, id, str(f, "reason"));
    refresh(id);
    return { ok: true, message: "Cancelled." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function eInvoiceAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.setEInvoiceDetails(actor, id, { irn: str(f, "irn"), ackNo: str(f, "ackNo"), ackDate: str(f, "ackDate") });
    refresh(id);
    return { ok: true, message: "E-invoice details saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function writeOffAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const w = await svc.requestWriteOff(actor, id, { amountPaise: moneyOrThrow(f, "amount", false), reason: str(f, "reason") });
    refresh(id);
    return { ok: true, message: w.status === "APPROVED" ? "Written off." : "Sent to a Partner for approval." };
  } catch (e) {
    return wrap(e);
  }
}

export async function decideWriteOffAction(writeOffId: string, invoiceId: string, approve: boolean): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.decideWriteOff(actor, writeOffId, approve);
    refresh(invoiceId);
    return { ok: true, message: approve ? "Write-off approved." : "Write-off rejected." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function markReminderSentAction(invoiceId: string, ruleCode: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.markReminderSent(actor, invoiceId, { channel: str(f, "channel") as "EMAIL", ruleCode, messageText: str(f, "messageText") });
    refresh(invoiceId);
    return { ok: true, message: "Marked as sent." };
  } catch (e) {
    return toActionError(e);
  }
}

// ---- Receipts ----------------------------------------------------------------

export async function openInvoicesAction(clientId: string): Promise<ActionResult<Awaited<ReturnType<typeof svc.openInvoicesForClient>>>> {
  const actor = await requireStaff();
  try {
    return { ok: true, data: await svc.openInvoicesForClient(actor, clientId) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function recordReceiptAction(input: svc.ReceiptInput): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.recordReceipt(actor, input);
    revalidatePath("/billing/receipts");
    refresh();
    return { ok: true, message: "Receipt recorded." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function allocateAction(receiptId: string, allocations: { invoiceId: string; amountPaise: number }[]): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.allocateReceipt(actor, receiptId, allocations);
    revalidatePath("/billing/receipts");
    refresh();
    return { ok: true, message: "Allocated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reverseReceiptAction(receiptId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.reverseReceipt(actor, receiptId, str(f, "reason"));
    revalidatePath("/billing/receipts");
    refresh();
    return { ok: true, message: "Receipt reversed." };
  } catch (e) {
    return toActionError(e);
  }
}

// ---- Disbursements -----------------------------------------------------------

export async function createDisbursementAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.createDisbursement(actor, {
      clientId: str(f, "clientId"), engagementId: str(f, "engagementId") || null, date: str(f, "date"), amountPaise: moneyOrThrow(f, "amount")!,
      kind: str(f, "kind") as "OTHER", description: str(f, "description"), paidBy: str(f, "paidBy") || "FIRM",
    });
    revalidatePath("/billing/disbursements");
    return { ok: true, message: "Disbursement recorded." };
  } catch (e) {
    return wrap(e);
  }
}

export async function updateDisbursementAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.updateDisbursement(actor, id, { date: str(f, "date"), amountPaise: moneyOrThrow(f, "amount")!, kind: str(f, "kind") as "OTHER", description: str(f, "description"), paidBy: str(f, "paidBy") || "FIRM" });
    revalidatePath("/billing/disbursements");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return wrap(e);
  }
}
