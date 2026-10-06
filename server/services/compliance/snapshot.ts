import type { Tx } from "../../lib/db";
import type { ClientSnapshot, FlagTimeline, GstinSnapshot } from "../../compliance-engine";
import { valueAt } from "../../compliance-engine";
import { CLIENT_FLAGS } from "../../domain/enums";

/**
 * Build the engine's view of a client from the database: flag timelines come from ClientFlagHistory
 * (effective dates), so "when exactly did this change" drives generation (Rules Spec 7).
 */
export async function buildSnapshot(tx: Tx, clientId: string, trackingFromSetting: string, today: string): Promise<ClientSnapshot> {
  const c = await tx.client.findUniqueOrThrow({
    where: { id: clientId },
    include: {
      gstins: true,
      directors: { include: { director: true } },
      ptRegistrations: true,
      flagHistory: { orderBy: [{ effectiveDate: "asc" }, { changedAt: "asc" }] },
      eventDates: true,
    },
  });
  const trackingFrom = c.onboardingDate && c.onboardingDate > trackingFromSetting ? c.onboardingDate : trackingFromSetting;

  const flags: Record<string, FlagTimeline> = {};
  for (const flag of CLIENT_FLAGS) {
    const tl: FlagTimeline = c.flagHistory.filter((h) => h.flag === flag).map((h) => ({ from: h.effectiveDate, value: h.newValue === "true" }));
    const current = c[flag];
    if (tl.length === 0 && current) tl.push({ from: trackingFrom, value: true });
    // Keep the timeline consistent with the stored value (e.g. data edited outside the app).
    if (valueAt(tl, today) !== current) tl.push({ from: today, value: current });
    flags[flag] = tl;
  }

  const gstins: GstinSnapshot[] = c.gstins.map((g) => {
    const changes = c.flagHistory.filter((h) => h.flag === "gstin.frequency" && h.partyKey === g.id);
    const initial = (changes[0]?.oldValue ?? g.frequency) as GstinSnapshot["frequencies"][number]["frequency"];
    const frequencies: GstinSnapshot["frequencies"] = [{ from: "1900-01-01", frequency: initial, iffOpted: g.iffOpted }];
    for (const ch of changes) frequencies.push({ from: ch.effectiveDate, frequency: ch.newValue as never, iffOpted: g.iffOpted });
    return {
      id: g.id, stateCode: g.stateCode, status: g.status, registrationDate: g.registrationDate, cancellationDate: g.cancellationDate, frequencies,
      annualReturnApplicable: g.annualReturnApplicable, gstr9cApplicable: g.gstr9cApplicable,
    };
  });

  return {
    id: c.id,
    constitution: c.constitution,
    status: c.status,
    statusEffectiveFrom: c.statusEffectiveFrom,
    stateCode: c.stateCode,
    fyEnd: c.fyEnd,
    incorporationDate: c.incorporationDate,
    trackingFrom,
    flags,
    gstins,
    directors: c.directors.map((d) => ({ directorId: d.directorId, isPrimaryHere: d.director.primaryClientId === c.id, appointedOn: d.appointedOn, ceasedOn: d.ceasedOn })),
    ptRegistrations: c.ptRegistrations.map((p) => ({ stateCode: p.stateCode, kind: p.kind, frequency: p.frequency, effectiveFrom: p.effectiveFrom, effectiveTo: p.effectiveTo })),
    events: Object.fromEntries(c.eventDates.map((e) => [`${e.eventTypeCode}|${e.periodKey}`, e.dateValue])),
  };
}
