import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Ikki bosqichli kirish uchun vaqtga asoslangan bir martalik kod (RFC 6238, TOTP):
 * 30 soniyalik qadam, 6 raqam, HMAC-SHA1 — Google Authenticator va shu kabi ilovalar bilan mos.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Base32 qiymat noto‘g‘ri');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export const generateTotpSecret = () => base32Encode(randomBytes(20));

export function hotp(secret: string, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

export const totpStep = (timeMs: number) => Math.floor(timeMs / 1000 / STEP_SECONDS);

/**
 * Kodni tekshiradi (±1 qadam soat farqiga ruxsat). Mos kelgan qadam raqamini qaytaradi —
 * bir kodni ikki marta ishlatishning oldini olish uchun u saqlanadi.
 */
export function verifyTotp(secret: string, code: string, timeMs = Date.now(), window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = totpStep(timeMs);
  for (let delta = -window; delta <= window; delta += 1) {
    const expected = Buffer.from(hotp(secret, current + delta));
    if (timingSafeEqual(expected, Buffer.from(code))) return current + delta;
  }
  return null;
}

export function otpauthUrl(options: { issuer: string; account: string; secret: string }): string {
  const label = encodeURIComponent(`${options.issuer}:${options.account}`);
  const params = new URLSearchParams({
    secret: options.secret,
    issuer: options.issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
