import pino from "pino";
import fs from "node:fs";
import path from "node:path";

const g = globalThis as unknown as { __qepexLogger?: pino.Logger };

/**
 * Structured JSON log to LOG_DIR/app.log (read by the admin System Log page).
 * Never log decrypted values, passwords, TOTP secrets or credential fields.
 */
export function logger(): pino.Logger {
  if (!g.__qepexLogger) {
    const dir = process.env.LOG_DIR ?? "./logs";
    fs.mkdirSync(dir, { recursive: true });
    const dest = pino.destination({ dest: path.join(dir, "app.log"), sync: false, mkdir: true });
    g.__qepexLogger = pino(
      {
        level: process.env.LOG_LEVEL ?? "info",
        redact: { paths: ["password", "*.password", "totp", "*.totp", "secret", "*.secret", "token", "*.token"], censor: "[redacted]" },
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      process.env.NODE_ENV === "test" ? pino.destination("/dev/null") : dest,
    );
  }
  return g.__qepexLogger;
}
