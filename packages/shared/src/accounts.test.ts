import { describe, expect, it } from 'vitest';
import { ADMIN_GRANTABLE_ROLES, DEPUTY_MANAGED_ROLES, ROLES, canManageRoles, grantableRolesFor } from './enums.js';

describe('hisob boshqaruvi rollari', () => {
  it('har bir rol bera oladigan rollar', () => {
    expect(grantableRolesFor(['SUPER_ADMIN'])).toEqual(ROLES);
    expect(grantableRolesFor(['ADMIN'])).toEqual(ADMIN_GRANTABLE_ROLES);
    expect(grantableRolesFor(['DEPUTY'])).toEqual(DEPUTY_MANAGED_ROLES);
    expect(grantableRolesFor(['TEACHER'])).toEqual([]);
    expect(grantableRolesFor(['STUDENT'])).toEqual([]);
    expect(grantableRolesFor([])).toEqual([]);
  });

  it('bir nechta rolda eng keng vakolat olinadi', () => {
    expect(grantableRolesFor(['TEACHER', 'DEPUTY'])).toEqual(DEPUTY_MANAGED_ROLES);
    expect(grantableRolesFor(['DEPUTY', 'ADMIN'])).toEqual(ADMIN_GRANTABLE_ROLES);
  });

  it('direktor o‘rinbosari faqat o‘qituvchi va o‘quvchi hisoblarini boshqaradi', () => {
    expect(canManageRoles(['DEPUTY'], ['TEACHER'])).toBe(true);
    expect(canManageRoles(['DEPUTY'], ['STUDENT'])).toBe(true);
    expect(canManageRoles(['DEPUTY'], ['DEPUTY'])).toBe(false);
    // O‘qituvchi va rahbariyat rolidagi hisob o‘rinbosarga bo‘ysunmaydi.
    expect(canManageRoles(['DEPUTY'], ['TEACHER', 'DEPUTY'])).toBe(false);
    expect(canManageRoles(['DEPUTY'], ['ADMIN'])).toBe(false);
    expect(canManageRoles(['DEPUTY'], ['SUPER_ADMIN'])).toBe(false);
  });

  it('administrator va super admin', () => {
    expect(canManageRoles(['ADMIN'], ['TEACHER', 'DEPUTY'])).toBe(true);
    expect(canManageRoles(['ADMIN'], ['ADMIN'])).toBe(false);
    expect(canManageRoles(['SUPER_ADMIN'], ['ADMIN'])).toBe(true);
    expect(canManageRoles(['SUPER_ADMIN'], ['SUPER_ADMIN'])).toBe(true);
  });

  it('boshqaruv huquqi yo‘q foydalanuvchi hech kimni boshqarmaydi', () => {
    expect(canManageRoles(['TEACHER'], ['STUDENT'])).toBe(false);
    expect(canManageRoles(['STUDENT'], [])).toBe(false);
  });
});
