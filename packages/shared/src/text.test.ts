import { describe, expect, it } from 'vitest';
import { loginFromName, transliterate } from './text.js';

describe('login yaratish', () => {
  it('lotin va kirill ismlardan login yasaydi', () => {
    expect(loginFromName('Zebo', 'O‘rinboyeva')).toBe('zebo.orinboyeva');
    expect(loginFromName('Otabek', "G'ulomov")).toBe('otabek.gulomov');
    expect(loginFromName('Шахзода', 'Назарова')).toBe('shaxzoda.nazarova');
    expect(transliterate('Ўктам Қодиров')).toBe("O'ktam Qodirov");
  });
});
