import { formatDateTime } from "@/server/lib/dates";
import { cn } from "@/lib/utils";

type Msg = { id: string; body: string; sentAt: Date; fromClient: boolean; author: string; attachment: { id: string; name: string } | null; readByOtherSide: boolean };

/** The message list, shared by the staff and portal thread pages; "mine" decides which side is right-aligned. */
export function ThreadView({ messages, mineIsClient }: { messages: Msg[]; mineIsClient: boolean }) {
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const mine = m.fromClient === mineIsClient;
        return (
          <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-lg border px-3 py-2 text-sm shadow-sm", mine ? "border-brand-50 bg-brand-50" : "border-line bg-white")}>
              <div className="mb-1 text-xs text-muted">{m.author} · {formatDateTime(m.sentAt)}{mine && m.readByOtherSide ? " · seen" : ""}</div>
              {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : null}
              {m.attachment ? <a className="mt-1 inline-block text-sm underline" href={`/api/dms/${m.attachment.id}`}>📎 {m.attachment.name}</a> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
