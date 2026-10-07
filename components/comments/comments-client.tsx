"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addCommentAction, deleteCommentAction, editCommentAction } from "./actions";

type Person = { id: string; username: string; displayName: string };
type CommentRow = {
  id: string; authorName: string; body: string; deleted: boolean; createdAt: string; editedAt: string | null;
  mentions: string[]; canEdit: boolean; canDelete: boolean;
};
type Entity = "TASK" | "ENGAGEMENT" | "NOTICE" | "LEAD";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Highlight @username tokens in a comment body. */
function Body({ text }: { text: string }) {
  const parts = text.split(/(@[a-z0-9][a-z0-9._-]*[a-z0-9]|@[a-z0-9])/gi);
  return (
    <p className="whitespace-pre-wrap break-words text-sm">
      {parts.map((p, i) => (p.startsWith("@") ? <span key={i} className="font-medium text-brand">{p}</span> : <span key={i}>{p}</span>))}
    </p>
  );
}

/** Textarea with @mention autocomplete among the people who can see the record. */
export function MentionTextarea({ value, onChange, people, placeholder, rows = 3, label }: { value: string; onChange: (v: string) => void; people: Person[]; placeholder?: string; rows?: number; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const matches = query === null ? [] : people.filter((p) => p.username.toLowerCase().includes(query) || p.displayName.toLowerCase().includes(query)).slice(0, 6);

  const detect = (text: string, caret: number) => {
    const m = /(^|\s)@([\w.-]*)$/.exec(text.slice(0, caret));
    setQuery(m ? m[2]!.toLowerCase() : null);
    setActive(0);
  };
  const insert = (p: Person) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([\w.-]*)$/, `@${p.username} `);
    const next = before + value.slice(caret);
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        aria-label={label}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={(e) => {
          if (!matches.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % matches.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insert(matches[active]!); }
          else if (e.key === "Escape") setQuery(null);
        }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {matches.length ? (
        <ul role="listbox" aria-label="Mention a colleague" className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-auto rounded-md border border-line bg-white shadow-lg sm:right-auto sm:w-72">
          {matches.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); insert(p); }} className={cn("flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-gray-50", i === active && "bg-brand-50")}>
                <span className="font-medium">{p.displayName}</span>
                <span className="text-xs text-muted">@{p.username}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CommentItem({ c, people }: { c: CommentRow; people: Person[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (c.deleted) {
    return <li id={`comment-${c.id}`} className="px-4 py-3 text-sm italic text-muted">Comment deleted by {c.authorName}.</li>;
  }
  return (
    <li id={`comment-${c.id}`} className="space-y-1 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
        <span className="text-sm font-medium text-ink">{c.authorName}</span>
        <span>{fmt(c.createdAt)}</span>
        {c.editedAt ? <span>(edited)</span> : null}
      </div>
      {editing ? (
        <div className="space-y-2">
          <MentionTextarea label="Edit comment" value={text} onChange={setText} people={people} rows={3} />
          {err ? <Alert tone="error">{err}</Alert> : null}
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || !text.trim()} onClick={() => start(async () => {
              const r = await editCommentAction(c.id, text);
              if (r.ok) { setEditing(false); setErr(null); router.refresh(); } else setErr(r.error);
            })}>{pending ? "Saving…" : "Save"}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(c.body); setErr(null); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Body text={c.body} />
      )}
      {!editing && (c.canEdit || c.canDelete) ? (
        <div className="flex gap-3 pt-1 text-xs">
          {c.canEdit ? <button type="button" className="text-brand hover:underline" onClick={() => setEditing(true)}>Edit</button> : null}
          {c.canDelete ? (
            <button type="button" className="text-red-700 hover:underline" disabled={pending} onClick={() => {
              if (!window.confirm("Delete this comment?")) return;
              start(async () => {
                const r = await deleteCommentAction(c.id);
                if (r.ok) router.refresh(); else setErr(r.error);
              });
            }}>Delete</button>
          ) : null}
        </div>
      ) : null}
      {!editing && err ? <Alert tone="error">{err}</Alert> : null}
    </li>
  );
}

export function CommentThread({ entityType, entityId, comments, people, readOnly, editWindowMinutes }: { entityType: Entity; entityId: string; comments: CommentRow[]; people: Person[]; readOnly: boolean; editWindowMinutes: number }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      {comments.length === 0 ? <p className="px-4 py-3 text-sm text-muted">No comments yet.</p> : (
        <ul className="divide-y divide-line">{comments.map((c) => <CommentItem key={c.id} c={c} people={people} />)}</ul>
      )}
      {readOnly ? (
        <p className="border-t border-line px-4 py-3 text-xs text-muted">This record is archived; the discussion is read-only.</p>
      ) : (
        <form
          className="space-y-2 border-t border-line px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await addCommentAction(entityType, entityId, text);
              if (r.ok) { setText(""); setMsg(r.data?.notNotified.length ? { ok: true, text: r.message ?? "" } : null); router.refresh(); }
              else setMsg({ ok: false, text: r.error });
            });
          }}
        >
          <MentionTextarea label="Add a comment" value={text} onChange={setText} people={people} placeholder="Write a comment… use @ to mention someone" />
          {msg ? <Alert tone={msg.ok ? "warn" : "error"}>{msg.text}</Alert> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={pending || !text.trim()}>{pending ? "Posting…" : "Post comment"}</Button>
            <span className="text-xs text-muted">You can edit for {editWindowMinutes} minutes after posting.</span>
          </div>
        </form>
      )}
    </div>
  );
}
