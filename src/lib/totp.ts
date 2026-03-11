// TOTP Generator using Web Crypto API (no external dependencies)
// Compatible with Google Authenticator (SHA-1, 6 digits, 30s interval)

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Uint8Array {
  const cleaned = input.replace(/[\s=-]/g, "").toUpperCase();
  const bits: number[] = [];
  for (const char of cleaned) {
    const val = BASE32_CHARS.indexOf(char);
    if (val === -1) continue;
    for (let i = 4; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bits[i * 8 + j];
    }
    bytes[i] = byte;
  }
  return bytes;
}

export async function generateTOTP(
  base32Secret: string,
  interval = 30,
  digits = 6
): Promise<string> {
  const secret = base32Decode(base32Secret);
  const time = Math.floor(Date.now() / 1000 / interval);

  // Convert time to 8-byte big-endian buffer
  const timeBuffer = new ArrayBuffer(8);
  const view = new DataView(timeBuffer);
  view.setUint32(4, time, false);

  const key = await crypto.subtle.importKey(
    "raw",
    secret.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, timeBuffer);
  const hmac = new Uint8Array(signature);

  // Dynamic truncation
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = (code % Math.pow(10, digits)).toString().padStart(digits, "0");
  return otp;
}

export function getTimeRemaining(interval = 30): number {
  return interval - (Math.floor(Date.now() / 1000) % interval);
}

// LocalStorage helpers — per-account (keyed by email)
const STORAGE_PREFIX = "cocos_totp_secret_";
// Legacy key for migration
const LEGACY_KEY = "cocos_totp_secret";

function storageKey(email: string): string {
  return `${STORAGE_PREFIX}${email.toLowerCase().trim()}`;
}

export function saveTotpSecret(secret: string, email?: string): void {
  if (email) {
    localStorage.setItem(storageKey(email), secret);
  }
}

export function loadTotpSecret(email?: string): string | null {
  if (email) {
    return localStorage.getItem(storageKey(email));
  }
  return null;
}

export function clearTotpSecret(email?: string): void {
  if (email) {
    localStorage.removeItem(storageKey(email));
  }
}
