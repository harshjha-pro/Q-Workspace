/**
 * One-time owner account setup (and password recovery with --reset).
 *
 *   npm run setup                 interactive
 *   npm run setup -- --reset      reset the owner's password (forces change at next login)
 *   echo "pw" | npm run setup -- --password-stdin --username ayushporwal
 *   npm run setup -- --mode self_hosted      also choose the storage mode (local | self_hosted | cloud)
 *
 * The password is never stored in code or config; only its Argon2id hash is saved,
 * and the owner must choose a new password at first sign-in.
 */
import readline from 'node:readline';
import { Writable } from 'node:stream';
import crypto from 'node:crypto';
import { db, now, setSetting } from '../server/db';
import { hashPassword, passwordProblems } from '../server/auth';
import { getMasterKey } from '../server/storage';
import { config } from '../server/config';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

let muted = false;
const out = new Writable({ write(chunk, _e, cb) { if (!muted) process.stdout.write(chunk); cb(); } });
const rl = readline.createInterface({ input: process.stdin, output: out, terminal: process.stdin.isTTY });
const ask = (q: string, hidden = false) => new Promise<string>((res) => {
  process.stdout.write(q);
  muted = hidden;
  rl.question('', (a) => { muted = false; if (hidden) process.stdout.write('\n'); res(a); });
});

async function readStdin() { let s = ''; for await (const c of process.stdin) s += c; return s.replace(/\r?\n$/, ''); }

async function main() {
  getMasterKey(); // creates data/keys/master.key on first run
  const existing = db.prepare(`SELECT id, username FROM users`).get() as { id: string; username: string } | undefined;
  const reset = flag('--reset');
  if (existing && !reset) {
    console.log(`An owner account already exists ("${existing.username}"). Use "npm run setup -- --reset" to reset its password.`);
    process.exit(0);
  }
  if (!existing && reset) { console.log('No account exists yet; creating one.'); }
  console.log('\nPrompt & Project Manager — owner account setup');
  console.log(`Data directory: ${config.dataDir}\n`);

  let username = existing?.username ?? (opt('--username') || '');
  if (!username && !flag('--password-stdin')) username = (await ask('Username [ayushporwal]: ')).trim();
  username = (username || 'ayushporwal').toLowerCase();
  if (!/^[a-z0-9._-]{3,64}$/.test(username)) { console.error('Username may contain a–z, 0–9, dot, dash and underscore (3–64 chars).'); process.exit(1); }

  let pw: string;
  if (flag('--password-stdin')) pw = await readStdin();
  else {
    console.log('Choose a temporary password. You will be asked to change it at first sign-in.');
    for (;;) {
      pw = await ask('Temporary password: ', true);
      const problems = passwordProblems(pw, username);
      if (problems.length) { console.log('  ✗ ' + problems.join('\n  ✗ ')); continue; }
      const again = await ask('Repeat password: ', true);
      if (again !== pw) { console.log('  ✗ Passwords do not match.'); continue; }
      break;
    }
  }
  const problems = passwordProblems(pw, username);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  const mode = opt('--mode');
  if (mode) {
    if (!['local', 'self_hosted', 'cloud'].includes(mode)) { console.error('--mode must be local, self_hosted or cloud'); process.exit(1); }
    setSetting('storage_mode', mode as 'local');
    if (mode === 'cloud') setSetting('blob_driver', 's3');
    console.log(`Storage mode set to ${mode}.`);
  }
  const hash = await hashPassword(pw);
  if (existing) {
    db.prepare(`UPDATE users SET password_hash=?, must_change_password=1, security_stamp=? WHERE id=?`).run(hash, crypto.randomUUID(), existing.id);
    db.prepare(`DELETE FROM sessions`).run();
    db.prepare(`DELETE FROM login_attempts`).run();
    console.log(`\n✓ Password reset for "${existing.username}". All sessions were signed out.`);
  } else {
    db.prepare(`INSERT INTO users (id, username, password_hash, must_change_password, created_at, security_stamp) VALUES (?,?,?,1,?,?)`).run(crypto.randomUUID(), username, hash, now(), crypto.randomUUID());
    console.log(`\n✓ Owner account "${username}" created. Sign in and choose your permanent password.`);
  }
  console.log('  Keep data/keys/master.key safe: it encrypts your stored files.\n');
  rl.close();
  db.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
