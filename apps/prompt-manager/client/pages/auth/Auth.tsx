import { useMemo, useState, type ReactNode } from 'react';
import { Layers3, Lock, User, AlertCircle, ShieldCheck, WifiOff, Info } from 'lucide-react';
import { Button, Field, Input, PasswordInput } from '../../components/ui';
import { login, changePassword, unlock, useSession, getPendingPassword, discardLocalChangesAndContinue, logout } from '../../lib/session';
import { ApiError } from '../../lib/api';

function AuthCard({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="auth-page">
      <main className="auth-card">
        <span className="brand-mark"><Layers3 /></span>
        <h1>{title}</h1>
        <p className="sub">{sub}</p>
        {children}
        <div className="auth-foot"><Lock />Secure · Private · Offline ready</div>
      </main>
    </div>
  );
}

export function Login() {
  const sess = useSession();
  const [username, setUsername] = useState(sess.username || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!username.trim() || !password) { setError('Enter your username and password.'); return; }
    setBusy(true); setError(null);
    try { await login(username.trim(), password); }
    catch (e) { setError(e instanceof ApiError && e.status === 0 ? 'Cannot reach the server. Check your connection.' : (e as Error).message); setPassword(''); }
    finally { setBusy(false); }
  };
  return (
    <AuthCard title="Prompt & Project Manager" sub="Organize. Manage. Create.">
      {sess.message && !error && <div className="alert info"><Info />{sess.message}</div>}
      {error && <div className="alert err" role="alert"><AlertCircle />{error}</div>}
      <form className="col gap-16" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="Username" htmlFor="u">
          <div className="input-wrap"><User /><Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus={!username} /></div>
        </Field>
        <Field label="Password" htmlFor="p">
          <PasswordInput id="p" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus={!!username} />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={busy}>Sign in</Button>
      </form>
    </AuthCard>
  );
}

export function scorePassword(pw: string) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if ([/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length >= 3) s++;
  if (pw.length >= 18 || (pw.length >= 12 && /[^A-Za-z0-9]/.test(pw) && /\d/.test(pw))) s++;
  return Math.min(4, s);
}
const LABEL = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

export function PasswordFields({ next, setNext, confirm, setConfirm, username }: { next: string; setNext: (v: string) => void; confirm: string; setConfirm: (v: string) => void; username: string }) {
  const score = useMemo(() => scorePassword(next), [next]);
  const issues: string[] = [];
  if (next && next.length < 10) issues.push('at least 10 characters');
  if (next && username && next.toLowerCase().includes(username.toLowerCase())) issues.push('must not contain your username');
  return (
    <>
      <Field label="New password" htmlFor="np" hint={next ? `${LABEL[score]}${issues.length ? ` — ${issues.join(', ')}` : ''}` : 'At least 10 characters, mixing letters, numbers and symbols (or 16+ characters).'}>
        <PasswordInput id="np" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        <div className={`strength s${next ? score : 0}`} aria-hidden><i /><i /><i /><i /></div>
      </Field>
      <Field label="Confirm new password" htmlFor="cp" error={confirm && confirm !== next ? 'Passwords do not match.' : null}>
        <PasswordInput id="cp" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </Field>
    </>
  );
}

export function ChangePasswordScreen() {
  const sess = useSession();
  const pending = getPendingPassword();
  const [current, setCurrent] = useState(pending ?? '');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (next !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError(null);
    try { await changePassword(current, next); }
    catch (e) { setError((e as ApiError).data?.problems?.join(' ') || (e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <AuthCard title="Choose your password" sub="For security, set a new password before you continue.">
      <div className="alert info"><ShieldCheck />Your password is hashed with Argon2id and never stored in plain text. It also protects the offline copy on this device.</div>
      {error && <div className="alert err" role="alert"><AlertCircle />{error}</div>}
      <form className="col gap-16" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <input type="text" autoComplete="username" value={sess.username} readOnly hidden />
        {!pending && <Field label="Current password" htmlFor="cur"><PasswordInput id="cur" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus /></Field>}
        <PasswordFields next={next} setNext={setNext} confirm={confirm} setConfirm={setConfirm} username={sess.username} />
        <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!current || !next || next !== confirm}>Save password and continue</Button>
        <Button variant="ghost" onClick={() => void logout(false)}>Cancel and sign out</Button>
      </form>
    </AuthCard>
  );
}

export function UnlockScreen() {
  const sess = useSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError(null);
    try { await unlock(password); }
    catch (e) { setError((e as Error).message); setPassword(''); }
    finally { setBusy(false); }
  };
  if (sess.needOldPassword) {
    return (
      <AuthCard title="Previous password needed" sub="Your password was changed on another device.">
        <div className="alert warn"><AlertCircle />This device has offline changes that have not synced yet. Enter your previous password to keep them, or discard them.</div>
        {error && <div className="alert err" role="alert"><AlertCircle />{error}</div>}
        <form className="col gap-16" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Field label="Previous password"><PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></Field>
          <Button type="submit" variant="primary" size="lg" block loading={busy}>Keep my offline changes</Button>
          <Button variant="danger-ghost" onClick={() => void discardLocalChangesAndContinue()}>Discard offline changes</Button>
        </form>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={`Welcome back${sess.username ? `, ${sess.username}` : ''}`} sub={sess.offline ? 'Offline — unlock your saved workspace' : 'Enter your password to unlock'}>
      {sess.offline && <div className="alert warn"><WifiOff />You are offline. Your saved workspace will open from this device and sync when you reconnect.</div>}
      {sess.message && <div className="alert info"><Lock />{sess.message}</div>}
      {error && <div className="alert err" role="alert"><AlertCircle />{error}</div>}
      <form className="col gap-16" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <input type="text" autoComplete="username" value={sess.username} readOnly hidden />
        <Field label="Password" htmlFor="up"><PasswordInput id="up" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus /></Field>
        <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!password}>Unlock</Button>
        <Button variant="ghost" onClick={() => void logout(false)}>Sign in as a different session</Button>
      </form>
    </AuthCard>
  );
}
