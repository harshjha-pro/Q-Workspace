import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate, useParams, Link } from 'react-router-dom';
import {
  User, ShieldCheck, HardDrive, RefreshCw, Archive, SlidersHorizontal, Tag as TagIcon, Trash2, Info, ChevronRight, KeyRound, Lock, LogOut, Monitor, Server, Cloud, Check, AlertTriangle,
  Download, Upload, RotateCcw, Database, Smartphone, GitMerge, CloudOff, Plus, Pencil, FileJson, X,
} from 'lucide-react';
import { api, downloadUrl, ApiError, uploadForm, uploadParts, fetchBinary, getTransferChunk } from '../../lib/api';
import { store, useStoreVersion, useSyncStatus } from '../../lib/store';
import { useSession, changePassword, lock, logout, setIdleMinutes } from '../../lib/session';
import { usePrefs, setPrefs } from '../../lib/prefs';
import { useServerSettings, patchServerSettings, refreshServerSettings } from '../../lib/serverSettings';
import { cacheUsage, clearFileCache, retryUpload, cancelUpload } from '../../lib/files';
import { storageEstimate } from '../../lib/idb';
import { formatBytes, formatDateTime, timeAgo, plural, useIsMobile, useOnline, saveBlob } from '../../lib/util';
import { Button, IconButton, Card, CardHead, Field, Input, Select, Segmented, Switch, ProgressBar, Badge, EmptyState, PasswordInput, Spinner } from '../../components/ui';
import { Modal, confirmDialog, promptDialog, toast } from '../../components/overlay';
import { DiffView } from '../../components/domain';
import { PasswordFields } from '../auth/Auth';
import { usePageMeta } from '../../layout/AppShell';
import { ENTITIES, ENTITY_NAMES, type EntityName } from '../../../shared/schema';

const SECTIONS = [
  { id: 'account', label: 'Account', icon: <User />, desc: 'Password, sessions, sign out' },
  { id: 'security', label: 'Security & session', icon: <ShieldCheck />, desc: 'Inactivity timeout and session length' },
  { id: 'storage', label: 'Storage', icon: <HardDrive />, desc: 'Local, self-hosted or private cloud' },
  { id: 'sync', label: 'Sync & offline', icon: <RefreshCw />, desc: 'Pending changes, conflicts, offline files' },
  { id: 'backup', label: 'Backup & restore', icon: <Archive />, desc: 'Create, schedule, restore, export' },
  { id: 'app', label: 'Application', icon: <SlidersHorizontal />, desc: 'Theme, defaults, upload limits' },
  { id: 'tags', label: 'Tags', icon: <TagIcon />, desc: 'Create, rename and remove tags' },
  { id: 'trash', label: 'Trash', icon: <Trash2 />, desc: 'Restore deleted items' },
  { id: 'about', label: 'About & install', icon: <Info />, desc: 'Version, install as app' },
];

export default function SettingsPage() {
  const { section } = useParams();
  const mobile = useIsMobile();
  const cur = SECTIONS.find((s) => s.id === section);
  usePageMeta(cur ? cur.label : 'Settings', mobile && cur ? '/settings' : undefined);
  const content = (() => {
    switch (cur?.id ?? (mobile ? '' : 'account')) {
      case 'account': return <AccountSection />;
      case 'security': return <SecuritySection />;
      case 'storage': return <StorageSection />;
      case 'sync': return <SyncSection />;
      case 'backup': return <BackupSection />;
      case 'app': return <AppSection />;
      case 'tags': return <TagsSection />;
      case 'trash': return <TrashSection />;
      case 'about': return <AboutSection />;
      default: return null;
    }
  })();
  if (mobile && !cur) {
    return (
      <>
        <div className="page-head"><h1>Settings</h1></div>
        <Card><div className="list">{SECTIONS.map((s) => <Link key={s.id} to={`/settings/${s.id}`} className="list-row"><span className="icon-tile sm tone-slate">{s.icon}</span><div className="grow"><div className="strong">{s.label}</div><div className="meta">{s.desc}</div></div><ChevronRight style={{ width: 18, color: 'var(--text-3)' }} /></Link>)}</div></Card>
      </>
    );
  }
  return (
    <>
      {!mobile && <div className="page-head"><h1>Settings</h1></div>}
      <div className={mobile ? '' : 'split'}>
        {!mobile && <nav className="filter-rail card sticky-panel" style={{ padding: 8 }}>{SECTIONS.map((s) => <NavLink key={s.id} to={`/settings/${s.id}`} className="nav-filter" aria-pressed={(cur?.id ?? 'account') === s.id} style={{ textDecoration: 'none' }}>{s.icon}{s.label}</NavLink>)}</nav>}
        <div className="col gap-16" style={{ maxWidth: 860 }}>{content}</div>
      </div>
    </>
  );
}

function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return <div className="row between row-wrap gap-12" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}><div className="col gap-4" style={{ minWidth: 0, flex: '1 1 240px' }}><span style={{ fontWeight: 500 }}>{label}</span>{hint && <span className="hint">{hint}</span>}</div><div className="row">{children}</div></div>;
}

// ---------------- Account ----------------
function AccountSection() {
  const sess = useSession();
  const prefs = usePrefs();
  const online = useOnline();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; createdAt: string; lastSeen: string; ip: string; current: boolean }[]>([]);
  const [signout, setSignout] = useState(false);
  const loadSessions = () => api('/api/auth/sessions').then(setSessions).catch(() => {});
  useEffect(() => { void loadSessions(); }, []);
  const submit = async () => {
    if (next !== confirm) { setErr('Passwords do not match.'); return; }
    setBusy(true); setErr(null);
    try { await changePassword(current, next); setCurrent(''); setNext(''); setConfirm(''); toast.success('Password changed. Other devices were signed out.'); void loadSessions(); }
    catch (e) { setErr((e as ApiError).data?.problems?.join(' ') || (e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <>
      <Card>
        <CardHead title="Profile" />
        <div className="card-body">
          <Row label="Username" hint="Single authorised account. Registration is disabled."><span className="mono">{sess.username}</span></Row>
          <Row label="Display name" hint="Used in greetings on this device."><Input style={{ width: 220 }} value={prefs.displayName} placeholder={sess.username} onChange={(e) => setPrefs({ displayName: e.target.value })} /></Row>
        </div>
      </Card>
      <Card>
        <CardHead title="Change password" sub="Signs out all other sessions. Also re-protects this device's offline copy." />
        <form className="card-body col gap-12" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {err && <div className="alert err"><AlertTriangle />{err}</div>}
          {!online && <div className="alert warn"><CloudOff />Changing the password needs a connection.</div>}
          <input type="text" autoComplete="username" value={sess.username} readOnly hidden />
          <Field label="Current password"><PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
          <PasswordFields next={next} setNext={setNext} confirm={confirm} setConfirm={setConfirm} username={sess.username} />
          <div><Button type="submit" variant="primary" icon={<KeyRound />} loading={busy} disabled={!online || !current || !next || next !== confirm}>Change password</Button></div>
        </form>
      </Card>
      <Card>
        <CardHead title="Active sessions" actions={sessions.length > 1 && <Button size="sm" onClick={async () => { const r = await api<{ revoked: number }>('/api/auth/sessions/revoke-others', { method: 'POST' }); toast.success(`Signed out ${plural(r.revoked, 'other session')}`); void loadSessions(); }}>Sign out other sessions</Button>} />
        <div className="list">{sessions.map((s) => <div key={s.id} className="list-row"><Monitor style={{ width: 18, color: 'var(--text-3)' }} /><div className="grow"><div className="small">{s.current ? 'This device' : `Session ${s.id}`}{s.current && <Badge tone="success">Current</Badge>}</div><div className="tiny muted">Signed in {formatDateTime(s.createdAt)} · active {timeAgo(s.lastSeen)} · {s.ip}</div></div></div>)}{!sessions.length && <p className="card-body small muted">{online ? 'Loading…' : 'Unavailable offline.'}</p>}</div>
      </Card>
      <Card pad className="row row-wrap">
        <Button icon={<Lock />} onClick={() => void lock('Workspace locked.')}>Lock now</Button>
        <Button variant="danger-ghost" icon={<LogOut />} onClick={() => setSignout(true)}>Sign out</Button>
      </Card>
      <Modal open={signout} onClose={() => setSignout(false)} size="narrow" title="Sign out" footer={<><Button onClick={() => void logout(false)}>Sign out</Button><Button variant="danger" onClick={() => void logout(true)}>Sign out & remove offline data</Button></>}>
        <p className="muted">Removing offline data deletes the encrypted copy of your workspace from this device. Unsynced changes would be lost.</p>
      </Modal>
    </>
  );
}

// ---------------- Security ----------------
function SecuritySection() {
  const s = useServerSettings();
  const [idle, setIdle] = useState(String(s.session_idle_minutes));
  const [days, setDays] = useState(String(s.session_max_days));
  useEffect(() => { setIdle(String(s.session_idle_minutes)); setDays(String(s.session_max_days)); }, [s.session_idle_minutes, s.session_max_days]);
  const save = async () => {
    try { const r = await patchServerSettings({ session_idle_minutes: Number(idle), session_max_days: Number(days) }); setIdleMinutes(r.session_idle_minutes); toast.success('Session settings saved'); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Card>
      <CardHead title="Session" />
      <div className="card-body">
        <Row label="Lock after inactivity" hint="Locks this app and expires the server session after this many idle minutes (5–1440)."><Select value={idle} onChange={(e) => setIdle(e.target.value)} style={{ width: 160 }}>{[5, 10, 15, 30, 60, 120, 240, 480, 1440].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`}</option>)}</Select></Row>
        <Row label="Maximum session length" hint="You must sign in again after this, even when active."><Select value={days} onChange={(e) => setDays(e.target.value)} style={{ width: 160 }}>{[1, 7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} day{d === 1 ? '' : 's'}</option>)}</Select></Row>
        <div className="col gap-8 mt-16 small muted">
          <div className="row gap-8"><Check style={{ width: 16, color: 'var(--success)' }} />Passwords hashed with Argon2id (64 MiB, 3 passes)</div>
          <div className="row gap-8"><Check style={{ width: 16, color: 'var(--success)' }} />HttpOnly, SameSite=Strict session cookie bound to this browser; CSRF token on every change</div>
          <div className="row gap-8"><Check style={{ width: 16, color: 'var(--success)' }} />Sign-in rate limiting with progressive lockout</div>
          <div className="row gap-8"><Check style={{ width: 16, color: 'var(--success)' }} />Offline data on this device encrypted with AES-256-GCM</div>
        </div>
        <div className="mt-16"><Button variant="primary" onClick={save}>Save</Button></div>
      </div>
    </Card>
  );
}

// ---------------- Storage ----------------
interface StorageInfo { serverless?: boolean; database?: string; mode: 'local' | 'self_hosted' | 'cloud'; driver: string; encrypted: boolean; s3Configured: boolean; s3: { bucket: string; endpoint: string; prefix: string } | null; totals: { driver: string; n: number; bytes: number; stored: number }[]; dbBytes: number; disk: { total: number; free: number } | null; job: any; host: string; dataDir: string }
const MODES = [
  { id: 'local' as const, label: 'Local-only', icon: <Monitor />, desc: 'Data stays on this device. The server only accepts connections from this computer; no other device can sync. Backups are local files.' },
  { id: 'self_hosted' as const, label: 'Self-hosted', icon: <Server />, desc: 'Runs on a server you control. Files and database live on that server; all your devices sync securely over HTTPS.' },
  { id: 'cloud' as const, label: 'Private cloud', icon: <Cloud />, desc: 'Files are stored in your private S3-compatible bucket (AWS S3, Cloudflare R2, MinIO…), encrypted before upload. Backups are copied to the bucket.' },
];

function StorageSection() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cache, setCache] = useState<{ bytes: number; files: number } | null>(null);
  const [est, setEst] = useState<StorageEstimate | undefined>();
  const prefs = usePrefs();
  const load = () => api<StorageInfo>('/api/storage').then((i) => { setInfo(i); setErr(null); }).catch((e) => setErr(e.message));
  useEffect(() => { void load(); void cacheUsage().then(setCache); void storageEstimate().then(setEst); }, []);
  useEffect(() => { if (info?.job?.status !== 'running') return; const t = setInterval(load, 1500); return () => clearInterval(t); }, [info?.job?.status]);
  const choose = async (mode: StorageInfo['mode']) => {
    try {
      const pre = await api<{ needsConfirm: boolean; migrate: boolean; files: number; from: string; to: string }>('/api/storage/mode', { body: { mode } });
      const ok = await confirmDialog({
        title: `Switch to ${MODES.find((m) => m.id === mode)!.label}?`, confirmLabel: 'Switch',
        message: pre.migrate ? <>{plural(pre.files, 'file')} will be copied from <b>{pre.from}</b> to <b>{pre.to}</b> and verified by checksum. The active storage only changes after every file is verified. Nothing is deleted from the current location.</> : mode === 'local' ? 'Only this computer will be able to reach the server. Other devices will stop syncing until you switch back.' : 'No files need to move.',
      });
      if (!ok) return;
      await api('/api/storage/mode', { body: { mode, confirm: true } });
      toast.success('Storage mode updated');
      void load(); void refreshServerSettings();
    } catch (e) { toast.error((e as Error).message); }
  };
  const job = info?.job; const jd = job?.detail ? JSON.parse(job.detail) : null;
  if (info?.serverless) return (
    <>
      <Card>
        <CardHead title="Storage" sub="Cloud deployment" />
        <div className="card-body col gap-12">
          <div className="radio-card" style={{ borderColor: 'var(--primary)', background: 'var(--primary-soft)', cursor: 'default' }}>
            <span className="icon-tile sm tone-indigo"><Cloud /></span>
            <div className="grow col gap-4"><div className="row gap-8"><span className="strong">App on Vercel · data in your {info.database === 'mysql' ? 'MySQL' : ''} database</span><Badge tone="success">Active</Badge></div>
              <span className="small muted">Projects, prompts, versions, notes and every uploaded file (encrypted with AES-256-GCM before it is stored) live in your database. Vercel keeps nothing between requests.</span></div>
          </div>
          <Row label="Database size" hint="Includes stored files and backups"><span className="num">{formatBytes(info.dbBytes)}</span></Row>
          {info.totals.map((t) => <Row key={t.driver} label="Stored files"><span className="num">{plural(t.n, 'file')} · {formatBytes(t.bytes)}</span></Row>)}
          <Row label="Encryption at rest"><Badge tone={info.encrypted ? 'success' : 'warning'}>{info.encrypted ? 'On' : 'Off'}</Badge></Row>
        </div>
      </Card>
      <DeviceStorage cache={cache} est={est} setCache={setCache} />
    </>
  );
  return (
    <>
      <Card>
        <CardHead title="Storage mode" sub={info ? <>Active: <b>{MODES.find((m) => m.id === info.mode)?.label}</b> · files on <b>{info.driver === 's3' ? 'S3 bucket' : 'server disk'}</b></> : undefined} />
        <div className="card-body col gap-12">
          {err && <div className="alert warn"><CloudOff />{err}</div>}
          {MODES.map((m) => {
            const active = info?.mode === m.id;
            const disabled = m.id === 'cloud' && info && !info.s3Configured;
            return (
              <div key={m.id} className="radio-card" style={{ borderColor: active ? 'var(--primary)' : undefined, background: active ? 'var(--primary-soft)' : undefined, cursor: 'default' }}>
                <span className="icon-tile sm tone-indigo">{m.icon}</span>
                <div className="grow col gap-4"><div className="row gap-8"><span className="strong">{m.label}</span>{active && <Badge tone="success">Active</Badge>}</div><span className="small muted">{m.desc}</span>
                  {m.id === 'cloud' && info && (info.s3Configured ? <span className="tiny">Bucket: <span className="mono">{info.s3!.bucket}</span> at {info.s3!.endpoint}</span> : <span className="tiny warning-text">Not configured on the server. Set PPM_S3_BUCKET, PPM_S3_ACCESS_KEY_ID, PPM_S3_SECRET_ACCESS_KEY (and PPM_S3_ENDPOINT for non-AWS) and restart.</span>)}
                  {m.id === 'local' && <span className="tiny muted">Tip: run the server with PPM_HOST=127.0.0.1 for this mode.</span>}
                </div>
                {!active && <Button size="sm" disabled={!info || !!disabled || job?.status === 'running'} onClick={() => choose(m.id)}>Use</Button>}
              </div>
            );
          })}
          {job && (
            <div className={`alert ${job.status === 'failed' ? 'err' : job.status === 'completed' ? 'ok' : 'info'}`}>
              {job.status === 'running' ? <RefreshCw className="spin" style={{ animation: 'spin 1s linear infinite' }} /> : job.status === 'failed' ? <AlertTriangle /> : <Check />}
              <div className="grow col gap-4">
                <span>Migration {job.status}{jd?.total !== undefined ? ` · ${jd.done ?? 0}/${jd.total} files` : ''} · {timeAgo(job.updated_at)}</span>
                {job.status === 'running' && <ProgressBar value={job.progress * 100} tone="primary" />}
                {jd?.message && <span className="small">{jd.message}</span>}
                {jd?.failures?.length > 0 && <details className="small"><summary>{jd.failures.length} problem(s)</summary>{jd.failures.map((f: string) => <div key={f} className="mono tiny">{f}</div>)}</details>}
                {job.status === 'failed' && <div><Button size="sm" onClick={async () => { await api('/api/storage/retry', { method: 'POST' }); void load(); }}>Retry migration</Button></div>}
              </div>
            </div>
          )}
        </div>
      </Card>
      <Card>
        <CardHead title="Server storage" actions={<IconButton size="sm" label="Refresh" icon={<RefreshCw />} onClick={load} />} />
        <div className="card-body">
          {!info ? <Spinner /> : <>
            <Row label="Database" hint={info.dataDir}><span className="num">{formatBytes(info.dbBytes)}</span></Row>
            {info.totals.map((t) => <Row key={t.driver} label={`Files on ${t.driver === 's3' ? 'S3 bucket' : 'server disk'}`}><span className="num">{plural(t.n, 'file')} · {formatBytes(t.bytes)}</span></Row>)}
            {!info.totals.length && <Row label="Files">No files yet</Row>}
            <Row label="Encryption at rest" hint="Uploaded files are encrypted with AES-256-GCM using the server key (data/keys/master.key)."><Badge tone={info.encrypted ? 'success' : 'warning'}>{info.encrypted ? 'On' : 'Off'}</Badge></Row>
            {info.disk && <Row label="Server disk" hint={`${formatBytes(info.disk.free)} free of ${formatBytes(info.disk.total)}`}><div style={{ width: 160 }}><ProgressBar tone="primary" value={(1 - info.disk.free / info.disk.total) * 100} /></div></Row>}
          </>}
        </div>
      </Card>
      <DeviceStorage cache={cache} est={est} setCache={setCache} />
    </>
  );
}

function DeviceStorage({ cache, est, setCache }: { cache: { bytes: number; files: number } | null; est: StorageEstimate | undefined; setCache: (c: { bytes: number; files: number }) => void }) {
  const prefs = usePrefs();
  return (
      <Card>
      <CardHead title="On this device" sub="Encrypted offline copy used when you have no connection" />
      <div className="card-body">
        <Row label="Browser storage used" hint={est?.quota ? `of ${formatBytes(est.quota)} available to this app` : undefined}><span className="num">{est?.usage !== undefined ? formatBytes(est.usage) : '—'}</span></Row>
        <Row label="Cached files" hint="Files you opened or marked “Available offline”."><span className="num">{cache ? `${plural(cache.files, 'file')} · ${formatBytes(cache.bytes)}` : '—'}</span></Row>
        <Row label="Offline file cache limit"><Select value={String(prefs.offlineCacheMb)} onChange={(e) => setPrefs({ offlineCacheMb: Number(e.target.value) })} style={{ width: 140 }}>{[50, 100, 250, 500, 1000, 2000].map((m) => <option key={m} value={m}>{m >= 1000 ? `${m / 1000} GB` : `${m} MB`}</option>)}</Select></Row>
        <Row label="Keep opened files for offline use"><Switch checked={prefs.cacheViewedFiles} onChange={(v) => setPrefs({ cacheViewedFiles: v })} /></Row>
        <div className="mt-12"><Button icon={<Trash2 />} onClick={async () => { if (await confirmDialog({ title: 'Clear cached files?', message: 'Files will download again when opened. Your prompts, notes and other data are kept.', confirmLabel: 'Clear' })) { await clearFileCache(); setCache(await cacheUsage()); toast.success('File cache cleared'); } }}>Clear cached files</Button></div>
      </div>
    </Card>
  );
}

// ---------------- Sync ----------------
interface Conflict { id: string; entity: EntityName; entity_id: string; fields: string[]; server_values: Record<string, any>; client_values: Record<string, any>; created_at: string; resolution: string | null; current: any }
function SyncSection() {
  useStoreVersion();
  const s = useSyncStatus();
  const server = useServerSettings();
  const online = useOnline();
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [open, setOpen] = useState<Conflict | null>(null);
  const load = () => api<Conflict[]>('/api/conflicts').then(setConflicts).catch(() => setConflicts(null));
  useEffect(() => { if (online) void load(); }, [online, s.conflicts]);
  const resolve = async (c: Conflict, choice: 'server' | 'client' | 'both') => {
    try { await api(`/api/conflicts/${c.id}/resolve`, { body: { choice } }); await store.sync(); toast.success(choice === 'server' ? 'Kept the server version' : choice === 'client' ? 'Kept this device’s version' : 'Kept both versions'); setOpen(null); void load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const byEntity = store.outbox.reduce<Record<string, number>>((m, o) => { m[ENTITIES[o.entity].label] = (m[ENTITIES[o.entity].label] ?? 0) + 1; return m; }, {});
  const uploads = [...store.pendingFiles.values()];
  const titleOf = (c: Conflict) => { const tf = ENTITIES[c.entity].titleField; return (tf && (c.current?.[tf] || c.client_values[tf])) || ENTITIES[c.entity].label; };
  return (
    <>
      <Card>
        <CardHead title="Synchronisation" actions={<Button size="sm" variant="primary" icon={<RefreshCw />} loading={s.syncing} disabled={!online} onClick={() => void store.sync().then(() => toast.success('Synced'))}>Sync now</Button>} />
        <div className="card-body">
          <Row label="Status">{s.authRequired ? <Badge tone="danger">Sign in required</Badge> : !online ? <Badge tone="warning">Offline</Badge> : s.syncing ? <Badge>Syncing…</Badge> : s.error ? <Badge tone="danger">{s.error}</Badge> : <Badge tone="success">Up to date</Badge>}</Row>
          <Row label="Last synced">{s.lastSyncAt ? `${formatDateTime(s.lastSyncAt)} (${timeAgo(s.lastSyncAt)})` : 'Never'}</Row>
          <Row label="Pending changes on this device" hint={Object.entries(byEntity).map(([k, v]) => `${v} ${k.toLowerCase()}${v === 1 ? '' : 's'}`).join(', ') || 'Everything has been sent to the server.'}><span className="num strong">{s.pending}</span></Row>
          <Row label="Automatic sync interval" hint="Also syncs when you reconnect, return to the app, or make a change. Background sync is used where the browser supports it.">
            <Select value={String(server.sync_interval_seconds)} onChange={async (e) => { const r = await patchServerSettings({ sync_interval_seconds: Number(e.target.value) }); store.setSyncInterval(r.sync_interval_seconds); toast.success('Saved'); }} style={{ width: 150 }}>{[10, 30, 60, 300, 900].map((n) => <option key={n} value={n}>{n < 60 ? `${n} seconds` : `${n / 60} minute${n === 60 ? '' : 's'}`}</option>)}</Select>
          </Row>
        </div>
      </Card>
      {uploads.length > 0 && (
        <Card>
          <CardHead title="File uploads" sub={`${uploads.length} waiting`} />
          <div className="list">{uploads.map((u) => (
            <div key={u.versionId} className="list-row"><Upload style={{ width: 18 }} /><div className="grow"><div className="truncate">{u.name}{u.target_file_id ? ' (new version)' : ''}</div><div className={`tiny ${u.status === 'error' ? 'danger-text' : 'muted'}`}>{u.status === 'uploading' ? `Uploading ${Math.round(u.progress * 100)}%` : u.status === 'error' ? u.error : 'Waiting for connection'} · {formatBytes(u.size)}</div></div>{u.status === 'error' && <IconButton size="sm" label="Retry" icon={<RotateCcw />} onClick={() => retryUpload(u.versionId)} />}<IconButton size="sm" label="Discard" icon={<X />} onClick={async () => { if (await confirmDialog({ title: 'Discard this upload?', message: u.name, danger: true, confirmLabel: 'Discard' })) await cancelUpload(u.versionId); }} /></div>
          ))}</div>
        </Card>
      )}
      <Card>
        <CardHead title={<span className="row gap-4"><GitMerge style={{ width: 16 }} />Conflicts</span>} sub="Created when the same item is edited on two devices before syncing. Nothing is overwritten silently." />
        {!online ? <p className="card-body small muted">Connect to review conflicts.</p> : !conflicts ? <div className="card-body"><Spinner /></div> : !conflicts.length ? <EmptyState icon={<Check />} title="No conflicts">All devices agree.</EmptyState> : (
          <div className="list">{conflicts.map((c) => (
            <div key={c.id} className="list-row"><AlertTriangle style={{ width: 18, color: 'var(--warning)' }} /><div className="grow"><div className="strong truncate">{titleOf(c)}</div><div className="meta">{ENTITIES[c.entity].label} · {c.resolution === 'pending:deleted' ? 'edited after it was deleted' : c.fields.join(', ')} · {timeAgo(c.created_at)}</div></div><Button size="sm" onClick={() => setOpen(c)}>Review</Button></div>
          ))}</div>
        )}
      </Card>
      <Modal open={!!open} onClose={() => setOpen(null)} size="xwide" title={open ? `Resolve conflict · ${titleOf(open)}` : ''}
        footer={open && <><Button onClick={() => resolve(open, 'server')}>Keep server version</Button>{['prompts', 'notes', 'templates', 'tasks', 'collections', 'projects'].includes(open.entity) && open.resolution !== 'pending:deleted' && <Button onClick={() => resolve(open, 'both')}>Keep both</Button>}<Button variant="primary" onClick={() => resolve(open, 'client')}>{open.resolution === 'pending:deleted' ? 'Restore with my changes' : 'Keep this device’s version'}</Button></>}>
        {open && (open.resolution === 'pending:deleted' ? <div className="alert warn"><AlertTriangle />This {ENTITIES[open.entity].label.toLowerCase()} was deleted on another device while you edited it here. Restore it with your changes, or keep it deleted.</div> :
          open.fields.map((f) => (
            <div key={f} className="col gap-8"><h3 style={{ textTransform: 'capitalize' }}>{f.replace('_', ' ')}</h3>
              <DiffView before={String(open.server_values[f] ?? '')} after={String(open.client_values[f] ?? '')} beforeLabel="Server version (currently saved)" afterLabel="This device’s version" />
            </div>
          )))}
      </Modal>
    </>
  );
}

// ---------------- Backup ----------------
interface BackupItem { name: string; size: number; created_at: string; encrypted: boolean; kind: string }
function exportAll() {
  const out: Record<string, unknown> = { app: 'prompt-manager', exported_at: new Date().toISOString(), schema: 1 };
  for (const e of ENTITY_NAMES) out[e] = store.all(e);
  saveBlob(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }), `prompt-manager-export-${new Date().toISOString().slice(0, 10)}.json`);
}

function BackupSection() {
  const online = useOnline();
  const [data, setData] = useState<{ backups: BackupItem[]; settings: { backup_schedule: string; backup_keep: number; backup_last_at: string; backup_last_status: string } } | null>(null);
  const [creating, setCreating] = useState(false);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState<{ name?: string; file?: File } | null>(null);
  const [rpass, setRpass] = useState('');
  const [rerr, setRerr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const load = () => api('/api/backups').then(setData).catch(() => {});
  useEffect(() => { if (online) void load(); }, [online]);
  const create = async () => {
    setBusy(true);
    try { const r = await api<{ name: string; size: number; files: number }>('/api/backups', { body: { passphrase: pass } }); toast.success(`Backup created (${formatBytes(r.size)}, ${plural(r.files, 'file')})`); setCreating(false); setPass(''); void load(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const doRestore = async () => {
    if (!restore) return;
    setBusy(true); setRerr(null);
    try {
      let r: { files: number; safetyBackup: string };
      if (restore.file && getTransferChunk()) { const up = await uploadParts(restore.file); r = await api('/api/backups/restore', { body: { ...up, passphrase: rpass } }); }
      else if (restore.file) { const f = new FormData(); f.append('passphrase', rpass); f.append('file', restore.file); r = await uploadForm('/api/backups/restore', f); }
      else r = await api('/api/backups/restore', { body: { name: restore.name, passphrase: rpass } });
      toast.success(`Restored (${plural(r.files, 'file')}). Previous state saved as ${r.safetyBackup}.`);
      setRestore(null); setRpass('');
      await store.resetCursor(); await store.sync(); void load();
    } catch (e) { setRerr((e as Error).message); } finally { setBusy(false); }
  };
  const status = data?.settings.backup_last_status || '';
  if (!online) return <Card><EmptyState icon={<CloudOff />} title="Backups need a connection">Backups run on the server. Reconnect to create or restore one.</EmptyState></Card>;
  return (
    <>
      <Card>
        <CardHead title="Backups" sub={data?.settings.backup_last_at ? `Last backup ${timeAgo(data.settings.backup_last_at)}${status.startsWith('error') ? ' — failed' : ''}` : 'No backups yet'} actions={<><Button size="sm" icon={<Upload />} onClick={() => fileInput.current?.click()}>Restore from file</Button><Button size="sm" variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>Create backup</Button></>} />
        <input ref={fileInput} type="file" hidden accept=".zip,.ppmbak" onChange={(e) => { const f = e.target.files?.[0]; if (f) setRestore({ file: f }); e.target.value = ''; }} />
        {status.startsWith('error') && <div className="card-body"><div className="alert err"><AlertTriangle />{status.slice(6)}</div></div>}
        {!data ? <div className="card-body"><Spinner /></div> : !data.backups.length ? <EmptyState icon={<Archive />} title="No backups yet">A backup contains the database and every file version, verified with checksums.</EmptyState> : (
          <div className="list">{data.backups.map((b) => (
            <div key={b.name} className="list-row">
              <Database style={{ width: 18, color: 'var(--text-3)' }} />
              <div className="grow"><div className="small truncate mono">{b.name}</div><div className="tiny muted">{formatDateTime(b.created_at)} · {formatBytes(b.size)} · {b.encrypted ? 'encrypted' : 'not encrypted'} · {b.kind}</div></div>
              <IconButton size="sm" label="Download" icon={<Download />} onClick={async () => { if (!getTransferChunk()) return downloadUrl(`/api/backups/${encodeURIComponent(b.name)}/download`); try { toast.info('Preparing download…'); saveBlob(await fetchBinary(`/api/backups/${encodeURIComponent(b.name)}/download`), b.name); } catch (e) { toast.error((e as Error).message); } }} />
              <IconButton size="sm" label="Restore" icon={<RotateCcw />} onClick={() => setRestore({ name: b.name })} />
              <IconButton size="sm" label="Delete" icon={<Trash2 />} onClick={async () => { if (await confirmDialog({ title: 'Delete backup?', message: b.name, danger: true, confirmLabel: 'Delete' })) { await api(`/api/backups/${encodeURIComponent(b.name)}`, { method: 'DELETE' }); void load(); } }} />
            </div>
          ))}</div>
        )}
      </Card>
      <Card>
        <CardHead title="Automatic backups" sub="Encrypted with the server key and kept on the server (and in your bucket in Private cloud mode)." />
        <div className="card-body">
          <Row label="Schedule"><Select value={data?.settings.backup_schedule ?? 'off'} onChange={async (e) => { await api('/api/backups/settings', { method: 'PATCH', body: { backup_schedule: e.target.value } }); void load(); toast.success('Saved'); }} style={{ width: 140 }}><option value="off">Off</option><option value="daily">Daily</option><option value="weekly">Weekly</option></Select></Row>
          <Row label="Keep the latest"><Select value={String(data?.settings.backup_keep ?? 7)} onChange={async (e) => { await api('/api/backups/settings', { method: 'PATCH', body: { backup_keep: Number(e.target.value) } }); void load(); }} style={{ width: 140 }}>{[3, 7, 14, 30].map((n) => <option key={n} value={n}>{n} backups</option>)}</Select></Row>
        </div>
      </Card>
      <Card>
        <CardHead title="Export" />
        <div className="card-body row row-wrap"><Button icon={<FileJson />} onClick={exportAll}>Export all data (JSON)</Button><span className="small muted">Projects, prompts, versions, templates, collections, tasks, notes and file metadata. Use a backup to include file contents.</span></div>
      </Card>
      <Modal open={creating} onClose={() => setCreating(false)} title="Create backup" footer={<><Button onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={create} disabled={!!pass && pass.length < 8}>Create backup</Button></>}>
        <Field label="Passphrase (recommended)" hint="Encrypts the backup so it can be stored anywhere and restored on any server. Leave blank to encrypt with this server's key instead." error={pass && pass.length < 8 ? 'Use at least 8 characters' : null}><PasswordInput value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" /></Field>
        <div className="alert warn"><AlertTriangle />Keep the passphrase safe — a protected backup cannot be restored without it.</div>
      </Modal>
      <Modal open={!!restore} onClose={() => setRestore(null)} title="Restore backup" footer={<><Button onClick={() => setRestore(null)}>Cancel</Button><Button variant="danger" loading={busy} onClick={doRestore}>Verify & restore</Button></>}>
        <p className="small">Restoring <b>{restore?.name ?? restore?.file?.name}</b> replaces all projects, prompts, files and settings with the backup's contents. Your password stays as it is.</p>
        <div className="alert info"><ShieldCheck />Every file is checked against its checksum first, and the current state is saved as a safety backup before anything changes.</div>
        {rerr && <div className="alert err"><AlertTriangle />{rerr}</div>}
        <Field label="Passphrase (if the backup is protected)"><PasswordInput value={rpass} onChange={(e) => setRpass(e.target.value)} autoComplete="off" /></Field>
      </Modal>
    </>
  );
}

// ---------------- Application ----------------
function AppSection() {
  const prefs = usePrefs();
  const s = useServerSettings();
  const save = async (p: Parameters<typeof patchServerSettings>[0]) => { try { await patchServerSettings(p); toast.success('Saved'); } catch (e) { toast.error((e as Error).message); } };
  return (
    <>
      <Card>
        <CardHead title="Appearance" sub="Saved on this device" />
        <div className="card-body">
          <Row label="Theme"><Segmented label="Theme" value={prefs.theme} onChange={(t) => setPrefs({ theme: t })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></Row>
          <Row label="Default project view"><Segmented label="Project view" value={prefs.projectView} onChange={(v) => setPrefs({ projectView: v })} options={[{ value: 'list', label: 'List' }, { value: 'grid', label: 'Cards' }]} /></Row>
        </div>
      </Card>
      <Card>
        <CardHead title="Files & processing" sub="Applies to every device" />
        <div className="card-body">
          <Row label="Maximum upload size" hint="Per file (1–1024 MB)."><Select value={String(s.upload_max_mb)} onChange={(e) => save({ upload_max_mb: Number(e.target.value) })} style={{ width: 140 }}>{[10, 25, 50, 100, 250, 500, 1024].map((n) => <option key={n} value={n}>{n >= 1024 ? '1 GB' : `${n} MB`}</option>)}</Select></Row>
          <Row label="OCR for scanned images" hint="Extract searchable text from uploaded images. Requires the optional tesseract.js package on the server (see the installation guide)."><Switch checked={s.ocr_enabled} onChange={(v) => save({ ocr_enabled: v })} /></Row>
          <Row label="Encrypt files at rest" hint="Applies to new uploads. Existing files keep their current protection."><Switch checked={s.encrypt_files} onChange={(v) => save({ encrypt_files: v })} /></Row>
          <Row label="Keep deleted items in trash for"><Select value={String(s.trash_retention_days)} onChange={(e) => save({ trash_retention_days: Number(e.target.value) })} style={{ width: 140 }}>{[7, 14, 30, 60, 90, 365].map((n) => <option key={n} value={n}>{n} days</option>)}</Select></Row>
        </div>
      </Card>
    </>
  );
}

// ---------------- Tags ----------------
function TagsSection() {
  useStoreVersion();
  const online = useOnline();
  const usage = new Map<string, number>();
  for (const e of ['projects', 'prompts', 'templates', 'files'] as const) for (const r of store.all(e)) for (const t of (r as { tags: string[] }).tags) usage.set(t, (usage.get(t) ?? 0) + 1);
  const records = store.all('tags');
  const names = [...new Set([...records.map((t) => t.name), ...usage.keys()])].sort((a, b) => a.localeCompare(b));
  const rename = async (from: string) => {
    const to = await promptDialog({ title: `Rename “${from}”`, label: 'New name (updates every project, prompt, template and file)', defaultValue: from, confirmLabel: 'Rename' });
    if (!to || to === from) return;
    try { await store.sync(); await api('/api/tags/rename', { body: { from, to } }); await store.sync(); toast.success('Tag renamed everywhere'); } catch (e) { toast.error((e as Error).message); }
  };
  const remove = async (name: string) => {
    if (!(await confirmDialog({ title: `Delete tag “${name}”?`, message: `It will be removed from ${plural(usage.get(name) ?? 0, 'item')}. The items themselves are kept.`, danger: true, confirmLabel: 'Delete tag' }))) return;
    let rec = records.find((t) => t.name === name);
    if (!rec) rec = store.create('tags', { name });
    store.remove('tags', rec.id);
    toast.success('Tag deleted');
  };
  return (
    <Card>
      <CardHead title="Tags" sub={`${plural(names.length, 'tag')}`} actions={<Button size="sm" variant="primary" icon={<Plus />} onClick={async () => { const n = await promptDialog({ title: 'New tag', label: 'Name', confirmLabel: 'Create' }); if (n) { if (names.includes(n)) toast.info('That tag already exists'); else store.create('tags', { name: n }); } }}>New tag</Button>} />
      {!names.length ? <EmptyState icon={<TagIcon />} title="No tags yet">Tags you add to projects, prompts, templates and files appear here.</EmptyState> : (
        <div className="list">{names.map((n) => (
          <div key={n} className="list-row"><span className="tag">{n}</span><span className="grow tiny muted">{plural(usage.get(n) ?? 0, 'item')}</span><Link to={`/projects?tag=${encodeURIComponent(n)}`} className="small hide-mobile">Projects</Link><IconButton size="sm" label="Rename" icon={<Pencil />} disabled={!online} onClick={() => rename(n)} /><IconButton size="sm" label="Delete" icon={<Trash2 />} onClick={() => remove(n)} /></div>
        ))}</div>
      )}
    </Card>
  );
}

// ---------------- Trash ----------------
function TrashSection() {
  const online = useOnline();
  const s = useServerSettings();
  const [items, setItems] = useState<{ entity: EntityName; id: string; title: string; batch: string; deleted_at: string; count: number; project_id: string | null }[] | null>(null);
  const load = async () => { await store.flush(); setItems(await api('/api/trash')); };
  useEffect(() => { if (online) void load().catch(() => setItems([])); }, [online]);
  if (!online) return <Card><EmptyState icon={<CloudOff />} title="Trash needs a connection">Deleted items are kept on the server for {s.trash_retention_days} days.</EmptyState></Card>;
  return (
    <Card>
      <CardHead title="Trash" sub={`Items are permanently deleted after ${s.trash_retention_days} days`} actions={items && items.length > 0 && <Button size="sm" variant="danger-ghost" icon={<Trash2 />} onClick={async () => { if (await confirmDialog({ title: 'Empty trash?', message: 'Everything in the trash, including file contents, will be permanently deleted. This cannot be undone.', danger: true, confirmLabel: 'Delete permanently' })) { await api('/api/trash/empty', { method: 'POST' }); await store.sync(); void load(); toast.success('Trash emptied'); } }}>Empty trash</Button>} />
      {!items ? <div className="card-body"><Spinner /></div> : !items.length ? <EmptyState icon={<Trash2 />} title="Trash is empty" /> : (
        <div className="list">{items.map((t) => (
          <div key={t.batch} className="list-row">
            <div className="grow"><div className="strong truncate">{t.title}</div><div className="meta">{ENTITIES[t.entity].label}{t.count > 1 ? ` + ${t.count - 1} related item${t.count === 2 ? '' : 's'}` : ''} · deleted {timeAgo(t.deleted_at)}</div></div>
            <Button size="sm" icon={<RotateCcw />} onClick={async () => { await api(`/api/trash/${t.batch}/restore`, { method: 'POST' }); await store.sync(); void load(); toast.success('Restored'); }}>Restore</Button>
            <IconButton size="sm" label="Delete permanently" icon={<X />} onClick={async () => { if (await confirmDialog({ title: 'Delete permanently?', message: `“${t.title}” cannot be recovered afterwards.`, danger: true, confirmLabel: 'Delete permanently' })) { await api(`/api/trash/${t.batch}/purge`, { method: 'POST' }); await store.sync(); void load(); } }} />
          </div>
        ))}</div>
      )}
    </Card>
  );
}

// ---------------- About ----------------
let deferredPrompt: any = null;
if (typeof window !== 'undefined') window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
function AboutSection() {
  const [about, setAbout] = useState<{ version: string; node: string } | null>(null);
  const [canInstall, setCanInstall] = useState(!!deferredPrompt);
  const sess = useSession();
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
  useEffect(() => { api('/api/about').then(setAbout).catch(() => {}); const h = () => setCanInstall(true); window.addEventListener('beforeinstallprompt', h); return () => window.removeEventListener('beforeinstallprompt', h); }, []);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return (
    <>
      <Card>
        <CardHead title="Install the app" />
        <div className="card-body col gap-12">
          {standalone ? <div className="alert ok"><Check />Running as an installed app.</div> : canInstall ? <div><Button variant="primary" icon={<Smartphone />} onClick={async () => { deferredPrompt?.prompt(); await deferredPrompt?.userChoice; deferredPrompt = null; setCanInstall(false); }}>Install Prompt Manager</Button></div>
            : ios ? <p className="small">On iPhone or iPad: tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>.</p> : <p className="small">Use your browser's menu → <b>Install app</b> (or <b>Add to Home screen</b>).</p>}
          <Button icon={<RefreshCw />} onClick={async () => { const r = await navigator.serviceWorker?.getRegistration(); await r?.update(); toast.info(r?.waiting ? 'An update is ready — reload to apply it.' : 'You have the latest version.'); }}>Check for updates</Button>
        </div>
      </Card>
      <Card>
        <CardHead title="About" />
        <div className="card-body">
          <Row label="Application">Prompt & Project Manager</Row>
          <Row label="Version">{about?.version ?? '1.0.0'}</Row>
          <Row label="Storage mode">{sess.storageMode.replace('_', '-')}</Row>
          <Row label="Account">{sess.username}</Row>
        </div>
      </Card>
    </>
  );
}

export { useNavigate };
