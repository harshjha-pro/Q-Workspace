// Test environment: isolated SQLite file, fixed throwaway keys, fast bcrypt.
process.env.DATABASE_URL = "file:./tests/.tmp/test.db";
process.env.STORAGE_DIR = "./tests/.tmp/storage";
process.env.BACKUP_DIR = "./tests/.tmp/backups";
process.env.LOG_DIR = "./tests/.tmp/logs";
process.env.VAULT_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.PII_KEY = Buffer.alloc(32, 9).toString("base64");
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret";
process.env.BCRYPT_COST = "4";
process.env.DEMO_MODE = "true";
process.env.BACKUP_KEY = Buffer.alloc(32, 5).toString("base64");
