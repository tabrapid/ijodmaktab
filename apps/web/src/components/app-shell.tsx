'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  BadgeCheck,
  BarChart3,
  Bell,
  CalendarClock,
  Download,
  FileText,
  FolderHeart,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  School,
  ScrollText,
  ShieldCheck,
  Trophy,
  Upload,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ROLE_LABELS, type Role } from '@ijod/shared';
import { api } from '@/lib/api';
import { hasRole, homeFor, useMe } from '@/lib/auth';
import { cn } from '@/lib/cn';
import type { Me } from '@/lib/types';
import { buttonClass } from './ui/button';
import { PageLoader } from './ui/feedback';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

function navFor(me: Me): NavSection[] {
  const sections: NavSection[] = [];
  const homeroom = me.homeroomClassIds.length > 0;

  if (hasRole(me, 'STUDENT')) {
    sections.push({
      title: 'O‘quvchi',
      items: [
        { href: '/student', label: 'Bosh sahifa', icon: LayoutDashboard },
        { href: '/student/results', label: 'Natijalarim', icon: Award },
        { href: '/portfolio', label: 'Portfoliom', icon: FolderHeart },
      ],
    });
  }
  if (hasRole(me, 'SUPER_ADMIN')) {
    sections.push({
      title: 'Tizim',
      items: [{ href: '/system', label: 'Tizim holati', icon: ShieldCheck }],
    });
  }
  if (hasRole(me, 'DEPUTY', 'SUPER_ADMIN')) {
    sections.push({
      title: 'Rahbariyat',
      items: [
        { href: '/management', label: 'Ko‘rsatkichlar', icon: BarChart3 },
        { href: '/management/sessions', label: 'Barcha sessiyalar', icon: CalendarClock },
        { href: '/portfolio/review', label: 'Portfolio tasdiqlash', icon: BadgeCheck },
        { href: '/management/portfolio', label: 'Maktab portfoliosi', icon: Trophy },
        { href: '/management/questions', label: 'Maktab banki so‘rovlari', icon: Library },
      ],
    });
  }
  if (hasRole(me, 'TEACHER')) {
    sections.push({
      title: 'O‘qituvchi',
      items: [
        { href: '/teacher', label: 'Bosh sahifa', icon: LayoutDashboard },
        { href: '/teacher/tests', label: 'Testlar', icon: FileText },
        { href: '/teacher/questions', label: 'Savollar banki', icon: Library },
        { href: '/teacher/sessions', label: 'Sessiyalar', icon: CalendarClock },
        { href: '/teacher/classes', label: 'Sinflarim', icon: Users },
        ...(homeroom && !hasRole(me, 'DEPUTY')
          ? [{ href: '/portfolio/review', label: 'Portfolio tasdiqlash', icon: BadgeCheck }]
          : []),
        { href: '/portfolio', label: 'Portfoliom', icon: FolderHeart },
        { href: '/exports', label: 'Eksportlar', icon: Download },
      ],
    });
  }
  if (hasRole(me, 'ADMIN', 'SUPER_ADMIN')) {
    sections.push({
      title: 'Administrator',
      items: [
        ...(hasRole(me, 'ADMIN') ? [{ href: '/admin', label: 'Bosh sahifa', icon: LayoutDashboard }] : []),
        { href: '/admin/users', label: 'Foydalanuvchilar', icon: Users, match: '/admin/users' },
        { href: '/admin/users/import', label: 'Excel import', icon: Upload },
        { href: '/admin/structure', label: 'Maktab tuzilmasi', icon: School },
      ],
    });
  }
  if (hasRole(me, 'DEPUTY', 'ADMIN', 'SUPER_ADMIN')) {
    sections.push({ title: 'Nazorat', items: [{ href: '/admin/audit', label: 'Audit jurnali', icon: ScrollText }] });
  }
  return sections;
}

function isActive(pathname: string, item: NavItem, all: NavItem[]) {
  if (pathname === item.href) return true;
  if (!pathname.startsWith(`${item.href}/`)) return false;
  // Eng uzun mos keladigan havola faol hisoblanadi.
  return !all.some(
    (other) =>
      other.href.length > item.href.length && (pathname === other.href || pathname.startsWith(`${other.href}/`)),
  );
}

function NotificationsLink() {
  const { data } = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api.get<{ unread: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  const unread = data?.unread ?? 0;
  return (
    <Link
      href="/notifications"
      className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      aria-label={unread ? `Bildirishnomalar: ${unread} ta o‘qilmagan` : 'Bildirishnomalar'}
    >
      <Bell className="size-5" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] leading-5 font-semibold text-white tabular">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}

function Sidebar({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const pathname = usePathname();
  const sections = navFor(me);
  const all = sections.flatMap((section) => section.items);
  return (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5" aria-label="Asosiy menyu">
      <Link href={homeFor(me)} onClick={onNavigate} className="flex items-center gap-2.5 px-2">
        <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-lg font-bold text-white">
          I
        </span>
        <span className="leading-tight">
          <span className="block font-semibold text-slate-900">Ijod maktabi</span>
          <span className="block text-xs text-slate-500">Ta’lim tizimi</span>
        </span>
      </Link>
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-2 pb-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">{section.title}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item, all);
              const Icon = item.icon;
              return (
                <li key={`${section.title}-${item.href}`}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                      active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                    )}
                  >
                    <Icon className="size-4.5 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="mt-auto border-t border-slate-200 pt-4">
        <Link
          href="/profile"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          <UserCog className="size-4.5" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate font-medium text-slate-800">{me.fullName}</span>
            <span className="block truncate text-xs text-slate-500">
              {me.roles.map((role) => ROLE_LABELS[role]).join(', ')}
            </span>
          </span>
        </Link>
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me, isPending, error } = useMe();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      const system = me?.realm === 'SYSTEM';
      queryClient.clear();
      router.replace(system ? '/system/login' : '/login');
    },
  });

  useEffect(() => {
    if (!me) return;
    if (me.mfa.required && !me.mfa.verified) router.replace('/mfa');
    else if (me.mustChangePassword) router.replace('/change-password');
  }, [me, router]);

  if (isPending || !me || (me.mfa.required && !me.mfa.verified) || me.mustChangePassword) {
    return <PageLoader label={error ? 'Kirish sahifasiga yo‘naltirilmoqda…' : 'Yuklanmoqda…'} />;
  }

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-surface lg:block print:hidden">
        <Sidebar me={me} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden" role="dialog" aria-modal="true" aria-label="Menyu">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Menyuni yopish"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-surface shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-4 right-3 rounded-md p-1 text-slate-400 hover:bg-slate-100"
              aria-label="Menyuni yopish"
            >
              <X className="size-5" />
            </button>
            <Sidebar me={me} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-surface/90 px-4 backdrop-blur sm:px-6 print:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Menyuni ochish"
        >
          <Menu className="size-5" />
        </button>
        <div className="flex-1 truncate text-sm text-slate-500">
          <span className="hidden sm:inline">Xush kelibsiz, </span>
          <span className="font-medium text-slate-800">{me.firstName}</span>
        </div>
        <NotificationsLink />
        <button
          type="button"
          onClick={() => logout.mutate()}
          className={buttonClass('ghost', 'sm')}
          disabled={logout.isPending}
        >
          <LogOut className="size-4" aria-hidden />
          <span className="hidden sm:inline">Chiqish</span>
        </button>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

/** Bo‘lim faqat ko‘rsatilgan rollardan biriga ega foydalanuvchilarga ochiq (server ham tekshiradi). */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { data: me } = useMe();
  if (!me) return <PageLoader />;
  if (!hasRole(me, ...roles)) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <ShieldCheck className="mx-auto size-10 text-slate-300" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold">Bu bo‘lim sizga ochiq emas</h1>
        <p className="mt-1 text-sm text-slate-500">Sahifa boshqa rol uchun mo‘ljallangan.</p>
        <Link href={homeFor(me)} className={buttonClass('primary', 'md', 'mt-5')}>
          Bosh sahifaga qaytish
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
