"use client";
import { useRef, useState } from "react";
import { extractNoticeFields, suggestedDueDate } from "@/server/helpers/notice-extract";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Same display as the rest of the app (dd-Mon-yyyy); the field itself keeps the ISO value. */
const show = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8)}-${MON[Number(v.slice(5, 7)) - 1]}-${v.slice(0, 4)}` : v);

const LABELS: Record<string, string> = {
  authority: "Authority", section: "Section", ayOrPeriod: "AY / period", referenceNo: "Reference / DIN", noticeDate: "Notice date",
  responseDueDate: "Response due", responseWithinDays: "Response due", noticeType: "Notice type", demandRupees: "Demand",
};

/**
 * Paste the notice text and fill the form from it (P4-06 →, D-85). Runs in the browser; the text itself is not
 * saved. Only empty fields are filled, and every filled value is listed with the words it came from.
 */
export function FillFromText({ today }: { today: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [found, setFound] = useState<{ field: string; value: string; from: string }[] | null>(null);

  function fill() {
    const form = box.current?.closest("form");
    if (!form) return;
    const s = extractNoticeFields(text);
    const received = (form.elements.namedItem("receivedDate") as HTMLInputElement | null)?.value || today;
    const due = suggestedDueDate(s, received);
    const values: Record<string, string | undefined> = {
      authority: s.authority, section: s.section, ayOrPeriod: s.ayOrPeriod, referenceNo: s.referenceNo, noticeType: s.noticeType,
      noticeDate: s.noticeDate && s.noticeDate <= today ? s.noticeDate : undefined, responseDueDate: due,
      demand: s.demandRupees ? String(s.demandRupees) : undefined,
    };
    const shown: { field: string; value: string; from: string }[] = [];
    for (const [name, value] of Object.entries(values)) {
      if (!value) continue;
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (!el) continue;
      // Authority always has a value (a select); the others are filled only when still empty.
      if (name !== "authority" && el.value) continue;
      el.value = value;
      const key = name === "demand" ? "demandRupees" : name === "responseDueDate" && !s.responseDueDate ? "responseWithinDays" : name;
      shown.push({ field: LABELS[key] ?? name, value, from: s.evidence[key as keyof typeof s.evidence] ?? "" });
    }
    setFound(shown);
  }

  return (
    <div ref={box} className="space-y-2 rounded-md border border-dashed border-line p-2">
      <Textarea aria-label="Notice text" rows={3} placeholder="Optional: paste the notice text here, then fill the fields from it." value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={fill} disabled={!text.trim()}>Fill from text</Button>
        <span className="text-xs text-muted">Check each value before saving. The pasted text is not stored.</span>
      </div>
      {found ? (
        found.length ? (
          <ul className="text-xs">{found.map((f) => <li key={f.field}><span className="font-medium">{f.field}:</span> {show(f.value)} <span className="text-muted">— from “{f.from}”</span></li>)}</ul>
        ) : <p className="text-xs text-muted">Nothing recognised; please fill the fields by hand.</p>
      ) : null}
    </div>
  );
}
