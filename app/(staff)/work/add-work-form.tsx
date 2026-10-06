"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { enqueue, isNetworkError, newClientUuid, type QueuedEntryInput } from "@/components/offline/queue";
import { saveWorkAction, workTargetsAction, type SaveResult, type WorkTarget } from "./actions";
import { ClientPicker, type ClientOption } from "./client-picker";
import { TimerCard, type ActiveTimer } from "./timer-card";
import { formatDate, formatMinutes, OUTCOME_LABELS, OUTCOME_TYPES, shortDay } from "./format";

export type RecentPair = { clientId: string; clientName: string; engagementId: string; engagementName: string; taskId: string | null; taskTitle: string | null };
type DateMode = "today" | "yesterday" | "pick" | "multi" | "week";

/** Tasks from a recent pair (offline fallback) may not know their stage. */
type Target = Omit<WorkTarget, "tasks"> & { tasks: { id: string; title: string; stageIndex: number | null; effectiveDueDate: string | null }[] };
const QUICK = [15, 30, 60, 120, 240];
const TARGETS_KEY = (clientId: string) => `qepex.targets.${clientId}`;

function readCachedTargets(clientId: string): Target[] | null {
  try {
    const raw = localStorage.getItem(TARGETS_KEY(clientId));
    return raw ? (JSON.parse(raw) as Target[]) : null;
  } catch {
    return null;
  }
}
function cacheTargets(clientId: string, t: Target[]) {
  try {
    localStorage.setItem(TARGETS_KEY(clientId), JSON.stringify(t));
  } catch {
    /* per-device convenience only */
  }
}

const chipCls = (on: boolean) =>
  cn("rounded-full border px-3 py-1.5 text-sm transition-colors", on ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-gray-50");

export function AddWorkForm(props: {
  today: string;
  yesterday: string;
  initialDate: string;
  weekDays: string[];
  clients: ClientOption[];
  categories: { id: string; name: string }[];
  chips: string[];
  recent: RecentPair[];
  location: { value: string; changeable: boolean; options: { value: string; label: string }[] };
  timer: ActiveTimer;
}) {
  const { today, yesterday, initialDate, weekDays } = props;
  const router = useRouter();
  const [pending, startSave] = useTransition();

  // What
  const [internal, setInternal] = useState(false);
  const [client, setClient] = useState<ClientOption | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [targetsNote, setTargetsNote] = useState<string | null>(null);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [engagementId, setEngagementId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [stageIndex, setStageIndex] = useState("");
  const [categoryId, setCategoryId] = useState("");

  // When
  const [dateMode, setDateMode] = useState<DateMode>(initialDate === today ? "today" : initialDate === yesterday ? "yesterday" : "pick");
  const [pickDate, setPickDate] = useState(initialDate);
  const [multi, setMulti] = useState<string[]>([initialDate]);
  const [multiAdd, setMultiAdd] = useState("");
  // A banner link (?date=) changes the page's date without remounting: follow it.
  const [seenDate, setSeenDate] = useState(initialDate);
  if (seenDate !== initialDate) {
    setSeenDate(initialDate);
    if (dateMode !== "multi" && dateMode !== "week") {
      setDateMode(initialDate === today ? "today" : initialDate === yesterday ? "yesterday" : "pick");
      setPickDate(initialDate);
    }
  }

  // How long / what
  const [minutes, setMinutes] = useState(60);
  const [description, setDescription] = useState("");
  const [chips, setChips] = useState<string[]>([]);
  const [location, setLocation] = useState(props.location.value);
  const [outcomeType, setOutcomeType] = useState("");
  const [outcomeRef, setOutcomeRef] = useState("");

  const [result, setResult] = useState<{ tone: "success" | "error" | "warn"; text: string; detail?: SaveResult } | null>(null);

  const engagement = targets.find((t) => t.id === engagementId) ?? null;

  async function loadTargets(c: ClientOption, preset?: { engagementId: string; taskId: string | null; engagementName: string; taskTitle: string | null }) {
    setLoadingTargets(true);
    setTargetsNote(null);
    let list: Target[] | null = null;
    try {
      const r = await workTargetsAction(c.id);
      if (r.ok) {
        list = r.data ?? [];
        cacheTargets(c.id, list);
      } else setTargetsNote(r.error);
    } catch {
      list = readCachedTargets(c.id);
      setTargetsNote(list ? "Offline — showing the engagements saved on this device." : "Offline — engagements could not be loaded. Use a recent pair instead.");
    }
    if (!list && preset) list = [{ id: preset.engagementId, name: preset.engagementName, stages: [], tasks: preset.taskId ? [{ id: preset.taskId, title: preset.taskTitle ?? "Task", stageIndex: null, effectiveDueDate: null }] : [] }];
    const final = list ?? [];
    setTargets(final);
    setLoadingTargets(false);
    if (preset) {
      setEngagementId(preset.engagementId);
      setTaskId(preset.taskId ?? "");
      const t = final.find((e) => e.id === preset.engagementId)?.tasks.find((x) => x.id === preset.taskId);
      setStageIndex(t?.stageIndex != null ? String(t.stageIndex) : "");
    } else if (final.length === 1) {
      setEngagementId(final[0]!.id);
    }
  }

  function pickClient(c: ClientOption) {
    setClient(c);
    setEngagementId("");
    setTaskId("");
    setStageIndex("");
    void loadTargets(c);
  }

  function clearClient() {
    setClient(null);
    setTargets([]);
    setEngagementId("");
    setTaskId("");
    setStageIndex("");
    setTargetsNote(null);
  }

  function pickPair(p: RecentPair) {
    setInternal(false);
    const c = props.clients.find((x) => x.id === p.clientId) ?? { id: p.clientId, name: p.clientName, code: "" };
    setClient(c);
    void loadTargets(c, p);
  }

  function chooseSingleDate(mode: DateMode, d: string) {
    setDateMode(mode);
    if (mode === "pick") setPickDate(d);
    // Keep the entries list below in step with the day being filled.
    router.replace(d === today ? "/work" : `/work?date=${d}`, { scroll: false });
  }

  const dates: string[] =
    dateMode === "today" ? [today]
    : dateMode === "yesterday" ? [yesterday]
    : dateMode === "pick" ? (pickDate ? [pickDate] : [])
    : dateMode === "multi" ? multi
    : weekDays;

  function targetLabel() {
    if (internal) return props.categories.find((c) => c.id === categoryId)?.name ?? "Internal";
    const task = engagement?.tasks.find((t) => t.id === taskId);
    return [client?.name, task?.title ?? engagement?.name].filter(Boolean).join(" · ");
  }

  function buildInput(): QueuedEntryInput | string {
    if (dates.length === 0) return "Choose a date.";
    if (dates.some((d) => d > today)) return "Entries cannot be made for future dates.";
    if (internal && !categoryId) return "Choose an internal category.";
    if (!internal && !engagementId) return "Choose a client and engagement.";
    return {
      dates,
      clientId: internal ? null : client?.id ?? null,
      engagementId: internal ? null : engagementId,
      taskId: internal || !taskId ? null : taskId,
      internalCategoryId: internal ? categoryId : null,
      stageIndex: internal || stageIndex === "" ? null : Number(stageIndex),
      minutes,
      description: description.trim(),
      chips,
      location,
      outcomeType: outcomeType || null,
      outcomeRef: outcomeType ? outcomeRef.trim() || null : null,
      clientUuid: newClientUuid(),
    };
  }

  async function keepOffline(input: QueuedEntryInput) {
    await enqueue({ clientUuid: input.clientUuid, input, label: `${targetLabel()} · ${formatMinutes(input.minutes)} · ${input.dates.map(formatDate).join(", ")}`, queuedAt: new Date().toISOString() });
    setResult({ tone: "warn", text: "Saved on this device — will sync when you are back online." });
    resetDetails();
  }

  function resetDetails() {
    setDescription("");
    setChips([]);
    setOutcomeType("");
    setOutcomeRef("");
  }

  function save() {
    const input = buildInput();
    if (typeof input === "string") {
      setResult({ tone: "error", text: input });
      return;
    }
    startSave(async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return keepOffline(input);
      try {
        const r = await saveWorkAction(input as never);
        if (!r.ok) {
          setResult({ tone: "error", text: r.error });
          return;
        }
        const warn = (r.data?.warnings.length ?? 0) > 0;
        setResult({ tone: warn ? "warn" : "success", text: r.message ?? "Saved.", detail: r.data });
        resetDetails();
        router.refresh();
      } catch (e) {
        if (isNetworkError(e)) await keepOffline(input);
        else setResult({ tone: "error", text: "Could not save. Please try again." });
      }
    });
  }

  const budget = result?.detail?.budget;

  return (
    <div className="space-y-4">
      {props.recent.length > 0 ? (
        <section aria-label="Recent">
          <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted"><History className="h-3.5 w-3.5" aria-hidden /> Recent</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {props.recent.map((p) => {
              const on = !internal && client?.id === p.clientId && engagementId === p.engagementId && (taskId || null) === p.taskId;
              return (
                <button key={`${p.clientId}|${p.engagementId}|${p.taskId}`} type="button" onClick={() => pickPair(p)}
                  className={cn("shrink-0 rounded-lg border px-3 py-2 text-left text-xs", on ? "border-brand bg-brand-50" : "border-line bg-white hover:bg-gray-50")}>
                  <span className="block max-w-44 truncate font-medium text-ink">{p.clientName}</span>
                  <span className="block max-w-44 truncate text-muted">{p.taskTitle ?? p.engagementName}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="space-y-3 rounded-lg border border-line bg-surface p-3">
        <div className="flex gap-2" role="group" aria-label="Work type">
          <button type="button" className={chipCls(!internal)} aria-pressed={!internal} onClick={() => setInternal(false)}>Client work</button>
          <button type="button" className={chipCls(internal)} aria-pressed={internal} onClick={() => setInternal(true)}>Internal</button>
        </div>

        {internal ? (
          <div>
            <Label htmlFor="cat">Internal category</Label>
            <Select id="cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Choose…</option>
              {props.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        ) : (
          <>
            <div>
              <Label>Client</Label>
              <ClientPicker clients={props.clients} value={client} onPick={pickClient} onClear={clearClient} />
            </div>
            {client ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="eng">Engagement</Label>
                  <Select id="eng" value={engagementId} disabled={loadingTargets} onChange={(e) => { setEngagementId(e.target.value); setTaskId(""); setStageIndex(""); }}>
                    <option value="">{loadingTargets ? "Loading…" : targets.length ? "Choose…" : "No active engagement assigned to you"}</option>
                    {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                  {targetsNote ? <p className="mt-1 text-xs text-amber-800">{targetsNote}</p> : null}
                </div>
                {engagement && engagement.tasks.length > 0 ? (
                  <div>
                    <Label htmlFor="task">Task (optional)</Label>
                    <Select id="task" value={taskId} onChange={(e) => {
                      setTaskId(e.target.value);
                      const t = engagement.tasks.find((x) => x.id === e.target.value);
                      if (t?.stageIndex != null) setStageIndex(String(t.stageIndex));
                    }}>
                      <option value="">General work on the engagement</option>
                      {engagement.tasks.map((t) => <option key={t.id} value={t.id}>{t.title}{t.effectiveDueDate ? ` — due ${formatDate(t.effectiveDueDate)}` : ""}</option>)}
                    </Select>
                  </div>
                ) : null}
                {engagement && engagement.stages.length > 0 ? (
                  <div>
                    <Label htmlFor="stage">Stage (optional)</Label>
                    <Select id="stage" value={stageIndex} onChange={(e) => setStageIndex(e.target.value)}>
                      <option value="">—</option>
                      {engagement.stages.map((s) => <option key={s.index} value={s.index}>{s.name}</option>)}
                    </Select>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-line bg-surface p-3">
        <Label>Date</Label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Date">
          <button type="button" className={chipCls(dateMode === "today")} aria-pressed={dateMode === "today"} onClick={() => chooseSingleDate("today", today)}>Today</button>
          <button type="button" className={chipCls(dateMode === "yesterday")} aria-pressed={dateMode === "yesterday"} onClick={() => chooseSingleDate("yesterday", yesterday)}>Yesterday</button>
          <button type="button" className={chipCls(dateMode === "pick")} aria-pressed={dateMode === "pick"} onClick={() => setDateMode("pick")}>Pick a date</button>
          <button type="button" className={chipCls(dateMode === "multi")} aria-pressed={dateMode === "multi"} onClick={() => setDateMode("multi")}>Multiple dates</button>
          <button type="button" className={chipCls(dateMode === "week")} aria-pressed={dateMode === "week"} onClick={() => setDateMode("week")}>Whole week</button>
        </div>
        {dateMode === "pick" ? (
          <Input type="date" aria-label="Date" max={today} value={pickDate} onChange={(e) => e.target.value && chooseSingleDate("pick", e.target.value)} className="max-w-48" />
        ) : null}
        {dateMode === "multi" ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input type="date" aria-label="Add a date" max={today} value={multiAdd} onChange={(e) => setMultiAdd(e.target.value)} className="max-w-48" />
              <Button type="button" size="sm" variant="secondary" className="h-9" disabled={!multiAdd} onClick={() => {
                if (multiAdd && !multi.includes(multiAdd)) setMulti([...multi, multiAdd].sort());
                setMultiAdd("");
              }}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {multi.map((d) => (
                <button key={d} type="button" onClick={() => setMulti(multi.filter((x) => x !== d))} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand" aria-label={`Remove ${formatDate(d)}`}>
                  {shortDay(d)} ✕
                </button>
              ))}
              {multi.length === 0 ? <span className="text-xs text-muted">Add one or more dates.</span> : null}
            </div>
          </div>
        ) : null}
        {dateMode === "week" ? <p className="text-xs text-muted">Same entry on {weekDays.map(shortDay).join(", ")}.</p> : null}
      </section>

      <section className="space-y-2 rounded-lg border border-line bg-surface p-3">
        <Label>Time spent</Label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick time">
          {QUICK.map((m) => (
            <button key={m} type="button" className={chipCls(minutes === m)} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
              {m < 60 ? `${m}m` : `${m / 60}h`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" size="icon" variant="secondary" aria-label="15 minutes less" disabled={minutes <= 15} onClick={() => setMinutes(Math.max(15, minutes - 15))}><Minus className="h-4 w-4" aria-hidden /></Button>
          <span className="min-w-28 text-center text-base font-semibold tabular-nums" aria-live="polite">{formatMinutes(minutes)}</span>
          <Button type="button" size="icon" variant="secondary" aria-label="15 minutes more" disabled={minutes >= 720} onClick={() => setMinutes(Math.min(720, minutes + 15))}><Plus className="h-4 w-4" aria-hidden /></Button>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-line bg-surface p-3">
        <div>
          <Label htmlFor="desc">What did you do?</Label>
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Reconciled GSTR-2B with purchase register for Sept" rows={2} maxLength={2000} />
        </div>
        {props.chips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick descriptions">
            {props.chips.map((c) => {
              const on = chips.includes(c);
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => setChips(on ? chips.filter((x) => x !== c) : [...chips, c])}
                  className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-accent bg-accent text-white" : "border-line bg-white text-ink")}>{c}</button>
              );
            })}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="loc">Location</Label>
            <Select id="loc" value={location} disabled={!props.location.changeable} onChange={(e) => setLocation(e.target.value)}>
              {props.location.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            {!props.location.changeable ? <p className="mt-1 text-xs text-muted">Set by the admin.</p> : null}
          </div>
          <div>
            <Label htmlFor="otype">Outcome (optional)</Label>
            <Select id="otype" value={outcomeType} onChange={(e) => setOutcomeType(e.target.value)}>
              <option value="">None</option>
              {OUTCOME_TYPES.map((o) => <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>)}
            </Select>
          </div>
          {outcomeType ? (
            <div>
              <Label htmlFor="oref">{OUTCOME_LABELS[outcomeType as keyof typeof OUTCOME_LABELS]} number</Label>
              <Input id="oref" value={outcomeRef} onChange={(e) => setOutcomeRef(e.target.value)} autoComplete="off" />
            </div>
          ) : null}
        </div>
      </section>

      {result ? (
        <Alert tone={result.tone}>
          <p>{result.text}</p>
          {result.detail?.warnings.filter((w) => w !== result.text).map((w) => <p key={w} className="mt-1">{w}</p>)}
          {budget ? (
            <p className="mt-1 text-xs">
              Engagement budget: {formatMinutes(budget.usedMinutes)} used of {formatMinutes(budget.budgetMinutes)} — <strong>{budget.signal}</strong>
            </p>
          ) : null}
        </Alert>
      ) : null}

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="button" size="lg" className="w-full sm:w-auto" disabled={pending} onClick={save}>
          {pending ? "Saving…" : `Save ${formatMinutes(minutes)}${dates.length > 1 ? ` × ${dates.length} days` : ""}`}
        </Button>
      </div>

      <TimerCard
        timer={props.timer}
        target={!internal && engagementId ? { clientId: client?.id ?? null, engagementId, taskId: taskId || null } : null}
        targetLabel={targetLabel()}
      />
    </div>
  );
}
