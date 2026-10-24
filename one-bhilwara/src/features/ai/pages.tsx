import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bot, ExternalLink, Loader2, Paperclip, Send, Trash2, User } from 'lucide-react';
import type { AIMessage } from '@/types/models';
import { useDB, useDocumentTitle, useSession } from '@/hooks/useStore';
import { aiMode, askAssistant, SUGGESTED_PROMPTS } from '@/services/adapters/ai';
import { sanitize } from '@/services/domain/common';
import { store } from '@/services/store';
import { Button, cx, DemoBadge, Notice, PageHeader } from '@/components/ui/primitives';
import { useUI } from '@/components/ui/overlay';
import { nowIso, uid } from '@/utils/ids';
import { formatTime } from '@/utils/format';

export function AIPage() {
  useDocumentTitle('AI Assistant');
  const [params, setParams] = useSearchParams();
  const { prefs } = useSession();
  const history = useDB((s) => s.ai);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const { toast, confirm } = useUI();

  const send = async (raw: string) => {
    const q = sanitize(raw, 500);
    if (!q || busy) return;
    setError('');
    const userMsg: AIMessage = { id: uid('ai'), role: 'user', text: q, at: nowIso() };
    store.update((s) => ({ ai: [...s.ai, userMsg].slice(-60) }));
    setText('');
    setBusy(true);
    try {
      const reply = await askAssistant(store.getState().ai, q, store.getState(), prefs.localityId);
      store.update((s) => ({ ai: [...s.ai, reply].slice(-60) }));
    } catch (e) {
      setError((e as Error).message || 'The assistant could not answer. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { const q = params.get('q'); if (q) { setParams({}, { replace: true }); void send(q); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (history.length || busy) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [history.length, busy]);

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <PageHeader title="One Bhilwara AI" subtitle="Ask about services, jobs, PGs, schemes, events, prices — or where to find something in the app."
        badge={aiMode === 'demo' ? <DemoBadge label="Demo assistant" /> : undefined}
        actions={history.length > 0 ? <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" aria-hidden />} onClick={async () => { if (await confirm({ title: 'Clear chat history?', message: 'This removes the conversation from this device.', danger: true, confirmLabel: 'Clear' })) { store.update(() => ({ ai: [] })); toast('Chat cleared'); } }}>Clear</Button> : undefined} />
      {aiMode === 'demo' && <Notice tone="demo">Demo mode: answers come from simple rules over One Bhilwara’s sample data. The assistant does not search the internet or live data. For medical, legal, financial or crop decisions, consult a qualified professional.</Notice>}

      <section aria-label="Conversation" aria-live="polite" className="card grid min-h-[40vh] content-start gap-4 p-4">
        {history.length === 0 && (
          <div className="grid gap-3">
            <p className="text-sm font-semibold text-muted">Try asking</p>
            <div className="flex flex-wrap gap-2">{SUGGESTED_PROMPTS.map((p) => <button key={p} type="button" className="chip" onClick={() => send(p)}>{p}</button>)}</div>
          </div>
        )}
        {history.map((m) => <Message key={m.id} m={m} />)}
        {busy && <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" aria-hidden />Thinking…</div>}
        {error && <Notice tone="danger" title="Couldn’t get an answer">{error} <button type="button" className="underline" onClick={() => setError('')}>Dismiss</button></Notice>}
        <div ref={endRef} />
      </section>

      <form className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] flex gap-2 rounded-2xl border border-line bg-white p-2 shadow-lg lg:bottom-4" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <button type="button" className="grid size-11 place-items-center rounded-lg text-muted hover:bg-page" aria-label="Attach a file" onClick={() => toast('Attachments need a configured AI service that supports files (not available in demo).', 'info')}><Paperclip className="size-5" aria-hidden /></button>
        <label htmlFor="ai-input" className="sr-only">Message</label>
        <input id="ai-input" className="input border-0 focus:ring-0" placeholder="Ask anything about Bhilwara…" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoComplete="off" />
        <Button type="submit" disabled={!text.trim() || busy} aria-label="Send"><Send className="size-4" aria-hidden /></Button>
      </form>
    </div>
  );
}

function Message({ m }: { m: AIMessage }) {
  const mine = m.role === 'user';
  return (
    <div className={cx('flex gap-3', mine && 'flex-row-reverse')}>
      <span className={cx('grid size-8 shrink-0 place-items-center rounded-full', mine ? 'bg-brand text-white' : 'bg-teal-50 text-teal')} aria-hidden>{mine ? <User className="size-4" /> : <Bot className="size-4" />}</span>
      <div className={cx('grid max-w-[85%] gap-2', mine && 'justify-items-end')}>
        <div className={cx('whitespace-pre-line rounded-2xl px-4 py-2.5 text-[15px]', mine ? 'bg-brand text-white' : 'bg-page text-ink')}>
          <span className="sr-only">{mine ? 'You said:' : 'Assistant:'} </span>{m.text}
        </div>
        {m.cards && m.cards.length > 0 && (
          <ul className="grid w-full gap-2">{m.cards.map((c) => (
            <li key={c.type + c.id}><Link to={c.link} className="card block p-3 hover:border-brand/30"><span className="block font-semibold">{c.title}</span><span className="text-sm text-muted">{c.subtitle}</span></Link></li>
          ))}</ul>
        )}
        {m.sources && <p className="text-xs text-muted">Sources: {m.sources.map((s) => <a key={s.link} href={s.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline">{s.label}<ExternalLink className="size-3" aria-hidden /></a>)}</p>}
        {m.actions && <div className="flex flex-wrap gap-2">{m.actions.map((a) => a.link.startsWith('tel:') ? <a key={a.link} href={a.link} className="chip border-danger text-danger">{a.label}</a> : <Link key={a.link} to={a.link} className="chip">{a.label} →</Link>)}</div>}
        <span className="text-[11px] text-muted">{formatTime(m.at)}{m.demo ? ' · demo answer' : ''}</span>
      </div>
    </div>
  );
}
