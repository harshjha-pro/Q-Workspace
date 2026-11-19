import './_env';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildApp } from '../server/index';
import { db, setSetting } from '../server/db';
import { hashPassword } from '../server/auth';

const uid = () => crypto.randomUUID();
const app = await buildApp();
setSetting('storage_mode', 'self_hosted'); // inject() uses 127.0.0.1 anyway

let cookie = '';
let csrf = '';
async function call(method: string, url: string, body?: unknown, extra: Record<string, string> = {}) {
  const r = await app.inject({ method: method as any, url, payload: body as any, headers: { cookie, 'x-ppm-csrf': csrf, ...extra } });
  const sc = r.headers['set-cookie'];
  if (sc) { const v = (Array.isArray(sc) ? sc : [sc]).find((c) => c.startsWith('ppm_sid=')); if (v) cookie = v.split(';')[0]; }
  let json: any = null; try { json = r.json(); } catch { /* binary */ }
  return { status: r.statusCode, json, raw: r };
}
function multipart(fields: Record<string, string>, file: { name: string; content: Buffer | string; type?: string }) {
  const boundary = '----ppm' + crypto.randomBytes(8).toString('hex');
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`));
  parts.push(Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content));
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
async function upload(url: string, fields: Record<string, string>, file: { name: string; content: Buffer | string }) {
  const m = multipart(fields, file);
  const r = await app.inject({ method: 'POST', url, payload: m.payload, headers: { ...m.headers, cookie, 'x-ppm-csrf': csrf } });
  return { status: r.statusCode, json: r.json() };
}
const push = (mutations: any[]) => call('POST', '/api/sync/push', { mutations: mutations.map((m) => ({ mid: uid(), ...m })) });

test('authentication: setup, rate limit, forced password change, csrf', async () => {
  db.prepare(`INSERT INTO users (id, username, password_hash, must_change_password, created_at, security_stamp) VALUES (?,?,?,1,?,?)`)
    .run(uid(), 'ayushporwal', await hashPassword('Temp-Passw0rd!'), new Date().toISOString(), uid());
  assert.equal((await call('GET', '/api/sync/pull')).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { username: 'ayushporwal', password: 'wrong' })).status, 401);
  // Brute force from another IP gets locked.
  for (let i = 0; i < 5; i++) await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'x', password: 'y' }, remoteAddress: '10.9.9.9' });
  const locked = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'x', password: 'y' }, remoteAddress: '10.9.9.9' });
  assert.equal(locked.statusCode, 429);

  const ok = await call('POST', '/api/auth/login', { username: 'AyushPorwal', password: 'Temp-Passw0rd!' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.mustChangePassword, true);
  assert.ok(!JSON.stringify(ok.json).includes('Temp-Passw0rd'));
  csrf = ok.json.csrf;
  assert.equal((await call('GET', '/api/sync/pull')).status, 403); // must change first
  assert.equal((await call('POST', '/api/auth/change-password', { current: 'Temp-Passw0rd!', next: 'short' })).status, 400);
  const noCsrf = await app.inject({ method: 'POST', url: '/api/auth/change-password', payload: { current: 'Temp-Passw0rd!', next: 'A-much-Better-pass-2026' }, headers: { cookie } });
  assert.equal(noCsrf.statusCode, 403);
  const changed = await call('POST', '/api/auth/change-password', { current: 'Temp-Passw0rd!', next: 'A-much-Better-pass-2026' });
  assert.equal(changed.status, 200);
  csrf = changed.json.csrf;
  assert.equal((await call('GET', '/api/sync/pull')).status, 200);
  const h = (db.prepare(`SELECT password_hash FROM users`).get() as any).password_hash;
  assert.match(h, /^\$argon2id\$/);
});

const projectId = uid(); const subId = uid(); const promptId = uid();

test('sync: create, version history, field-level conflicts, cascade delete & restore', async () => {
  let r = await push([
    { entity: 'projects', op: 'create', id: projectId, data: { name: 'Business Development', status: 'in_progress', tags: ['business'] } },
    { entity: 'projects', op: 'create', id: subId, data: { name: 'Market Research', parent_id: projectId } },
    { entity: 'prompts', op: 'create', id: promptId, data: { project_id: subId, title: 'Market Research', content: 'Research {company_name} in {industry}.', type: 'mandatory' } },
  ]);
  assert.deepEqual(r.json.results.map((x: any) => x.status), ['ok', 'ok', 'ok']);
  assert.deepEqual(r.json.results[2].row.variables.map((v: any) => v.name), ['company_name', 'industry']);
  // Nested subproject is rejected.
  r = await push([{ entity: 'projects', op: 'create', id: uid(), data: { name: 'x', parent_id: subId } }]);
  assert.equal(r.json.results[0].status, 'error');

  // Edit -> version 2.
  r = await push([{ entity: 'prompts', op: 'update', id: promptId, data: { content: 'Research {company_name} deeply.' }, base: { content: 'Research {company_name} in {industry}.' }, note: 'Tighter scope' }]);
  assert.equal(r.json.results[0].row.version_no, 2);
  // A second device edits from the stale base -> conflict, server value kept.
  r = await push([{ entity: 'prompts', op: 'update', id: promptId, data: { content: 'Offline edit', description: 'desc' }, base: { content: 'Research {company_name} in {industry}.', description: '' } }]);
  assert.equal(r.json.results[0].status, 'conflict');
  assert.equal(r.json.results[0].row.content, 'Research {company_name} deeply.');
  assert.equal(r.json.results[0].row.description, 'desc'); // non-conflicting field applied
  const conflicts = await call('GET', '/api/conflicts');
  assert.equal(conflicts.json.length, 1);
  await call('POST', `/api/conflicts/${conflicts.json[0].id}/resolve`, { choice: 'both' });
  const pull = await call('GET', '/api/sync/pull?since=0');
  assert.ok(pull.json.changes.prompts.some((p: any) => p.title.includes('conflicted copy')));
  assert.ok(pull.json.changes.prompt_versions.length >= 3);

  // Restore version 1.
  r = await call('POST', `/api/prompts/${promptId}/restore`, { version_no: 1 });
  assert.equal(r.json.prompt.content, 'Research {company_name} in {industry}.');

  // Idempotent replay.
  const mid = uid();
  const m = { mid, entity: 'tasks', op: 'create', id: uid(), data: { project_id: projectId, title: 'Review market data' } };
  await call('POST', '/api/sync/push', { mutations: [m] });
  const again = await call('POST', '/api/sync/push', { mutations: [m] });
  assert.equal(again.json.results[0].status, 'ok');
  assert.equal((db.prepare(`SELECT COUNT(*) n FROM tasks`).get() as any).n, 1);

  // Cascade delete and restore.
  await push([{ entity: 'projects', op: 'delete', id: projectId }]);
  assert.equal((db.prepare(`SELECT deleted FROM prompts WHERE id=?`).get(promptId) as any).deleted, 1);
  const trash = await call('GET', '/api/trash');
  const batch = trash.json.find((t: any) => t.id === projectId).batch;
  await call('POST', `/api/trash/${batch}/restore`);
  assert.equal((db.prepare(`SELECT deleted FROM prompts WHERE id=?`).get(promptId) as any).deleted, 0);
});

let fileId = '';
test('files: validation, encryption at rest, versions, extraction, search', async () => {
  const bad = await upload('/api/files/upload', { project_id: subId, category: 'reference' }, { name: 'fake.pdf', content: 'not a pdf' });
  assert.equal(bad.status, 415);
  const exe = await upload('/api/files/upload', { project_id: subId, category: 'reference' }, { name: 'x.exe', content: 'MZ' });
  assert.equal(exe.status, 415);
  const up = await upload('/api/files/upload', { project_id: subId, category: 'output', description: 'Plan' }, { name: 'Business Plan.md', content: '# Plan\nZanzibar logistics strategy for {company}.' });
  assert.equal(up.status, 200, JSON.stringify(up.json));
  fileId = up.json.file.id;
  assert.equal(up.json.version.label, '1.0');
  const v2 = await upload('/api/files/upload', { target_file_id: fileId, note: 'Updated financials' }, { name: 'Business Plan.md', content: '# Plan\nZanzibar logistics strategy, revised.' });
  assert.equal(v2.json.version.label, '1.1');
  const v3 = await upload('/api/files/upload', { target_file_id: fileId, bump: 'major' }, { name: 'Business Plan.md', content: '# Final' });
  assert.equal(v3.json.version.label, '2.0');
  // Stored bytes are encrypted.
  const key = (db.prepare(`SELECT storage_key FROM version_blobs WHERE version_id=?`).get(up.json.version.id) as any).storage_key;
  const fs = await import('node:fs');
  const { config } = await import('../server/config');
  const stored = fs.readFileSync(`${config.blobDir}/${key}`);
  assert.ok(stored.subarray(0, 8).toString() === 'PPMENC01' && !stored.toString().includes('Zanzibar'));
  // Old version still downloadable and intact.
  const dl = await call('GET', `/api/files/versions/${up.json.version.id}/download`);
  assert.equal(dl.raw.body, '# Plan\nZanzibar logistics strategy for {company}.');
  assert.match(String(dl.raw.headers['content-disposition']), /attachment/);
  await new Promise((r) => setTimeout(r, 400));
  const text = await call('GET', `/api/files/versions/${v2.json.version.id}/text`);
  assert.match(text.json.text, /revised/);
  const prev = await call('GET', `/api/files/versions/${up.json.version.id}/preview`);
  assert.equal(prev.json.preview.kind, 'markdown');
  // Search: latest version text is indexed (v3 has no Zanzibar), name/desc indexed.
  const s1 = await call('GET', '/api/search?q=business%20plan');
  assert.ok(s1.json.results.some((x: any) => x.kind === 'file'));
  const s2 = await call('GET', '/api/search?q=company_name&kinds=prompt');
  assert.ok(s2.json.results.length >= 1);
});

test('bulk import: preview, validation, duplicates, collections, error report', async () => {
  const csv = 'Prompt Title,Prompt Content,Prompt Type,Tags,Collection,Sequence\n' +
    '"Competitor Analysis","Analyze competitors in {industry}.\nLine two, with comma",Mandatory,"a,b",Business Research,2\n' +
    '"Industry Research","Study {industry}.",,,Business Research,1\n' +
    '"Market Research","Dup title",Optional,,,\n' +
    ',"No title",Optional,,,\n' +
    '"Bad type","x",Maybe,,,\n' +
    '"Bad seq","x",Optional,,Business Research,abc\n';
  const m = multipart({ destination: 'project', project_id: subId, default_type: 'optional' }, { name: 'prompts.csv', content: csv });
  const r = await app.inject({ method: 'POST', url: '/api/import/preview', payload: m.payload, headers: { ...m.headers, cookie, 'x-ppm-csrf': csrf } });
  const p = r.json();
  assert.equal(p.summary.total, 6);
  assert.equal(p.summary.valid, 2);
  assert.equal(p.summary.duplicates, 1);
  assert.equal(p.summary.errors, 3);
  assert.equal(p.rows[0].content, 'Analyze competitors in {industry}.\nLine two, with comma');
  assert.equal(p.rows[1].type, 'optional'); // default applied
  const c = await call('POST', '/api/import/commit', { previewId: p.previewId, decisions: { 4: 'rename' }, renames: { 4: 'Market Research (alt)' } });
  assert.equal(c.json.imported, 3);
  assert.equal(c.json.failed, 3);
  assert.equal(c.json.collections, 1);
  const steps = db.prepare(`SELECT p.title FROM collection_steps s JOIN prompts p ON p.id=s.prompt_id ORDER BY s.sort`).all() as any[];
  assert.deepEqual(steps.map((s) => s.title), ['Industry Research', 'Competitor Analysis']);
  const rep = await call('GET', `/api/import/${c.json.jobId}/error-report`);
  assert.match(rep.raw.body, /Invalid classification/);
  // Original never overwritten.
  assert.equal((db.prepare(`SELECT content FROM prompts WHERE id=?`).get(promptId) as any).content, 'Research {company_name} in {industry}.');
  // Templates download
  const t = await call('GET', '/api/import/template?kind=advanced&format=xlsx');
  assert.equal(t.status, 200);
  const json = await call('POST', '/api/import/preview', { destination: 'library', default_type: 'mandatory', paste: 'First\nBody one {x}\n---\nSecond\nBody two' });
  assert.equal(json.json.summary.valid, 2);
  assert.equal(json.json.rows[0].type, 'mandatory');
});

test('templates: insert creates an independent copy', async () => {
  const tid = uid();
  await push([{ entity: 'templates', op: 'create', id: tid, data: { title: 'SWOT', content: 'SWOT for {company_name}' } }]);
  const r = await call('POST', `/api/templates/${tid}/insert`, { project_id: projectId, fill: true, values: { company_name: 'Acme' } });
  assert.equal(r.json.prompt.content, 'SWOT for Acme');
  await push([{ entity: 'prompts', op: 'update', id: r.json.prompt.id, data: { content: 'Changed' } }]);
  assert.equal((db.prepare(`SELECT content FROM templates WHERE id=?`).get(tid) as any).content, 'SWOT for {company_name}');
});

test('duplicate project copies the hierarchy', async () => {
  const r = await call('POST', `/api/projects/${projectId}/duplicate`, {});
  const subs = db.prepare(`SELECT COUNT(*) n FROM projects WHERE parent_id=? AND deleted=0`).get(r.json.id) as any;
  assert.equal(subs.n, 1);
});

test('backup: encrypted create, wrong passphrase rejected, restore verifies and restores', async () => {
  const b = await call('POST', '/api/backups', { passphrase: 'correct horse battery' });
  assert.equal(b.status, 200, JSON.stringify(b.json));
  assert.ok(b.json.encrypted);
  await push([{ entity: 'projects', op: 'create', id: uid(), data: { name: 'After backup' } }]);
  const wrong = await call('POST', '/api/backups/restore', { name: b.json.name, passphrase: 'nope nope nope' });
  assert.equal(wrong.status, 400);
  const ok = await call('POST', '/api/backups/restore', { name: b.json.name, passphrase: 'correct horse battery' });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal((db.prepare(`SELECT COUNT(*) n FROM projects WHERE name='After backup'`).get() as any).n, 0);
  const versions = db.prepare(`SELECT id FROM file_versions WHERE file_id=? ORDER BY major, minor`).all(fileId) as any[];
  const dl = await call('GET', `/api/files/versions/${versions[0].id}/download`);
  assert.match(dl.raw.body, /Zanzibar/);
  // Still logged in with the current password after restore.
  assert.equal((await call('GET', '/api/sync/pull')).status, 200);
});
