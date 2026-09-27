import { SHARE_PERMISSION_LABELS } from '@ijod/shared';
import { hasRole, useMe } from '@/lib/auth';
import { useMySubjects } from '@/lib/teaching';
import type { Me, Ref, TestListItem } from '@/lib/types';

type Viewer = Pick<Me, 'roles'> | null | undefined;

/** Faqat rahbariyat (o‘qituvchi roli yo‘q) — sessiya sahifalari /management ostida. */
export const isDeputyOnly = (me: Viewer) => hasRole(me, 'DEPUTY', 'SUPER_ADMIN') && !hasRole(me, 'TEACHER');

/** Sessiya sahifasi: o‘qituvchi — /teacher/sessions, faqat rahbariyat — /management/sessions. */
export const sessionPageHref = (me: Viewer, id: string) =>
  isDeputyOnly(me) ? `/management/sessions/${id}` : `/teacher/sessions/${id}`;

export const sessionsHomeHref = (me: Viewer) => (isDeputyOnly(me) ? '/management/sessions' : '/teacher/sessions');

export const newSessionHref = (testId?: string) =>
  testId ? `/teacher/sessions/new?testId=${encodeURIComponent(testId)}` : '/teacher/sessions/new';

/** Huquq yorlig‘i: “Siz”, “Maktab banki” yoki ulashish turi. */
export function permissionLabel(permission: TestListItem['permission']) {
  if (permission === 'OWNER') return 'Siz';
  if (permission === 'SCHOOL') return 'Maktab banki';
  return SHARE_PERMISSION_LABELS[permission];
}

/** Sessiya yaratib bo‘lmasligi sababi (yoki null — mumkin). */
export function conductBlockReason(
  test: Pick<TestListItem, 'status' | 'permission' | 'canConduct' | 'publishedVersionNo' | 'questionCount'>,
): string | null {
  if (test.status === 'ARCHIVED') return 'Test arxivlangan.';
  if (test.permission === 'VIEW') {
    return 'Sizda bu testni faqat ko‘rish huquqi bor — muallifdan nusxa olish huquqini so‘rang.';
  }
  if (!test.canConduct) {
    return test.publishedVersionNo === null
      ? 'Testning tayyor (muzlatilgan) versiyasi yo‘q — muallif hali uni bankka chiqarmagan yoki sessiyada ishlatmagan.'
      : 'Bu test bilan sessiya yaratish huquqingiz yo‘q.';
  }
  if (test.questionCount === 0) return 'Testda hali savol yo‘q.';
  return null;
}

/**
 * O‘qituvchi dars beradigan fanlar identifikatorlari. Rahbariyat uchun (yoki ma’lumot hali
 * yuklanmagan bo‘lsa) null — fan bo‘yicha cheklov yo‘q.
 */
export function useTaughtSubjects(): Set<string> | null {
  const { data: me } = useMe();
  const subjects = useMySubjects();
  if (hasRole(me, 'DEPUTY', 'SUPER_ADMIN') || !subjects.data) return null;
  return new Set(subjects.data.map((subject) => subject.id));
}

/** O‘qituvchi test faniga dars bermasa — sababi (sinflariga o‘tkaza olmaydi), aks holda null. */
export function subjectBlockReason(test: { subject: Ref }, taught: Set<string> | null): string | null {
  if (!taught || taught.has(test.subject.id)) return null;
  return `Siz “${test.subject.name}” fanidan dars bermaysiz — bu testni sinflaringizga o‘tkaza olmaysiz.`;
}
