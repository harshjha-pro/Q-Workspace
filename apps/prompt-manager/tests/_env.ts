import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppm-test-'));
process.env.PPM_DATA_DIR = dir;
process.env.PPM_NO_LISTEN = '1';
process.env.PPM_COOKIE_SECURE = 'false';
process.env.NODE_ENV = 'test';
export const TEST_DIR = dir;
