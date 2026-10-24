import { useState } from 'react';
import type { Enquiry } from '@/types/models';
import { sanitize } from '@/services/domain/common';
import { repo } from '@/services/store';
import { timeAgo } from '@/utils/format';
import { nowIso } from '@/utils/ids';
import { Button, EmptyState, StatusPill } from './ui/primitives';
import { useUI } from './ui/overlay';

/** Shared enquiry inbox for owners/sellers/businesses. */
export function EnquiryInbox({ items }: { items: Enquiry[] }) {
  const { toast } = useUI();
  const [reply, setReply] = useState<Record<string, string>>({});
  if (items.length === 0) return <EmptyState title="No enquiries yet" text="Enquiries from interested people appear here." />;
  return (
    <ul className="grid gap-3">
      {items.map((q) => (
        <li key={q.id} className="card grid gap-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{q.name} <span className="font-normal text-muted">about {q.targetName}</span></p><StatusPill status={q.status} /></div>
          <p className="text-sm">“{q.message}”</p>
          <p className="text-xs text-muted">{q.consent ? `Mobile shared with consent: ${q.mobile}` : 'Contact not shared'} · {timeAgo(q.createdAt)}{q.preferredTime ? ` · Prefers: ${q.preferredTime}` : ''}</p>
          {q.replies.map((r, i) => <p key={i} className="rounded bg-page p-2 text-sm"><span className="font-semibold">{r.from}:</span> {r.text}</p>)}
          {q.status !== 'closed' && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = sanitize(reply[q.id] ?? '', 1000); if (t.length < 2) return; repo.at('enquiries').mutate(q.id, (c) => ({ status: 'responded', replies: [...c.replies, { from: 'You', text: t, at: nowIso() }] })); setReply({ ...reply, [q.id]: '' }); toast('Reply saved (demo — not sent by SMS)'); }}>
              <input aria-label="Reply" className="input" value={reply[q.id] ?? ''} onChange={(e) => setReply({ ...reply, [q.id]: e.target.value })} placeholder="Write a reply" />
              <Button type="submit">Reply</Button>
              <Button variant="ghost" onClick={() => { repo.patch('enquiries', q.id, { status: 'closed' }); toast('Enquiry closed'); }}>Close</Button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
