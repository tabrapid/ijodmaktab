import { describe, expect, it } from 'vitest';
import { checkPinfl, maskPinfl, normalizeUzbekName, pinflBirthDate, pinflChecksumValid } from './identity.js';
import { studentRegistrationSchema, teacherCredentialSchema, teacherProfileSchema } from './schemas.js';
import { certificateMatchesSpecialty, mentorshipKindOf, subjectNamesMatch } from './teacher.js';

describe('normalizeUzbekName', () => {
  it('hujjatdagi katta harflar va apostroflarni yagona ko‘rinishga keltiradi', () => {
    expect(normalizeUzbekName('  ABDUGANIYEV ')).toBe('Abduganiyev');
    expect(normalizeUzbekName("g'ulomova")).toBe('G‘ulomova');
    expect(normalizeUzbekName('O`KTAMOV')).toBe('O‘ktamov');
    expect(normalizeUzbekName("BAXTIYOR O'G'LI")).toBe('Baxtiyor o‘g‘li');
    expect(normalizeUzbekName("ma'ruf")).toBe('Ma’ruf');
    expect(normalizeUzbekName('ali - valiyev')).toBe('Ali-Valiyev');
  });
});

describe('JSHSHIR', () => {
  it('tug‘ilgan sanani va nazorat raqamini tekshiradi', () => {
    expect(pinflBirthDate('51503092620018')).toBe('2009-03-15');
    expect(pinflChecksumValid('51503092620018')).toBe(true);
    expect(pinflChecksumValid('51503092620017')).toBe(false);
    expect(checkPinfl('51503092620018', '2009-03-15')).toEqual({ ok: true });
    expect(checkPinfl('51503092620018', '2009-03-16').ok).toBe(false);
    expect(checkPinfl('1234').ok).toBe(false);
    // 31-fevral — haqiqiy sana emas.
    expect(pinflBirthDate('53102090000000')).toBeNull();
    // Asr belgisi 7 bo‘lmaydi.
    expect(pinflBirthDate('71503092620018')).toBeNull();
    expect(maskPinfl('51503092620018')).toBe('5**********018');
  });
});

describe('studentRegistrationSchema', () => {
  const valid = {
    lastName: 'ABDUGANIYEV',
    firstName: 'jaloliddin',
    middleName: "Baxtiyor o'g'li",
    birthDate: '2009-03-15',
    pinfl: '5150 3092 6200 18',
    classId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
    login: 'Jaloliddin.A',
    password: 'Parol2026',
    confirmPassword: 'Parol2026',
  };

  it('to‘g‘ri ma’lumotlarni normallashtirib qabul qiladi', () => {
    const parsed = studentRegistrationSchema.parse(valid);
    expect(parsed.lastName).toBe('Abduganiyev');
    expect(parsed.middleName).toBe('Baxtiyor o‘g‘li');
    expect(parsed.pinfl).toBe('51503092620018');
    expect(parsed.login).toBe('jaloliddin.a');
  });

  it('JSHSHIR bo‘sh qoldirilishi mumkin, kirill harflari va mos kelmaydigan JSHSHIR rad etiladi', () => {
    expect(studentRegistrationSchema.parse({ ...valid, pinfl: '' }).pinfl).toBeNull();
    const cyrillic = studentRegistrationSchema.safeParse({ ...valid, lastName: 'Абдуганиев' });
    expect(cyrillic.success).toBe(false);
    const mismatch = studentRegistrationSchema.safeParse({ ...valid, birthDate: '2009-03-16' });
    expect(mismatch.error?.issues.map((issue) => issue.path.join('.'))).toContain('pinfl');
    const passwords = studentRegistrationSchema.safeParse({ ...valid, confirmPassword: 'Boshqa2026' });
    expect(passwords.error?.issues.map((issue) => issue.path.join('.'))).toContain('confirmPassword');
  });
});

describe('o‘qituvchi ma’lumotnomasi', () => {
  it('toifa tanlansa hujjat majburiy', () => {
    expect(teacherProfileSchema.safeParse({ category: 'FIRST' }).success).toBe(false);
    expect(
      teacherProfileSchema.safeParse({ category: 'FIRST', categoryFileId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' })
        .success,
    ).toBe(true);
  });

  it('sertifikatlarda fayl majburiy, kurs va tanlovlarda ixtiyoriy', () => {
    const national = teacherCredentialSchema.safeParse({
      kind: 'SPECIALTY_NATIONAL',
      title: 'Milliy sertifikat',
      subjectId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
      level: 'A+',
    });
    expect(national.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['fileId']);
    expect(teacherCredentialSchema.safeParse({ kind: 'CONTEST', title: 'Yil o‘qituvchisi' }).success).toBe(true);
    const international = teacherCredentialSchema.safeParse({
      kind: 'SPECIALTY_INTERNATIONAL',
      title: 'IELTS',
      fileId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
    });
    expect(international.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['certificateType']);
  });

  it('o‘quvchi sertifikati o‘qituvchi mutaxassisligiga mosligi', () => {
    expect(mentorshipKindOf('NATIONAL_CERTIFICATE')).toBe('NATIONAL');
    expect(mentorshipKindOf('IELTS')).toBe('INTERNATIONAL');
    expect(mentorshipKindOf('OLYMPIAD')).toBeNull();
    expect(subjectNamesMatch('Ona tili va adabiyot', 'Ona tili')).toBe(true);
    expect(certificateMatchesSpecialty('NATIONAL_CERTIFICATE', { subject: 'Matematika' }, 'matematika')).toBe(true);
    expect(certificateMatchesSpecialty('NATIONAL_CERTIFICATE', { subject: 'Fizika' }, 'Matematika')).toBe(false);
    expect(certificateMatchesSpecialty('SAT', { total: 1450 }, 'Matematika')).toBe(true);
    expect(certificateMatchesSpecialty('CEFR', { language: 'Nemis tili', level: 'B2' }, 'Ingliz tili')).toBe(false);
  });
});
