import { PinflCrypto } from './pinfl-vault.js';

describe('PinflCrypto', () => {
  const crypto = new PinflCrypto(Buffer.alloc(32, 9));

  it('shifrlaydi va qayta ochadi, xesh barqaror va ochiq matnni ko‘rsatmaydi', () => {
    const sealed = crypto.seal('51503092620018');
    expect(sealed).not.toContain('51503092620018');
    expect(crypto.open(sealed)).toBe('51503092620018');
    expect(crypto.hash('51503092620018')).toBe(crypto.hash('51503092620018'));
    expect(crypto.hash('51503092620018')).not.toBe(crypto.hash('41207881234563'));
    expect(crypto.fields(null)).toEqual({ pinflEncrypted: null, pinflHash: null });
  });

  it('boshqa kalit bilan xesh boshqacha', () => {
    expect(new PinflCrypto(Buffer.alloc(32, 1)).hash('51503092620018')).not.toBe(crypto.hash('51503092620018'));
  });
});
