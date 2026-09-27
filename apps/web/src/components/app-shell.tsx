'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  BadgeCheck,
  BarChart3,
  Bell,
  CalendarClock,
  Camera,
  ChevronDown,
  Download,
  FileText,
  FolderHeart,
  Inbox,
  LayoutDashboard,
  Library,
  LogOut,
  Menu as MenuIcon,
  School,
  ScrollText,
  ShieldCheck,
  Trophy,
  Upload,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ROLE_LABELS, type Role } from '@ijod/shared';
import { api } from '@/lib/api';
import { hasRole, homeFor, useMe } from '@/lib/auth';
import { cn } from '@/lib/cn';
import type { Me } from '@/lib/types';
import { Avatar } from './avatar';
import { AvatarUploadDialog } from './avatar-upload-dialog';
import { BrandLogo, SCHOOL_NAME, SCHOOL_NAME_LINES } from './brand-logo';
import { ThemeToggle } from './theme-toggle';
import { buttonClass } from './ui/button';
import { PageLoader } from './ui/feedback';
import { Menu, MenuItem, MenuSeparator } from './ui/menu';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shu band faol hisoblanadigan qo‘shimcha manzil boshlari (masalan, `/portfolio/students`). */
  match?: string[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Rollar bo‘yicha menyu. Bir nechta rolli foydalanuvchida bir manzil faqat bir marta chiqadi. */
export function navFor(me: Pick<Me, 'roles' | 'homeroomClassIds'>): NavSection[] {
  const sections: NavSection[] = [];
  const homeroom = me.homeroomClassIds.length > 0;
  const teacher = hasRole(me, 'TEACHER');

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
        { href: '/management/portfolio', label: 'Portfoliolar', icon: Trophy, match: ['/portfolio/students'] },
        // O‘qituvchi bo‘lmagan rahbar sessiyani o‘qituvchi sahifalari orqali yaratadi.
        {
          href: '/management/sessions',
          label: 'Sessiyalar',
          icon: CalendarClock,
          match: teacher ? undefined : ['/teacher/sessions'],
        },
        ...(teacher
          ? []
          : [
              { href: '/teacher/tests', label: 'Test banki', icon: FileText },
              { href: '/teacher/questions', label: 'Savollar banki', icon: Library },
            ]),
        { href: '/management/questions', label: 'Bank so‘rovlari', icon: Inbox },
        ...(hasRole(me, 'DEPUTY') && !hasRole(me, 'ADMIN', 'SUPER_ADMIN')
          ? [{ href: '/admin/users', label: 'Foydalanuvchilar', icon: Users, match: ['/admin/users'] }]
          : []),
      ],
    });
  }
  if (teacher) {
    sections.push({
      title: 'O‘qituvchi',
      items: [
        { href: '/teacher', label: 'Bosh sahifa', icon: LayoutDashboard },
        { href: '/teacher/tests', label: 'Testlar va bank', icon: FileText },
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
        { href: '/admin/users', label: 'Foydalanuvchilar', icon: Users, match: ['/admin/users'] },
        { href: '/admin/users/import', label: 'Excel import', icon: Upload },
        { href: '/admin/structure', label: 'Maktab tuzilmasi', icon: School, match: ['/admin/classes'] },
      ],
    });
  }
  if (hasRole(me, 'DEPUTY', 'ADMIN', 'SUPER_ADMIN')) {
    sections.push({ title: 'Nazorat', items: [{ href: '/admin/audit', label: 'Audit jurnali', icon: ScrollText }] });
  }

  const seen = new Set<string>();
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !seen.has(item.href) && Boolean(seen.add(item.href))),
    }))
    .filter((section) => section.items.length > 0);
}

function matchLength(pathname: string, item: NavItem) {
  let best = -1;
  for (const prefix of [item.href, ...(item.match ?? [])]) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) best = Math.max(best, prefix.length);
  }
  return best;
}

/** Faol band — manzilga eng uzun mos keladigan havola (qo‘shimcha `match` boshlari ham hisobga olinadi). */
export function activeNavItem(pathname: string, items: NavItem[]): NavItem | undefined {
  let active: NavItem | undefined;
  let best = -1;
  for (const item of items) {
    const length = matchLength(pathname, item);
    if (length > best) {
      best = length;
      active = item;
    }
  }
  return active;
}

/** Menyuda yo‘q umumiy sahifalar nomi (sarlavhadagi joylashuv uchun). */
const PAGE_TITLES: [string, string][] = [
  ['/profile', 'Profil'],
  ['/notifications', 'Bildirishnomalar'],
];

function pageContext(pathname: string, sections: NavSection[]) {
  const active = activeNavItem(
    pathname,
    sections.flatMap((section) => section.items),
  );
  if (active) {
    const section = sections.find((candidate) => candidate.items.includes(active));
    return { section: section?.title, label: active.label };
  }
  const page = PAGE_TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return page ? { section: undefined, label: page[1] } : null;
}

const rolesText = (roles: Role[]) => roles.map((role) => ROLE_LABELS[role]).join(', ');

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
      className="relative inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
      aria-label={unread ? `Bildirishnomalar: ${unread} ta o‘qilmagan` : 'Bildirishnomalar'}
    >
      <Bell className="size-5" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] leading-5 font-semibold text-white tabular ring-2 ring-surface">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}

/** Profil rasmi va kamera belgisi (rasmni almashtirish mumkinligini ko‘rsatadi). */
function AvatarWithBadge({ me }: { me: Me }) {
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar name={me.fullName} src={me.avatarUrl} size="md" className="size-9" />
      <span
        aria-hidden
        className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-brand-600 text-white ring-2 ring-surface"
      >
        <Camera className="size-2.5" strokeWidth={2.5} />
      </span>
    </span>
  );
}

function UserMenu({ me, onLogout, loggingOut }: { me: Me; onLogout: () => void; loggingOut: boolean }) {
  const [avatarOpen, setAvatarOpen] = useState(false);
  return (
    <>
      <Menu
        label={`Foydalanuvchi menyusi: ${me.fullName}`}
        buttonLabel={`Foydalanuvchi menyusi: ${me.fullName}`}
        buttonClassName="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-slate-100 sm:pr-2"
        button={
          <>
            <AvatarWithBadge me={me} />
            <span className="hidden max-w-36 truncate text-sm font-semibold text-slate-800 md:inline">
              {me.firstName}
            </span>
            <ChevronDown className="hidden size-4 text-slate-400 sm:inline" aria-hidden />
          </>
        }
        className="w-72"
      >
        <div role="none" className="flex items-center gap-3 px-2.5 pt-2 pb-3">
          <Avatar name={me.fullName} src={me.avatarUrl} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{me.fullName}</p>
            <p className="truncate text-xs text-slate-500">{rolesText(me.roles)}</p>
          </div>
        </div>
        <MenuSeparator />
        <MenuItem href="/profile" icon={UserRound}>
          Profil
        </MenuItem>
        <MenuItem icon={Camera} onSelect={() => setAvatarOpen(true)}>
          Profil rasmini o‘zgartirish
        </MenuItem>
        <MenuSeparator />
        <ThemeToggle variant="menu" />
        <MenuSeparator />
        <MenuItem icon={LogOut} tone="danger" onSelect={onLogout}>
          {loggingOut ? 'Chiqilmoqda…' : 'Chiqish'}
        </MenuItem>
      </Menu>
      <AvatarUploadDialog open={avatarOpen} onClose={() => setAvatarOpen(false)} />
    </>
  );
}

function Sidebar({ me, onNavigate, onClose }: { me: Me; onNavigate?: () => void; onClose?: () => void }) {
  const pathname = usePathname();
  const sections = navFor(me);
  const active = activeNavItem(
    pathname,
    sections.flatMap((section) => section.items),
  );
  return (
    <div className="relative isolate flex h-full flex-col overflow-hidden bg-ink-900 text-ink-100 [--focus-ring:var(--color-accent-400)]">
      {/* Bezak: logotip ortidan taralayotgan nurlar */}
      <div
        aria-hidden
        className="rays pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 [--rays-fade:17rem] [--rays-x:2.4rem] [--rays-y:2.6rem]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 -left-28 -z-10 size-72 rounded-full bg-accent-500/15 blur-3xl"
      />

      <div className="flex items-center gap-2 px-4 pt-5 pb-4">
        <Link
          href={homeFor(me)}
          onClick={onNavigate}
          aria-label={`${SCHOOL_NAME} — bosh sahifa`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl"
        >
          <BrandLogo size={42} plate alt="" />
          <span className="min-w-0 leading-tight">
            <span className="block font-display text-[14px] font-semibold text-white">{SCHOOL_NAME_LINES[0]}</span>
            <span className="mt-1 block text-[10.5px] font-bold tracking-[0.24em] text-accent-400 uppercase">
              {SCHOOL_NAME_LINES[1]}
            </span>
          </span>
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 rounded-lg p-1.5 text-ink-300 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Menyuni yopish"
          >
            <X className="size-5" />
          </button>
        )}
      </div>
      <div aria-hidden className="mx-4 h-px bg-gradient-to-r from-accent-400/60 via-white/10 to-transparent" />

      <nav
        className="flex-1 space-y-5 overflow-y-auto px-3 py-4 [scrollbar-color:var(--color-ink-600)_transparent]"
        aria-label="Asosiy menyu"
      >
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-1.5 text-[11px] font-bold tracking-[0.16em] text-ink-300 uppercase">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const current = item === active;
                const Icon = item.icon;
                return (
                  <li key={`${section.title}-${item.href}`}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={current ? 'page' : undefined}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        current ? 'bg-white/10 text-white' : 'text-ink-200 hover:bg-white/5 hover:text-white',
                      )}
                    >
                      {current && (
                        <span
                          aria-hidden
                          className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-accent-400"
                        />
                      )}
                      <Icon
                        className={cn(
                          'size-4.5 shrink-0 transition-colors',
                          current ? 'text-accent-400' : 'text-ink-300 group-hover:text-ink-100',
                        )}
                        aria-hidden
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <Link
          href="/profile"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/5"
        >
          <Avatar name={me.fullName} src={me.avatarUrl} size="sm" className="ring-white/15" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">{me.fullName}</span>
            <span className="block truncate text-xs text-ink-300">{rolesText(me.roles)}</span>
          </span>
        </Link>
      </div>
    </div>
  );
}

/** Telefon uchun yon menyu: Esc bilan yopiladi, ochilganda fokus ichkariga o‘tadi. */
function MobileDrawer({ me, onClose }: { me: Me; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('a[aria-current="page"], a')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 lg:hidden print:hidden" role="dialog" aria-modal="true" aria-label="Menyu">
      <button
        type="button"
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-[2px]"
        aria-label="Menyuni yopish"
        tabIndex={-1}
        onClick={onClose}
      />
      <div ref={panelRef} className="absolute inset-y-0 left-0 w-80 max-w-[88%] shadow-2xl">
        <Sidebar me={me} onNavigate={onClose} onClose={onClose} />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me, isPending, error } = useMe();
  const [open, setOpen] = useState(false);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const router = useRouter();
  const pathname = usePathname();
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

  const context = pageContext(pathname, navFor(me));

  return (
    <div className="min-h-dvh lg:pl-68">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-68 lg:block dark:border-r dark:border-white/[0.06] print:hidden">
        <Sidebar me={me} />
      </aside>

      {open && <MobileDrawer me={me} onClose={closeDrawer} />}

      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-slate-200/80 bg-surface/85 px-3 backdrop-blur-md sm:gap-3 sm:px-6 lg:px-8 print:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex size-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
          aria-label="Menyuni ochish"
          aria-expanded={open}
        >
          <MenuIcon className="size-5" />
        </button>
        <Link href={homeFor(me)} className="shrink-0 rounded-lg lg:hidden" aria-label={`${SCHOOL_NAME} — bosh sahifa`}>
          <BrandLogo size={34} plate="dark" alt="" />
        </Link>

        <div className="min-w-0 flex-1 pl-1 lg:pl-0">
          {context ? (
            <p className="flex min-w-0 items-center gap-2 text-sm">
              {context.section && (
                <>
                  <span className="hidden shrink-0 font-medium text-slate-500 sm:inline">{context.section}</span>
                  <span aria-hidden className="hidden text-slate-300 sm:inline">
                    /
                  </span>
                </>
              )}
              <span className="truncate font-semibold text-slate-900">{context.label}</span>
            </p>
          ) : (
            <p className="truncate text-sm text-slate-500">
              <span className="hidden sm:inline">Xush kelibsiz, </span>
              <span className="font-semibold text-slate-900">{me.firstName}</span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <ThemeToggle className="hidden sm:inline-flex" />
          <NotificationsLink />
          <span aria-hidden className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
          <UserMenu me={me} onLogout={() => logout.mutate()} loggingOut={logout.isPending} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
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
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-slate-100 ring-8 ring-slate-50">
          <ShieldCheck className="size-6 text-slate-400" aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-xl font-semibold text-slate-900">Bu bo‘lim sizga ochiq emas</h1>
        <p className="mt-1 text-sm text-slate-500">Sahifa boshqa rol uchun mo‘ljallangan.</p>
        <Link href={homeFor(me)} className={buttonClass('primary', 'md', 'mt-5')}>
          Bosh sahifaga qaytish
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
