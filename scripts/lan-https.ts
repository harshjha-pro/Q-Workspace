/**
 * HTTPS on the office network (Q-26, decisions D-40). Generates a self-signed certificate for this
 * computer's name and LAN addresses under ./certs (git-ignored), then serves the production build
 * over HTTPS. `--cert-only` just (re)creates the certificate, for `npm run dev:lan:https`.
 *
 * Phones and other PCs must trust certs/qepex-lan.crt once (README "HTTPS on the office network");
 * after that the browser shows a padlock and the offline work-entry app can install.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import { generate } from "selfsigned";

const CERT_DIR = path.resolve("certs");
const KEY = path.join(CERT_DIR, "qepex-lan.key");
const CRT = path.join(CERT_DIR, "qepex-lan.crt");
const META = path.join(CERT_DIR, "qepex-lan.json");

function lanNames() {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === "IPv4").map((i) => i.address);
  const host = os.hostname();
  return { dns: [...new Set(["localhost", host, `${host}.local`])].sort(), ips: [...new Set(["127.0.0.1", ...ips])].sort() };
}

export async function ensureCert() {
  const names = lanNames();
  const wanted = JSON.stringify(names);
  if (fs.existsSync(KEY) && fs.existsSync(CRT) && fs.existsSync(META)) {
    const meta = JSON.parse(fs.readFileSync(META, "utf8")) as { names: string; notAfter: string };
    const fresh = new Date(meta.notAfter).getTime() - Date.now() > 30 * 86_400_000;
    if (meta.names === wanted && fresh) return { names, created: false };
  }
  fs.mkdirSync(CERT_DIR, { recursive: true });
  const notAfter = new Date(Date.now() + 825 * 86_400_000); // the longest validity browsers accept
  const pems = await generate([{ name: "commonName", value: `QEPEX Work Tracker (${os.hostname()})` }, { name: "organizationName", value: "QEPEX India" }], {
    keySize: 2048,
    algorithm: "sha256",
    notAfterDate: notAfter,
    extensions: [
      // A CA flag lets phones install this one file as a trusted certificate.
      { name: "basicConstraints", cA: true, critical: true },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true, keyCertSign: true, critical: true },
      { name: "extKeyUsage", serverAuth: true },
      { name: "subjectAltName", altNames: [...names.dns.map((value) => ({ type: 2 as const, value })), ...names.ips.map((ip) => ({ type: 7 as const, ip }))] },
    ],
  });
  fs.writeFileSync(KEY, pems.private, { mode: 0o600 });
  fs.writeFileSync(CRT, pems.cert);
  fs.writeFileSync(META, JSON.stringify({ names: wanted, notAfter: notAfter.toISOString(), fingerprint: pems.fingerprint }, null, 2));
  return { names, created: true };
}

async function serve() {
  const port = Number(process.env.PORT ?? 3443);
  const { default: next } = await import("next");
  const app = next({ dev: false, hostname: "0.0.0.0", port });
  await app.prepare();
  const handle = app.getRequestHandler();
  https.createServer({ key: fs.readFileSync(KEY), cert: fs.readFileSync(CRT) }, (req, res) => void handle(req, res)).listen(port, "0.0.0.0", () => {
    const { ips } = lanNames();
    console.log(`QEPEX Work Tracker on HTTPS, port ${port}:`);
    for (const ip of ips.filter((i) => i !== "127.0.0.1")) console.log(`  https://${ip}:${port}`);
    console.log(`  https://localhost:${port}`);
  });
}

async function main() {
  const r = await ensureCert();
  console.log(r.created ? `• Created certs/qepex-lan.crt for ${[...r.names.dns, ...r.names.ips].join(", ")}` : "• Using existing certs/qepex-lan.crt");
  if (!process.argv.includes("--cert-only")) await serve();
}

void main();
