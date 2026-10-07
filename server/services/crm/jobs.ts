import { todayIst } from "../../lib/dates";
import { runLeadFollowUps } from "./leads";
import { runProposalExpiry } from "./proposals";
import { runRenewals } from "./renewals";
import { runFeedbackRequests } from "./feedback";
import { runCrossSell } from "./crosssell";

/** All CRM daily jobs in one call (each is idempotent and can also be registered on its own). */
export async function runCrmDaily(today: string = todayIst()) {
  return {
    followUps: await runLeadFollowUps(today),
    proposals: await runProposalExpiry(today),
    renewals: await runRenewals(today),
    feedback: await runFeedbackRequests(today),
    crossSell: await runCrossSell(),
  };
}

export { runLeadFollowUps, runProposalExpiry, runRenewals, runFeedbackRequests, runCrossSell };
