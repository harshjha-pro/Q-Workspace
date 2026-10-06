"use client";
import { useState } from "react";
import Link from "next/link";
import { FormDialog } from "@/components/action-form";
import { Field, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DueDate, PendingSince, TaskStatusBadge } from "./task-bits";
import { bulkCheckerAction, bulkNotApplicableAction, bulkReassignAction } from "./actions";

export type TaskRow = {
  id: string; title: string; client: string; clientId: string; period: string; due: string | null; status: string;
  provisional: boolean; holidayShifted: boolean; assignees: string; checker: string; pendingSince: string | null;
};
export type TaskGroup = { key: string; label: string; rows: TaskRow[]; tone?: "overdue" };
type Person = { id: string; name: string };

export function TaskList({ groups, today, canBulk, makers, checkers }: {
  groups: TaskGroup[]; today: string; canBulk: boolean; makers: Person[]; checkers: Person[];
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Rows can vanish after an action (e.g. marked NA); only count what is still on screen.
  const visible = new Set(groups.flatMap((g) => g.rows.map((r) => r.id)));
  const selected = [...picked].filter((id) => visible.has(id));
  const toggle = (id: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const toggleGroup = (g: TaskGroup, on: boolean) => setPicked((p) => { const n = new Set(p); for (const r of g.rows) if (on) n.add(r.id); else n.delete(r.id); return n; });
  const hidden = selected.map((id) => <input key={id} type="hidden" name="ids" value={id} />);
  const total = groups.reduce((a, g) => a + g.rows.length, 0);

  return (
    <div className="space-y-4">
      {canBulk && selected.length > 0 ? (
        <div className="sticky top-12 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand-50 px-3 py-2 text-sm">
          <span className="font-medium">{selected.length} selected</span>
          <FormDialog trigger="Reassign to…" title={`Reassign ${selected.length} task(s)`} description="The new person becomes assignee and maker. Maker and checker must differ." action={bulkReassignAction} submitLabel="Reassign">
            {(err) => (
              <>
                {hidden}
                <Field label="Assign to" error={err("userId")}><Select name="userId" required defaultValue="">{[<option key="" value="" disabled>Choose a person</option>, ...makers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)]}</Select></Field>
              </>
            )}
          </FormDialog>
          <FormDialog trigger="Change checker…" title={`Change checker on ${selected.length} task(s)`} description="Articles and plain Staff are never checkers. Pending reviews move to the new checker." action={bulkCheckerAction} submitLabel="Change checker">
            {(err) => (
              <>
                {hidden}
                <Field label="Checker" error={err("userId")}><Select name="userId" required defaultValue="">{[<option key="" value="" disabled>Choose a checker</option>, ...checkers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)]}</Select></Field>
              </>
            )}
          </FormDialog>
          <FormDialog trigger="Mark not applicable…" title={`Mark ${selected.length} task(s) not applicable`} action={bulkNotApplicableAction} submitLabel="Mark not applicable" danger>
            {(err) => (
              <>
                {hidden}
                <Field label="Reason" error={err("reason")} hint="Recorded on each task's history."><Textarea name="reason" required /></Field>
              </>
            )}
          </FormDialog>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>
        </div>
      ) : null}

      {total === 0 ? <p className="rounded-lg border border-dashed border-line bg-white p-8 text-center text-sm text-muted">No tasks match these filters.</p> : null}

      {groups.filter((g) => g.rows.length > 0).map((g) => {
        const allOn = g.rows.every((r) => picked.has(r.id));
        return (
          <section key={g.key} aria-labelledby={`grp-${g.key}`} className="rounded-lg border border-line bg-white">
            <header className="flex items-center gap-2 border-b border-line px-3 py-2">
              {canBulk ? <input type="checkbox" aria-label={`Select all in ${g.label}`} className="h-4 w-4 accent-[var(--color-brand)]" checked={allOn} onChange={(e) => toggleGroup(g, e.target.checked)} /> : null}
              <h2 id={`grp-${g.key}`} className={g.tone === "overdue" ? "text-sm font-semibold text-st-overdue" : "text-sm font-semibold"}>{g.label}</h2>
              <span className="rounded bg-gray-100 px-1.5 text-xs text-muted">{g.rows.length}</span>
            </header>
            <ul className="divide-y divide-line">
              {g.rows.map((r) => (
                <li key={r.id} className="flex gap-2 px-3 py-2.5">
                  {canBulk ? <input type="checkbox" aria-label={`Select ${r.title}`} className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-brand)]" checked={picked.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} /> : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <Link href={`/tasks/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                      <TaskStatusBadge status={r.status} />
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                      <Link href={`/clients/${r.clientId}`} className="hover:underline">{r.client}</Link>
                      {r.period ? <span>{r.period}</span> : null}
                      <DueDate date={r.due} status={r.status} today={today} provisional={r.provisional} holidayShifted={r.holidayShifted} className="text-ink" />
                      <span>{r.assignees || "Unassigned"}{r.checker ? ` · checker ${r.checker}` : ""}</span>
                      {r.status === "PENDING_FROM_CLIENT" ? <PendingSince since={r.pendingSince} today={today} /> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

