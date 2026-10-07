import { generateSecret, generateURI, verify, generate } from "otplib";
import QRCode from "qrcode";

/** TOTP is verified locally; the QR code is rendered locally as a data URL (no external service). */
export const newTotpSecret = () => generateSecret();

export function totpUri(secret: string, label: string, issuer = "QEPEX Work Tracker") {
  return generateURI({ issuer, label, secret });
}

export async function totpQrDataUrl(secret: string, label: string, issuer?: string) {
  return QRCode.toDataURL(totpUri(secret, label, issuer), { margin: 1, width: 220 });
}

/** Accepts the current code and one 30-second step either side (clock drift on phones). */
export async function verifyTotp(secret: string, token: string): Promise<boolean> {
  const clean = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  try {
    const result = await verify({ secret, token: clean, epochTolerance: 30 });
    return result.valid;
  } catch {
    return false;
  }
}

/** Test helper: the current code for a secret. */
export const currentTotp = (secret: string) => generate({ secret });
