'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  BadgeCheck,
  Bell,
  BellOff,
  CalendarClock,
  CalendarX,
  CheckCheck,
  ChevronRight,
  CircleX,
  ClipboardList,
  Download,
  FolderUp,
  RefreshCw,
  Timer,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { formatDateTime, formatHumanDateTime, schoolToday, type NotificationType } from '@ijod/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { NotificationItem } from '@/lib/types';

interface NotificationList {
  items: NotificationItem[];
  unread: number;
}

type Filter = 'all' | 'unread';

/** Server faqat so‘nggi 50 ta bildirishnomani qaytaradi. */
const LIST_LIMIT = 50;

const ICONS: Record<NotificationType, LucideIcon> = {
  TEST_ASSIGNED: ClipboardList,
  TEST_TIME_CHANGED: CalendarClock,
  TEST_STARTING_SOON: Timer,
  TEST_CANCELLED: CalendarX,
  RESULTS_PUBLISHED: Award,
  PORTFOLIO_APPROVED: BadgeCheck,
  PORTFOLIO_RETURNED: Undo2,
  PORTFOLIO_SUBMITTED: FolderUp,
  EXPORT_READY: Download,
  GRADES_REVISED: RefreshCw,
  ATTEMPT_CANCELLED: CircleX,
  QUESTION_SCHOOL_APPROVED: BadgeCheck,
  QUESTION_SCHOOL_REJECTED: Undo2,
};

const iconFor = (type: string): LucideIcon => (Object.hasOwn(ICONS, type) ? ICONS[type as NotificationType] : Bell);

/** Ilova ichidagi havola (boshqa saytga yo‘naltirilmaydi). */
const isInternalLink = (link: string | null): link is string =>
  Boolean(link && link.startsWith('/') && !link.startsWith('//'));

function useNow(interval = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

/** “hozirgina”, “5 daqiqa oldin”, “3 soat oldin”, keyin “27-sentabr, 14:30”. */
function relativeTime(iso: string, now: number) {
  const minutes = Math.floor(Math.max(0, now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'hozirgina';
  if (minutes < 60) return `${minutes} daqiqa oldin`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} soat oldin`;
  return formatHumanDateTime(iso);
}

function dayLabel(iso: string, now: number) {
  const day = schoolToday(new Date(iso));
  if (day === schoolToday(new Date(now))) return 'Bugun';
  if (day === schoolToday(new Date(now - 86_400_000))) return 'Kecha';
  return 'Avvalroq';
}

function NotificationRow({
  item,
  now,
  onOpen,
}: {
  item: NotificationItem;
  now: number;
  onOpen: (item: NotificationItem) => void;
}) {
  const Icon = iconFor(item.type);
  const unread = !item.readAt;
  const link = isInternalLink(item.link);
  const content = (
    <>
      <span
        className={cn(
          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full',
          unread ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500',
        )}
      >
        <Icon className="size-4.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'text-sm break-words',
              unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700',
            )}
          >
            {item.title}
          </span>
          {unread && <Badge tone="brand">Yangi</Badge>}
        </span>
        {item.body && (
          <span className="mt-0.5 block text-sm break-words whitespace-pre-wrap text-slate-600">{item.body}</span>
        )}
        <time
          dateTime={item.createdAt}
          title={formatDateTime(item.createdAt)}
          className="mt-1 block text-xs text-slate-500"
        >
          {relativeTime(item.createdAt, now)}
        </time>
        {(link || unread) && <span className="sr-only">{link ? ' — ochish' : ' — o‘qilgan deb belgilash'}</span>}
      </span>
      {link && <ChevronRight className="mt-2 size-4 shrink-0 text-slate-400" aria-hidden />}
    </>
  );
  const base = cn('flex w-full gap-3 px-4 py-3 text-left sm:px-5', unread && 'bg-brand-50/60');
  return (
    <li className="relative">
      {unread && <span className="absolute inset-y-0 left-0 w-1 bg-brand-500" aria-hidden />}
      {link || unread ? (
        <button type="button" onClick={() => onOpen(item)} className={cn(base, 'transition-colors hover:bg-slate-50')}>
          {content}
        </button>
      ) : (
        <div className={base}>{content}</div>
      )}
    </li>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const now = useNow();

  const list = useQuery({
    queryKey: ['notifications', 'list', filter],
    queryFn: () => api.get<NotificationList>(`/notifications${filter === 'unread' ? '?unread=true' : ''}`),
    refetchInterval: 60_000,
  });

  // ['notifications'] kaliti qo‘ng‘iroqchadagi ['notifications', 'count'] ni ham qamrab oladi.
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post<{ ok: boolean }>(`/notifications/${id}/read`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const readAt = new Date().toISOString();
      queryClient.setQueriesData<NotificationList>({ queryKey: ['notifications', 'list'] }, (old) => {
        if (!old || !old.items.some((item) => item.id === id && !item.readAt)) return old;
        return {
          items: old.items.map((item) => (item.id === id ? { ...item, readAt } : item)),
          unread: Math.max(0, old.unread - 1),
        };
      });
      queryClient.setQueryData<{ unread: number }>(['notifications', 'count'], (old) =>
        old ? { unread: Math.max(0, old.unread - 1) } : old,
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  });

  const markAll = useMutation({
    mutationFn: () => api.post<{ updated: number }>('/notifications/read-all'),
    onSuccess: ({ updated }) =>
      toast.success(
        updated > 0 ? `${updated} ta bildirishnoma o‘qilgan deb belgilandi.` : 'O‘qilmagan bildirishnomalar yo‘q.',
      ),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  });

  const open = (item: NotificationItem) => {
    if (!item.readAt) markRead.mutate(item.id);
    if (isInternalLink(item.link)) router.push(item.link);
  };

  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const unread = list.data?.unread ?? 0;
  const groups = useMemo(() => {
    const result: { label: string; items: NotificationItem[] }[] = [];
    for (const item of items) {
      const label = dayLabel(item.createdAt, now);
      const last = result.at(-1);
      if (last && last.label === label) last.items.push(item);
      else result.push({ label, items: [item] });
    }
    return result;
  }, [items, now]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bildirishnomalar"
        description="Testlar, natijalar, portfolio qarorlari va tayyor eksportlar haqida xabarlar."
        actions={
          <Button
            variant="outline"
            onClick={() => markAll.mutate()}
            loading={markAll.isPending}
            disabled={unread === 0}
            icon={<CheckCheck className="size-4" aria-hidden />}
          >
            Barchasini o‘qilgan deb belgilash
          </Button>
        }
      />

      <Card>
        <Tabs<Filter>
          className="px-2 sm:px-3"
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: 'all', label: 'Hammasi' },
            {
              id: 'unread',
              label: 'O‘qilmaganlar',
              badge: unread > 0 ? <Badge tone="brand">{unread > 99 ? '99+' : unread}</Badge> : undefined,
            },
          ]}
        />
        {list.isPending ? (
          <PageLoader />
        ) : list.isError ? (
          <div className="p-4">
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title={filter === 'unread' ? 'O‘qilmagan bildirishnoma yo‘q' : 'Bildirishnomalar yo‘q'}
            description="Yangi test, natija, portfolio qarori yoki tayyor eksport haqidagi xabarlar shu yerda ko‘rinadi."
          />
        ) : (
          groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase sm:px-5">
                {group.label}
              </h2>
              <ul className="divide-y divide-slate-100">
                {group.items.map((item) => (
                  <NotificationRow key={item.id} item={item} now={now} onOpen={open} />
                ))}
              </ul>
            </section>
          ))
        )}
      </Card>

      {items.length >= LIST_LIMIT && (
        <p className="text-xs text-slate-500">So‘nggi {LIST_LIMIT} ta bildirishnoma ko‘rsatilmoqda.</p>
      )}
    </div>
  );
}
