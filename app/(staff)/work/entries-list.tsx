"use client";
import { Lock, Trash2 } from "lucide-react";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/card";
import { ActionButton } from "./action-button";
import { copyDayAction, copyEntryAction, copyWeekAction, deleteEntryAction, requestCorrectionAction, updateEntryAction } from "./actions";
import { formatDate, formatMinutes, MINUTE_STEPS } from "./format";

export type EntryRow = {
  id: string;
  title: string;
  sub: string;
  minutes: number;
  description: string;
  chips: string[];
  location: string;
  outcome: string | null;
  pendingCorrection: boolean;
};

/** The chosen day's entries with edit / delete / copy, or correction requests once the week is locked (spec 5.6). */
export function EntriesList({ date, today, entries, locked, lockLabel }: { date: string; today: string; entries: EntryRow[]; locked: boolean; lockLabel: string }) {
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{date === today ? "Today" : formatDate(date)}</h2>
          <p className="text-sm text-muted">{total ? `${formatMinutes(total)} logged` : "Nothing logged yet"}</p>
        </div>
        {locked ? (
          <Badge tone="amber" className="gap-1"><Lock className="h-3 w-3" aria-hidden /> Week locked — request a correction</Badge>
        ) : (
          <span className="text-xs text-muted">{lockLabel}</span>
        )}
      </div>

      {entries.length === 0 ? (
        <EmptyState title="No entries for this day" />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {entries.map((e) => (
            <li key={e.id} className="space-y-1.5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.title}</p>
                  {e.sub ? <p className="truncate text-xs text-muted">{e.sub}</p> : null}
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMinutes(e.minutes)}</span>
              </div>
              {e.description ? <p className="text-sm text-ink">{e.description}</p> : null}
              <div className="flex flex-wrap gap-1">
                {e.chips.map((c) => <Badge key={c}>{c}</Badge>)}
                {e.location !== "OFFICE" ? <Badge tone="blue">{e.location === "WFH" ? "Work from home" : "Client site"}</Badge> : null}
                {e.outcome ? <Badge tone="green">{e.outcome}</Badge> : null}
                {e.pendingCorrection ? <Badge tone="violet">Correction pending</Badge> : null}
              </div>
              <div className="flex flex-wrap items-start gap-2 pt-1">
                {locked ? (
                  e.pendingCorrection ? null : <CorrectionDialog entry={e} />
                ) : (
                  <>
                    <FormDialog trigger="Edit" title="Edit entry" action={updateEntryAction.bind(null, e.id)}>
                      {(err) => (
                        <>
                          <Field label="Time spent" error={err("minutes")}>
                            <Select name="minutes" defaultValue={String(e.minutes)}>
                              {MINUTE_STEPS.map((m) => <option key={m} value={m}>{formatMinutes(m)}</option>)}
                            </Select>
                          </Field>
                          <Field label="Description" error={err("description")}>
                            <Textarea name="description" defaultValue={e.description} maxLength={2000} />
                          </Field>
                        </>
                      )}
                    </FormDialog>
                    <ActionButton action={deleteEntryAction.bind(null, e.id)} confirm="Delete this entry?" variant="ghost" aria-label="Delete entry">
                      <Trash2 className="h-4 w-4" aria-hidden /> Delete
                    </ActionButton>
                  </>
                )}
                <FormDialog trigger="Copy to…" title="Copy entry to another day" description="Locked weeks, Sundays and future dates are skipped." action={copyEntryAction.bind(null, e.id)} submitLabel="Copy">
                  {(err) => (
                    <Field label="Date" error={err("to")}>
                      <Input type="date" name="to" max={today} required />
                    </Field>
                  )}
                </FormDialog>
              </div>
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 ? (
        <div className="flex flex-wrap items-start gap-2">
          <FormDialog trigger="Copy day to…" title={`Copy all of ${formatDate(date)}`} description="Every entry of this day is copied. Locked weeks, Sundays and future dates are skipped." action={copyDayAction.bind(null, date)} submitLabel="Copy day">
            {(err) => (
              <Field label="Copy to" error={err("to")}>
                <Input type="date" name="to" max={today} required />
              </Field>
            )}
          </FormDialog>
          <ActionButton action={copyWeekAction.bind(null, date)} confirm="Copy this whole week's entries into next week? Future days are skipped.">
            Copy week → next week
          </ActionButton>
        </div>
      ) : null}
    </section>
  );
}

function CorrectionDialog({ entry }: { entry: EntryRow }) {
  return (
    <FormDialog trigger="Request correction" title="Request a correction" description="The week is locked. Your manager (or a partner) approves the change." action={requestCorrectionAction.bind(null, entry.id)} submitLabel="Send request">
      {(err) => (
        <>
          <Field label="Correct time" error={err("minutes")} hint={`Now ${formatMinutes(entry.minutes)}`}>
            <Select name="minutes" defaultValue="">
              <option value="">No change</option>
              <option value="0">Remove this entry</option>
              {MINUTE_STEPS.map((m) => <option key={m} value={m}>{formatMinutes(m)}</option>)}
            </Select>
          </Field>
          <Field label="Correct description (leave blank for no change)" error={err("description")}>
            <Textarea name="description" maxLength={2000} />
          </Field>
          <Field label="Reason" error={err("reason")}>
            <Textarea name="reason" required minLength={5} placeholder="Why does this need to change?" />
          </Field>
        </>
      )}
    </FormDialog>
  );
}
