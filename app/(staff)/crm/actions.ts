"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { toActionError, type ActionResult } from "@/lib/action";
import * as leads from "@/server/services/crm/leads";
import * as proposals from "@/server/services/crm/proposals";
import * as letters from "@/server/services/crm/letters";
import * as onboarding from "@/server/services/crm/onboarding";
import * as comms from "@/server/services/crm/communications";
import * as crossSell from "@/server/services/crm/crosssell";
import * as renewals from "@/server/services/crm/renewals";
import * as feedback from "@/server/services/crm/feedback";
import * as campaigns from "@/server/services/crm/campaigns";
import * as templates from "@/server/services/crm/templates";
import { str, opt, bool, list, paise, hoursToMinutes, fileOf } from "./_lib/form";

type R = ActionResult;
const done = (message: string, ...paths: string[]): R => {
  for (const p of paths) revalidatePath(p);
  return { ok: true, message };
};

function leadFields(f: FormData) {
  return {
    name: str(f, "name"), entityType: str(f, "entityType") as never, contactName: str(f, "contactName"), email: opt(f, "email"), phone: opt(f, "phone"),
    pan: opt(f, "pan"), gstin: opt(f, "gstin"), services: list(f, "services") as never, estFeePaise: paise(f, "estFee"), source: str(f, "source") as never,
    referrerClientId: opt(f, "referrerClientId"), referrerName: str(f, "referrerName"), ownerId: opt(f, "ownerId"), nextFollowUp: opt(f, "nextFollowUp"), notes: str(f, "notes"),
    overrideReason: str(f, "overrideReason") || undefined,
  };
}

// ---- Leads -------------------------------------------------------------------
export async function createLeadAction(_: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  let id: string;
  try {
    id = (await leads.createLead(actor, leadFields(f))).id;
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/crm/leads/${id}`);
}

export async function updateLeadAction(id: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await leads.updateLead(actor, id, leadFields(f));
    return done("Lead saved.", `/crm/leads/${id}`, "/crm/leads");
  } catch (e) {
    return toActionError(e);
  }
}

export async function setStageAction(id: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await leads.setLeadStage(actor, id, { stage: str(f, "stage") as never, lostReason: opt(f, "lostReason") });
    return done("Stage updated.", `/crm/leads/${id}`, "/crm/leads");
  } catch (e) {
    return toActionError(e);
  }
}

export async function addLeadActivityAction(id: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await leads.addLeadActivity(actor, id, { kind: str(f, "kind") as never, date: str(f, "date"), notes: str(f, "notes"), nextFollowUp: opt(f, "nextFollowUp") });
    return done("Activity logged.", `/crm/leads/${id}`, "/crm/leads");
  } catch (e) {
    return toActionError(e);
  }
}

export async function leadConflictCheckAction(id: string, _: R, _f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await onboarding.runLeadConflictCheck(actor, id);
    return done("Conflict check recorded; Partners have been notified.", `/crm/leads/${id}`);
  } catch (e) {
    return toActionError(e);
  }
}

// ---- Proposals ---------------------------------------------------------------
export async function createProposalAction(_: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  let id: string;
  try {
    id = (await proposals.createProposal(actor, { leadId: opt(f, "leadId"), clientId: opt(f, "clientId"), serviceTemplateId: str(f, "serviceTemplateId"), title: opt(f, "title"), validUntil: opt(f, "validUntil") })).id;
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/crm/proposals/${id}`);
}

export async function updateProposalAction(id: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  let next: { id: string };
  try {
    next = await proposals.updateProposal(actor, id, {
      title: str(f, "title"), serviceLine: str(f, "serviceLine") as never, scope: str(f, "scope"), deliverables: str(f, "deliverables"), timelines: str(f, "timelines"),
      feeBasis: str(f, "feeBasis") as never, feePaise: paise(f, "fee"), ratePaise: paise(f, "rate"), budgetMinutes: hoursToMinutes(f, "budgetHours"), oopTerms: str(f, "oopTerms"),
      gstRateBp: Math.round(Number(str(f, "gstRate") || "0") * 100), validUntil: opt(f, "validUntil"),
    });
  } catch (e) {
    return toActionError(e);
  }
  if (next.id !== id) redirect(`/crm/proposals/${next.id}`);
  return done("Proposal saved.", `/crm/proposals/${id}`);
}

export async function approveProposalAction(id: string, _: R, _f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await proposals.approveProposal(actor, id);
    return done("Approved.", `/crm/proposals/${id}`);
  } catch (e) {
    return toActionError(e);
  }
}

export async function sentProposalAction(id: string, _: R, _f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await proposals.markProposalSent(actor, id);
    return done("Marked as sent.", `/crm/proposals/${id}`);
  } catch (e) {
    return toActionError(e);
  }
}

export async function decideProposalAction(id: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await proposals.decideProposal(actor, id, { decision: str(f, "decision") as never, note: str(f, "note") });
    return done("Client decision recorded.", `/crm/proposals/${id}`);
  } catch (e) {
    return toActionError(e);
  }
}

// ---- Engagement letters ------------------------------------------------------
export async function generateLetterAction(proposalId: string, _: R, _f: FormData): Promise<R> {
  const actor = await requireStaff();
  let id: string;
  try {
    id = (await letters.generateLetter(actor, proposalId)).letter.id;
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/crm/letters/${id}`);
}

export async function updateLetterAction(id: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await letters.updateLetterBody(actor, id, String(f.get("body") ?? ""));
    return done("Letter saved.", `/crm/letters/${id}`);
  } catch (e) {
    return toActionError(e);
  }
}

export async function issueLetterAction(id: string, _: R, _f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await letters.markLetterIssued(actor, id);
    return done("Marked as issued.", `/crm/letters/${id}`);
  } catch (e) {
    return toActionError(e);
  }
}

export async function withdrawLetterAction(id: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await letters.withdrawLetter(actor, id, str(f, "reason"));
    return done("Letter withdrawn.", `/crm/letters/${id}`);
  } catch (e) {
    return toActionError(e);
  }
}

export async function acceptLetterAction(id: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    const file = await fileOf(f);
    const r = await letters.acceptLetterWithSignedCopy(actor, id, file, {
      engagementType: str(f, "engagementType") || undefined, recurrence: (str(f, "recurrence") || undefined) as never, engagementName: str(f, "engagementName") || undefined,
      startDate: str(f, "startDate") || undefined, memberUserIds: list(f, "memberUserIds"),
    });
    return done(r.newClient ? "Accepted: client and engagement created, onboarding started." : "Accepted: engagement created.", `/crm/letters/${id}`, "/crm/leads");
  } catch (e) {
    return toActionError(e);
  }
}

// ---- Onboarding --------------------------------------------------------------
export async function startOnboardingAction(clientId: string, _: R, _f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await onboarding.startOnboarding(actor, clientId);
    return done("Onboarding checklist started.", `/crm/onboarding/${clientId}`);
  } catch (e) {
    return toActionError(e);
  }
}

export async function onboardingItemAction(itemId: string, clientId: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await onboarding.setOnboardingItem(actor, itemId, { done: bool(f, "done"), note: str(f, "note") });
    return done("Checklist updated.", `/crm/onboarding/${clientId}`);
  } catch (e) {
    return toActionError(e);
  }
}

export async function attachOnboardingAction(itemId: string, clientId: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    const file = await fileOf(f);
    if (!file) return { ok: false, error: "Choose a file.", fieldErrors: { file: "File" } };
    await onboarding.attachOnboardingDocument(actor, itemId, file);
    return done("Attached.", `/crm/onboarding/${clientId}`);
  } catch (e) {
    return toActionError(e);
  }
}

export async function conflictCheckAction(clientId: string, _: R, _f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await onboarding.runConflictCheck(actor, clientId);
    return done("Conflict check recorded; Partners have been notified.", `/crm/onboarding/${clientId}`);
  } catch (e) {
    return toActionError(e);
  }
}

export async function decideConflictAction(checkId: string, path: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await onboarding.decideConflict(actor, checkId, { decision: str(f, "decision") as never, notes: str(f, "notes") });
    return done("Decision recorded.", path);
  } catch (e) {
    return toActionError(e);
  }
}

// ---- Contacts & communication log ---------------------------------------------
export async function logCommunicationAction(clientId: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await comms.logClientCommunication(actor, clientId, { kind: str(f, "kind") as never, date: str(f, "date"), notes: str(f, "notes"), engagementId: opt(f, "engagementId"), nextFollowUp: opt(f, "nextFollowUp") });
    return done("Logged.", `/crm/clients/${clientId}/communications`);
  } catch (e) {
    return toActionError(e);
  }
}

export async function optOutAction(contactId: string, clientId: string, optOut: boolean, _: R, _f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await comms.setContactOptOut(actor, contactId, optOut);
    return done(optOut ? "Opted out of client communications." : "Opted back in.", `/crm/clients/${clientId}/communications`);
  } catch (e) {
    return toActionError(e);
  }
}

export async function categoryAction(clientId: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await comms.setClientCategoryTags(actor, clientId, { category: opt(f, "category") as never, tags: str(f, "tags") });
    return done("Saved.", `/crm/clients/${clientId}/communications`);
  } catch (e) {
    return toActionError(e);
  }
}

// ---- Cross-sell ----------------------------------------------------------------
export async function runCrossSellAction(_: R, _f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    const r = await crossSell.runCrossSell(actor);
    return done(`Checked ${r.clients} clients: ${r.created} new suggestion(s), ${r.closed} closed.`, "/crm/opportunities");
  } catch (e) {
    return toActionError(e);
  }
}

export async function convertOpportunityAction(id: string, _: R, _f: FormData): Promise<R> {
  const actor = await requireStaff();
  let leadId: string;
  try {
    leadId = (await crossSell.convertOpportunity(actor, id)).id;
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/crm/leads/${leadId}`);
}

export async function dismissOpportunityAction(id: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await crossSell.dismissOpportunity(actor, id, str(f, "reason"));
    return done("Dismissed.", "/crm/opportunities");
  } catch (e) {
    return toActionError(e);
  }
}

// ---- Renewals --------------------------------------------------------------------
export async function proposeRenewalAction(id: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await renewals.proposeRenewalFee(actor, id, { feePaise: paise(f, "fee") });
    return done("Fee proposed for Partner approval.", "/crm/opportunities");
  } catch (e) {
    return toActionError(e);
  }
}

export async function approveRenewalAction(id: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await renewals.approveRenewal(actor, id, { feePaise: paise(f, "fee") || undefined });
    return done("Renewal fee approved.", "/crm/opportunities");
  } catch (e) {
    return toActionError(e);
  }
}

export async function declineRenewalAction(id: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await renewals.declineRenewal(actor, id, str(f, "reason"));
    return done("Renewal closed.", "/crm/opportunities");
  } catch (e) {
    return toActionError(e);
  }
}

export async function renewalLetterAction(id: string, _: R, _f: FormData): Promise<R> {
  const actor = await requireStaff();
  let letterId: string;
  try {
    letterId = (await renewals.generateRenewalLetter(actor, id)).letter.id;
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/crm/letters/${letterId}`);
}

// ---- Feedback ----------------------------------------------------------------------
export async function requestFeedbackAction(_: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await feedback.requestFeedback(actor, str(f, "engagementId"));
    return done("Feedback request created — copy the message below and send it.", "/crm/feedback");
  } catch (e) {
    return toActionError(e);
  }
}

export async function recordFeedbackAction(id: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await feedback.recordFeedback(actor, id, { rating: Number(str(f, "rating")), comment: str(f, "comment") });
    return done("Feedback recorded.", "/crm/feedback");
  } catch (e) {
    return toActionError(e);
  }
}

// ---- Campaigns ------------------------------------------------------------------------
function campaignFields(f: FormData) {
  return {
    name: str(f, "name"), messageText: str(f, "messageText"),
    segment: {
      categories: list(f, "categories") as never, serviceLines: list(f, "serviceLines") as never, constitutions: list(f, "constitutions") as never, groupIds: list(f, "groupIds"),
      primaryOnly: !bool(f, "allContacts"), channel: (str(f, "channel") || "PREFERRED") as never,
    },
  };
}

export async function createCampaignAction(_: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  let id: string;
  try {
    id = (await campaigns.createCampaign(actor, campaignFields(f))).id;
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/crm/campaigns/${id}`);
}

export async function updateCampaignAction(id: string, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await campaigns.updateCampaign(actor, id, campaignFields(f));
    return done("Saved. Rebuild the recipient list to apply segment changes.", `/crm/campaigns/${id}`);
  } catch (e) {
    return toActionError(e);
  }
}

export async function buildRecipientsAction(id: string, _: R, _f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    const r = await campaigns.buildRecipients(actor, id);
    return done(`${r.recipients} recipient(s). Skipped: ${r.skippedOptOut} opted out, ${r.skippedNoChannel} without email/phone.`, `/crm/campaigns/${id}`);
  } catch (e) {
    return toActionError(e);
  }
}

export async function markSentAction(campaignId: string, recipientId: string | null, _: R, _f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    const r = await campaigns.markRecipientsSent(actor, campaignId, recipientId ?? undefined);
    return done(`${r.marked} marked as sent.${r.removedOptedOut ? ` ${r.removedOptedOut} removed (opted out).` : ""}`, `/crm/campaigns/${campaignId}`);
  } catch (e) {
    return toActionError(e);
  }
}

// ---- Service templates -----------------------------------------------------------------
export async function saveTemplateAction(id: string | null, _: R, f: FormData): Promise<R> {
  const actor = await requireStaff();
  try {
    await templates.saveServiceTemplate(actor, {
      serviceLine: str(f, "serviceLine") as never, name: str(f, "name"), scope: str(f, "scope"), deliverables: str(f, "deliverables"), timelines: str(f, "timelines"),
      feeBasis: str(f, "feeBasis") as never, defaultFeePaise: paise(f, "fee"), oopTerms: str(f, "oopTerms"), active: id ? bool(f, "active") : true,
      engagementType: opt(f, "engagementType"), budgetMinutes: hoursToMinutes(f, "budgetHours"),
    }, id ?? undefined);
    return done("Template saved.", "/crm/templates");
  } catch (e) {
    return toActionError(e);
  }
}
