import path from 'node:path';
import fs from 'node:fs';

function bool(v: string | undefined, d: boolean) {
  if (v === undefined || v === '') return d;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

const root = process.cwd();
const dataDir = path.resolve(process.env.PPM_DATA_DIR || path.join(root, 'data'));

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  host: process.env.PPM_HOST || '127.0.0.1',
  port: Number(process.env.PPM_PORT || 8787),
  basePath: (process.env.PPM_BASE_PATH || '/').replace(/\/?$/, '/'),
  dataDir,
  dbPath: path.join(dataDir, 'ppm.sqlite'),
  blobDir: path.join(dataDir, 'blobs'),
  backupDir: path.join(dataDir, 'backups'),
  tmpDir: path.join(dataDir, 'tmp'),
  keyFile: path.join(dataDir, 'keys', 'master.key'),
  clientDir: path.resolve(process.env.PPM_CLIENT_DIR || path.join(root, 'dist', 'client')),
  /** 'auto' = Secure when the request arrived over HTTPS (directly or via a trusted proxy). */
  cookieSecure: (process.env.PPM_COOKIE_SECURE || 'auto') as 'auto' | 'true' | 'false',
  trustProxy: bool(process.env.PPM_TRUST_PROXY, false),
  /** Comma-separated origins allowed to make state-changing requests (defaults to same-origin). */
  allowedOrigins: (process.env.PPM_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  s3: {
    endpoint: process.env.PPM_S3_ENDPOINT || '',
    region: process.env.PPM_S3_REGION || 'auto',
    bucket: process.env.PPM_S3_BUCKET || '',
    accessKeyId: process.env.PPM_S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.PPM_S3_SECRET_ACCESS_KEY || '',
    prefix: process.env.PPM_S3_PREFIX || 'prompt-manager/',
    forcePathStyle: bool(process.env.PPM_S3_FORCE_PATH_STYLE, true),
  },
  clamd: { host: process.env.PPM_CLAMD_HOST || '', port: Number(process.env.PPM_CLAMD_PORT || 3310) },
};

export const s3Configured = () => !!(config.s3.bucket && config.s3.accessKeyId && config.s3.secretAccessKey);

export function ensureDirs() {
  for (const d of [config.dataDir, config.blobDir, config.backupDir, config.tmpDir, path.dirname(config.keyFile)]) {
    fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  }
}
