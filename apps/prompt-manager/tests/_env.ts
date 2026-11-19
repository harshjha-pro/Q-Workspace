import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppm-test-'));
process.env.PPM_DATA_DIR = dir;
process.env.PPM_NO_LISTEN = '1';
process.env.PPM_COOKIE_SECURE = 'false';
process.env.NODE_ENV = 'test';

// PPM_TEST_DATABASE_URL=mysql://... runs the same suite against MySQL/MariaDB (the database is emptied first).
// PPM_TEST_SERVERLESS=1 also exercises the serverless code paths (chunked transfers, database file storage).
if (process.env.PPM_TEST_DATABASE_URL) {
  process.env.PPM_DATABASE_URL = process.env.PPM_TEST_DATABASE_URL;
  const mysql = await import('mysql2/promise');
  const c = await mysql.createConnection(process.env.PPM_TEST_DATABASE_URL.split('?')[0]);
  const [rows] = await c.query(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()`);
  for (const r of rows as { t: string }[]) await c.query(`DROP TABLE \`${r.t}\``);
  await c.end();
}
if (process.env.PPM_TEST_SERVERLESS === '1') {
  process.env.PPM_SERVERLESS = '1';
  process.env.PPM_MASTER_KEY = '11'.repeat(32);
  process.env.PPM_TRANSFER_CHUNK = String(256 * 1024);
}
export const TEST_DIR = dir;
