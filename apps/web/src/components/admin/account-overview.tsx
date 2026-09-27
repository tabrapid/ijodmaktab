import { AlertTriangle, BookOpen, GraduationCap, KeyRound, Lock, School, UserX } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ROLES, USER_STATUSES, USER_STATUS_LABELS, type Role } from '@ijod/shared';
import { Alert } from '@/components/ui/feedback';
import { Stat } from '@/components/ui/stat';
import type { AdminDashboard } from '@/lib/types';
import { ROLE_PLURAL_LABELS } from './labels';

/** Butun karta bosiladigan ko‘rsatkich. */
export function StatLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      {children}
    </Link>
  );
}

/** Rollar va holatlar bo‘yicha hisoblar soni. */
export function AccountStats({ data, showSuperAdmins }: { data: AdminDashboard; showSuperAdmins: boolean }) {
  const roles: Role[] = ROLES.filter((role) => showSuperAdmins || role !== 'SUPER_ADMIN');
  return (
    <div className="space-y-3">
      <div
        className={showSuperAdmins ? 'grid grid-cols-2 gap-3 lg:grid-cols-5' : 'grid grid-cols-2 gap-3 lg:grid-cols-4'}
      >
        {roles.map((role) => (
          <StatLink key={role} href={`/admin/users?role=${role}`}>
            <Stat label={ROLE_PLURAL_LABELS[role]} value={data.users.byRole[role]} hint="faol hisoblar" />
          </StatLink>
        ))}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
        <span className="font-medium text-slate-700">Holat bo‘yicha (barcha hisoblar):</span>
        {USER_STATUSES.map((status) => (
          <Link key={status} href={`/admin/users?status=${status}`} className="hover:text-brand-700 hover:underline">
            {USER_STATUS_LABELS[status]}:{' '}
            <span className="font-semibold text-slate-800 tabular">{data.users.byStatus[status] ?? 0}</span>
          </Link>
        ))}
      </p>
    </div>
  );
}

/** Hisoblar va tuzilmadagi e’tibor talab qiladigan holatlar ko‘rsatkichlari. */
export function HealthStats({ data }: { data: AdminDashboard }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <StatLink href="/admin/users">
        <Stat
          label="Bloklangan hisoblar"
          value={data.users.locked}
          tone={data.users.locked ? 'danger' : 'default'}
          icon={<Lock className="size-4" aria-hidden />}
          hint="noto‘g‘ri parol sababli"
        />
      </StatLink>
      <StatLink href="/admin/users?sort=createdAt&order=desc">
        <Stat
          label="Parolni almashtirmaganlar"
          value={data.users.mustChangePassword}
          tone={data.users.mustChangePassword ? 'warning' : 'default'}
          icon={<KeyRound className="size-4" aria-hidden />}
          hint="vaqtinchalik parol bilan"
        />
      </StatLink>
      <StatLink href="/admin/users?role=STUDENT&sort=createdAt&order=desc">
        <Stat
          label="Sinfsiz o‘quvchilar"
          value={data.studentsWithoutClass}
          tone={data.studentsWithoutClass ? 'warning' : 'default'}
          icon={<UserX className="size-4" aria-hidden />}
          hint="joriy o‘quv yilida"
        />
      </StatLink>
      <StatLink href="/admin/structure?tab=classes">
        <Stat
          label="Sinf rahbarisiz sinflar"
          value={data.classesWithoutHomeroom}
          tone={data.classesWithoutHomeroom ? 'warning' : 'default'}
          icon={<GraduationCap className="size-4" aria-hidden />}
        />
      </StatLink>
      <StatLink href="/admin/structure?tab=classes">
        <Stat
          label="Sinflar"
          value={data.classes}
          icon={<School className="size-4" aria-hidden />}
          hint="joriy o‘quv yili, faol"
        />
      </StatLink>
      <StatLink href="/admin/structure?tab=subjects">
        <Stat
          label="Fanlar"
          value={data.subjects}
          icon={<BookOpen className="size-4" aria-hidden />}
          hint="faol fanlar"
        />
      </StatLink>
    </div>
  );
}

function AlertLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="shrink-0 self-center text-sm font-medium whitespace-nowrap underline">
      {children}
    </Link>
  );
}

/** Nolga teng bo‘lmagan muammolar uchun ogohlantirishlar (havolalar bilan). */
export function AttentionAlerts({ data }: { data: AdminDashboard }) {
  const alerts: ReactNode[] = [];
  if (!data.academicYear) {
    alerts.push(
      <Alert
        key="year"
        tone="warning"
        title="Joriy o‘quv yili belgilanmagan"
        action={<AlertLink href="/admin/structure?tab=years">Belgilash</AlertLink>}
      >
        Sinf yaratish, import va biriktirishlar joriy o‘quv yili bo‘yicha ishlaydi.
      </Alert>,
    );
  }
  if (data.users.locked > 0) {
    alerts.push(
      <Alert
        key="locked"
        tone="danger"
        title={`${data.users.locked} ta hisob vaqtincha bloklangan`}
        action={<AlertLink href="/admin/users?flag=locked">Ko‘rish</AlertLink>}
      >
        Ko‘p marta noto‘g‘ri parol kiritilgan. Blok muddat tugagach o‘zi ochiladi yoki foydalanuvchi sahifasida “Blokdan
        chiqarish” mumkin.
      </Alert>,
    );
  }
  if (data.studentsWithoutClass > 0) {
    alerts.push(
      <Alert
        key="students"
        tone="warning"
        title={`${data.studentsWithoutClass} nafar faol o‘quvchi sinfga biriktirilmagan`}
        action={<AlertLink href="/admin/users?flag=noClass">O‘quvchilar</AlertLink>}
      >
        Sinfsiz o‘quvchi sinfga tayinlangan testlarni ko‘rmaydi. Ularni sinfga biriktiring.
      </Alert>,
    );
  }
  if (data.classesWithoutHomeroom > 0) {
    alerts.push(
      <Alert
        key="homeroom"
        tone="warning"
        title={`${data.classesWithoutHomeroom} ta sinfda sinf rahbari yo‘q`}
        action={<AlertLink href="/admin/structure?tab=classes">Sinflar</AlertLink>}
      >
        Sinf rahbari o‘z sinfi portfoliolarini tasdiqlaydi va natijalarini ko‘radi.
      </Alert>,
    );
  }
  if (data.users.mustChangePassword > 0) {
    alerts.push(
      <Alert
        key="password"
        tone="info"
        title={`${data.users.mustChangePassword} ta foydalanuvchi vaqtinchalik parolni hali almashtirmagan`}
        action={<AlertLink href="/admin/users?flag=mustChangePassword">Ko‘rish</AlertLink>}
      >
        Ular hali tizimga kirmagan bo‘lishi mumkin — kirish ma’lumotlari yetkazilganini tekshiring.
      </Alert>,
    );
  }
  if (alerts.length === 0) return null;
  return (
    <section aria-labelledby="attention-title" className="space-y-2">
      <h2 id="attention-title" className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <AlertTriangle className="size-4 text-amber-600" aria-hidden />
        E’tibor talab qiladi
      </h2>
      {alerts}
    </section>
  );
}
