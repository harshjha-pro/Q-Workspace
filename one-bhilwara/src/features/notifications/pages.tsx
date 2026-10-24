import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, BellOff, Briefcase, CalendarDays, CheckCheck, Megaphone, MessageCircle, Newspaper, Settings, Siren, Trash2, Vote, Wrench } from 'lucide-react';
import { useDB, useDocumentTitle, useSession } from '@/hooks/useStore';
import { store } from '@/services/store';
import { Button, cx, DemoBadge, EmptyState, LinkButton, PageHeader } from '@/components/ui/primitives';
import { Tabs, useUI } from '@/components/ui/overlay';
import { timeAgo } from '@/utils/format';

const ICONS: Record<string, typeof Bell> = { alert: Siren, job: Briefcase, job_match: Briefcase, service: Wrench, comment: MessageCircle, event: CalendarDays, news: Newspaper, poll: Vote, campaign: Megaphone, booking: CalendarDays };

export function NotificationsPage() {
  useDocumentTitle('Notifications');
  const { userId, prefs } = useSession();
  const nav = useNavigate();
  const { toast, confirm } = useUI();
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const all = useDB((s) => s.notifications.filter((n) => (n.userId === userId || n.userId === 'all') && prefs.notifyCategories.includes(n.type)));
  const list = tab === 'unread' ? all.filter((n) => !n.read) : all;
  const mark = (ids: string[], read = true) => store.update((s) => ({ notifications: s.notifications.map((n) => (ids.includes(n.id) ? { ...n, read } : n)) }));
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <PageHeader title="Notifications" subtitle="In-app notifications. Push alerts need setup in Settings." badge={<DemoBadge />}
        actions={<><Button variant="secondary" size="sm" icon={<CheckCheck className="size-4" aria-hidden />} disabled={!all.some((n) => !n.read)} onClick={() => { mark(all.map((n) => n.id)); toast('All marked as read'); }}>Mark all read</Button>
          <LinkButton variant="ghost" size="sm" to="/settings#notifications" icon={<Settings className="size-4" aria-hidden />}>Preferences</LinkButton></>} />
      <Tabs label="Filter" value={tab} onChange={setTab} tabs={[{ id: 'all', label: 'All', count: all.length }, { id: 'unread', label: 'Unread', count: all.filter((n) => !n.read).length }]} />
      {list.length === 0 ? <EmptyState icon={<BellOff className="size-6" aria-hidden />} title={tab === 'unread' ? 'You’re all caught up' : 'No notifications'} text="Updates about your requests, applications, bookings and city alerts appear here." action={<LinkButton variant="secondary" to="/">Back to home</LinkButton>} /> : (
        <ul className="card divide-y divide-line">
          {list.map((n) => {
            const I = ICONS[n.type] ?? Bell;
            return (
              <li key={n.id} className={cx('flex items-start gap-3 p-4', !n.read && 'bg-navy-50/50')}>
                <span className={cx('grid size-9 shrink-0 place-items-center rounded-full', n.type === 'alert' ? 'bg-danger-50 text-danger' : 'bg-navy-50 text-navy')}><I className="size-4" aria-hidden /></span>
                <Link to={n.link} onClick={() => mark([n.id])} className="min-w-0 flex-1">
                  <p className={cx('text-sm', !n.read && 'font-bold')}>{n.title}{!n.read && <span className="sr-only"> (unread)</span>}</p>
                  <p className="text-sm text-muted">{n.body}</p>
                  <p className="text-xs text-muted">{timeAgo(n.createdAt)}</p>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => mark([n.id], !n.read)}>{n.read ? 'Mark unread' : 'Mark read'}</Button>
              </li>
            );
          })}
        </ul>
      )}
      {all.length > 0 && <Button variant="ghost" className="justify-self-start" icon={<Trash2 className="size-4" aria-hidden />} onClick={async () => {
        if (await confirm({ title: 'Clear notification history?', message: 'Removes your notifications from this device.', danger: true, confirmLabel: 'Clear all' })) {
          store.update((s) => ({ notifications: s.notifications.filter((n) => !(n.userId === userId)) .map((n) => (n.userId === 'all' ? { ...n, read: true } : n)) }));
          toast('Notification history cleared'); nav('/notifications');
        }
      }}>Clear history</Button>}
    </div>
  );
}
