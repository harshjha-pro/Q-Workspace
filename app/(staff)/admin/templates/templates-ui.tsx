"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { createDraftAction, discardDraftAction, publishVersionAction, type StageDraft } from "./actions";

const LEVELS: StageDraft["reviewLevel"][] = ["NONE", "SENIOR", "MANAGER", "PARTNER"];
const LEVEL_LABEL: Record<string, string> = { NONE: "No review", SENIOR: "Senior review", MANAGER: "Manager review", PARTNER: "Partner review" };
const FLAGS = [
  { key: "isClientApproval", label: "Client approval" },
  { key: "isFiling", label: "Filing" },
  { key: "requiresUdin", label: "UDIN" },
  { key: "requiresDsc", label: "DSC" },
] as const;

type Row = StageDraft & { key: number };
const blank = (key: number): Row => ({ key, name: "", reviewLevel: "NONE", isClientApproval: false, isFiling: false, requiresUdin: false, requiresDsc: false });

/** Editing never changes a live version: it creates a draft that a Partner publishes (P2-24). */
export function DraftEditor({ templateId, templateName, initial }: { templateId: string; templateName: string; initial: StageDraft[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState("");
  const [nextKey, setNextKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset(isOpen: boolean) {
    setOpen(isOpen);
    if (!isOpen) return;
    const seed = initial.length ? initial : [blank(0), blank(1)];
    setRows(seed.map((s, i) => ({ ...s, key: i })));
    setNextKey(seed.length);
    setNote("");
    setError(null);
  }
  const update = (key: number, patch: Partial<StageDraft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (i: number, by: number) => setRows((rs) => {
    const next = [...rs];
    const [r] = next.splice(i, 1);
    next.splice(i + by, 0, r!);
    return next;
  });

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild><Button size="sm" variant="secondary">New draft</Button></DialogTrigger>
      {open ? (
        <DialogContent title={`New draft — ${templateName}`} description="Starts from the active version. Open tasks are untouched until a Partner publishes." className="max-w-2xl">
          <div className="space-y-3">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <ol className="space-y-2">
              {rows.map((r, i) => (
                <li key={r.key} className="rounded-md border border-line p-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-xs font-medium text-muted">{i + 1}</span>
                    <Input aria-label={`Stage ${i + 1} name`} value={r.name} placeholder="Stage name" onChange={(e) => update(r.key, { name: e.target.value })} />
                    <Button type="button" size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Remove stage" disabled={rows.length <= 2} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 pl-7">
                    <Select aria-label={`Stage ${i + 1} review level`} className="h-8 w-40" value={r.reviewLevel} onChange={(e) => update(r.key, { reviewLevel: e.target.value as StageDraft["reviewLevel"] })}>
                      {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
                    </Select>
                    {FLAGS.map((f) => (
                      <Checkbox key={f.key} label={f.label} checked={r[f.key]}
                        onChange={(e) => f.key === "isFiling" && e.target.checked
                          // Only one filing stage: ticking one clears the others.
                          ? setRows((rs) => rs.map((x) => ({ ...x, isFiling: x.key === r.key })))
                          : update(r.key, { [f.key]: e.target.checked })} />
                    ))}
                  </div>
                </li>
              ))}
            </ol>
            <Button type="button" size="sm" variant="secondary" disabled={rows.length >= 15} onClick={() => { setRows((rs) => [...rs, blank(nextKey)]); setNextKey((k) => k + 1); }}>Add stage</Button>
            <Field label="Note (what changed and why)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <Button disabled={pending} onClick={() => {
              if (rows.filter((r) => r.isFiling).length > 1) return setError("Only one stage can be the filing stage.");
              if (rows.some((r) => r.name.trim().length < 2)) return setError("Every stage needs a name (at least 2 characters).");
              start(async () => {
                const res = await createDraftAction(templateId, { stages: rows.map(({ key: _key, ...s }) => ({ ...s, name: s.name.trim() })), note });
                if (res.ok) { setOpen(false); router.refresh(); } else setError(res.error);
              });
            }}>{pending ? "Saving…" : "Save draft"}</Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function DiscardDraft({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => {
        if (!window.confirm("Discard this draft?")) return;
        start(async () => { const r = await discardDraftAction(versionId); if (r.ok) router.refresh(); else setError(r.error); });
      }}>{pending ? "Working…" : "Discard"}</Button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

type StageRef = { index: number; name: string };

/** Best guess for the mapping: same stage name, else same position (clamped). */
function defaultMapping(oldStages: StageRef[], newStages: StageRef[]) {
  const max = newStages.length - 1;
  return Object.fromEntries(oldStages.map((o) => {
    const same = newStages.find((n) => n.name.trim().toLowerCase() === o.name.trim().toLowerCase());
    return [o.index, same ? same.index : Math.min(o.index, max)];
  })) as Record<number, number>;
}

export function PublishDialog({ versionId, version, newStages, oldStages, openTasks }: { versionId: string; version: number; newStages: StageRef[]; oldStages: StageRef[]; openTasks: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [move, setMove] = useState(false);
  const [mapping, setMapping] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canMove = openTasks > 0 && oldStages.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setMove(false); setMapping(defaultMapping(oldStages, newStages)); setError(null); } }}>
      <DialogTrigger asChild><Button size="sm">Publish</Button></DialogTrigger>
      {open ? (
        <DialogContent title={`Publish v${version}`} description="New tasks and engagements will use this version. The current active version is retired.">
          <div className="space-y-3">
            {error ? <Alert tone="error">{error}</Alert> : null}
            {canMove ? (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">{openTasks} open task{openTasks === 1 ? "" : "s"} on the current version</legend>
                <label className="flex items-start gap-2 text-sm"><input type="radio" name="move" checked={!move} onChange={() => setMove(false)} className="mt-1" />Keep open tasks on their current version (they finish with the old stages)</label>
                <label className="flex items-start gap-2 text-sm"><input type="radio" name="move" checked={move} onChange={() => setMove(true)} className="mt-1" />Move open tasks to the new version</label>
              </fieldset>
            ) : <p className="text-sm text-muted">No open tasks use the current version, so nothing needs to move.</p>}
            {move && canMove ? (
              <div className="space-y-2 rounded-md border border-line bg-gray-50 p-3">
                <p className="text-xs text-muted">Tasks sitting at each old stage move to the stage you choose.</p>
                {oldStages.map((o) => (
                  <Field key={o.index} label={`${o.index + 1}. ${o.name} →`}>
                    <Select value={String(mapping[o.index] ?? 0)} onChange={(e) => setMapping((m) => ({ ...m, [o.index]: Number(e.target.value) }))}>
                      {newStages.map((n) => <option key={n.index} value={n.index}>{n.index + 1}. {n.name}</option>)}
                    </Select>
                  </Field>
                ))}
              </div>
            ) : null}
            <Button disabled={pending} onClick={() => start(async () => {
              const r = await publishVersionAction(versionId, { moveOpenTasks: move && canMove, mapping });
              if (r.ok) { setOpen(false); router.refresh(); } else setError(r.error);
            })}>{pending ? "Publishing…" : `Publish v${version}`}</Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
