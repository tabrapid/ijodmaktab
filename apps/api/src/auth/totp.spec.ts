import { base32Decode, base32Encode, hotp, verifyTotp } from './totp.js';

describe('TOTP (RFC 6238)', () => {
  // RFC 6238 test vektori: kalit "12345678901234567890", T=59s → 94287082 (8 raqam) → 6 raqam: 287082.
  const secret = base32Encode(Buffer.from('12345678901234567890'));

  it('base32 kodlash va ochish', () => {
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
  });

  it('RFC test vektori', () => {
    expect(hotp(secret, 1)).toBe('287082');
    expect(verifyTotp(secret, '287082', 59_000)).toBe(1);
  });

  it('noto‘g‘ri kodni rad etadi', () => {
    expect(verifyTotp(secret, '000000', 59_000)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', 59_000)).toBeNull();
  });
});
