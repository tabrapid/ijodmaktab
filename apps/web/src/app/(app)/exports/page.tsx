'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FileText, Inbox, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import {
  CATEGORY_LABELS,
  EXPORT_STATUS_LABELS,
  PARTICIPATION_STATUS_LABELS,
  formatDateTime,
  formatPercent,
  type Category,
  type ExportStatus,
  type ParticipationStatus,
} from '@ijod/shared';
import { RequireRole } from '@/components/app-shell';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, downloadFile, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { ExportJobView } from '@/lib/types';

const EXPORTS_KEY = ['exports'] as const;

/** Server so‘nggi 30 ta eksportni qaytaradi. */
const LIST_LIMIT = 30;

const STATUS_TONES: Record<ExportStatus, BadgeTone> = {
  QUEUED: 'gray',
  RUNNING: 'blue',
  READY: 'green',
  FAILED: 'red',
  EXPIRED: 'amber',
};

const isActive = (status: ExportStatus) => status === 'QUEUED' || status === 'RUNNING';

function useNow(interval = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

/** Tayyor fayl muddati o‘tgan bo‘lsa, tozalash vazifasi ishlaguncha ham “muddati o‘tgan” ko‘rsatiladi. */
function effectiveStatus(job: ExportJobView, now: number): ExportStatus {
  if (job.status === 'READY' && (!job.expiresAt || new Date(job.expiresAt).getTime() <= now)) return 'EXPIRED';
  return job.status;
}

function timeLeft(expiresAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 60_000));
  if (minutes >= 60) return `yana ${Math.floor(minutes / 60)} soat`;
  return `yana ${Math.max(1, minutes)} daqiqa`;
}

/** Eksport yaratilgandagi natijalar filtri (qisqa matn). */
function filterSummary(params: unknown): string | null {
  if (!params || typeof params !== 'object') return null;
  const filters = (params as { filters?: unknown }).filters;
  if (!filters || typeof filters !== 'object') return null;
  const value = filters as Record<string, unknown>;
  const parts: string[] = [];
  if (Array.isArray(value.statuses) && value.statuses.length > 0) {
    const labels = value.statuses.map((status) =>
      Object.hasOwn(PARTICIPATION_STATUS_LABELS, String(status))
        ? PARTICIPATION_STATUS_LABELS[status as ParticipationStatus]
        : String(status),
    );
    parts.push(`holat: ${labels.join(', ')}`);
  }
  if (Array.isArray(value.classIds) && value.classIds.length > 0) parts.push(`${value.classIds.length} ta sinf`);
  if (Array.isArray(value.studentIds) && value.studentIds.length > 0)
    parts.push(`${value.studentIds.length} ta tanlangan o‘quvchi`);
  if (typeof value.minPercent === 'number') parts.push(`kamida ${formatPercent(value.minPercent, 0)}`);
  if (typeof value.maxPercent === 'number') parts.push(`ko‘pi bilan ${formatPercent(value.maxPercent, 0)}`);
  if (typeof value.category === 'string' && Object.hasOwn(CATEGORY_LABELS, value.category)) {
    const range = [
      typeof value.categoryMinPercent === 'number' ? `kamida ${formatPercent(value.categoryMinPercent, 0)}` : null,
      typeof value.categoryMaxPercent === 'number' ? `ko‘pi bilan ${formatPercent(value.categoryMaxPercent, 0)}` : null,
    ].filter(Boolean);
    parts.push(`${CATEGORY_LABELS[value.category as Category]}${range.length > 0 ? `: ${range.join(', ')}` : ''}`);
  }
  if (typeof value.q === 'string' && value.q) parts.push(`qidiruv: “${value.q}”`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function ExportRow({
  job,
  now,
  highlighted,
  rowRef,
  downloading,
  onDownload,
}: {
  job: ExportJobView;
  now: number;
  highlighted: boolean;
  rowRef?: (node: HTMLLIElement | null) => void;
  downloading: boolean;
  onDownload: () => void;
}) {
  const status = effectiveStatus(job, now);
  const Icon = job.kind === 'SESSION_RESULTS_XLSX' ? FileSpreadsheet : FileText;
  const summary = filterSummary(job.params);
  return (
    <li
      ref={rowRef}
      tabIndex={highlighted ? -1 : undefined}
      aria-current={highlighted ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-3 px-4 py-4 focus:outline-none sm:flex-row sm:items-start sm:px-5',
        highlighted && 'bg-amber-50 ring-2 ring-amber-300 ring-inset',
      )}
    >
      <span className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 sm:flex">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-slate-900">{job.kindLabel}</p>
          <Badge tone={STATUS_TONES[status]}>
            {isActive(status) && (
              <span
                className="inline-block size-3 animate-spin rounded-full border-2 border-current border-r-transparent"
                aria-hidden
              />
            )}
            {EXPORT_STATUS_LABELS[status]}
          </Badge>
          {highlighted && <Badge tone="amber">Bildirishnomadagi eksport</Badge>}
        </div>
        {job.fileName && <p className="truncate text-sm text-slate-600">{job.fileName}</p>}
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <div className="flex gap-1">
            <dt>Yaratilgan:</dt>
            <dd className="tabular">{formatDateTime(job.createdAt)}</dd>
          </div>
          {job.finishedAt && (
            <div className="flex gap-1">
              <dt>Yakunlangan:</dt>
              <dd className="tabular">{formatDateTime(job.finishedAt)}</dd>
            </div>
          )}
          {job.rowCount !== null && (
            <div className="flex gap-1">
              <dt>Qatorlar soni:</dt>
              <dd className="tabular">{job.rowCount}</dd>
            </div>
          )}
          {job.expiresAt && (status === 'READY' || status === 'EXPIRED') && (
            <div className="flex gap-1">
              <dt>Havola muddati:</dt>
              <dd className={cn('tabular', status === 'EXPIRED' && 'text-amber-700')}>
                {formatDateTime(job.expiresAt)}
                {status === 'READY' && ` (${timeLeft(job.expiresAt, now)})`}
              </dd>
            </div>
          )}
        </dl>
        {summary && <p className="text-xs text-slate-500">Filtr: {summary}</p>}
        {status === 'FAILED' && (
          <Alert tone="danger" title="Eksport bajarilmadi">
            {job.error ?? 'Faylni tayyorlashda xatolik yuz berdi.'} Eksportni natijalar sahifasidan qayta yarating.
          </Alert>
        )}
        {status === 'EXPIRED' && (
          <p className="text-xs font-medium text-amber-700">
            Havola muddati tugagan — eksportni natijalar sahifasidan qayta yarating.
          </p>
        )}
      </div>
      {status === 'READY' && (
        <Button
          className="shrink-0 self-start"
          onClick={onDownload}
          loading={downloading}
          icon={<Download className="size-4" aria-hidden />}
        >
          Yuklab olish
        </Button>
      )}
      {isActive(status) && <p className="shrink-0 text-sm text-slate-500">Fayl tayyorlanmoqda…</p>}
    </li>
  );
}

function ExportsList() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const highlight = useSearchParams().get('highlight');
  const now = useNow();

  const jobs = useQuery({
    queryKey: EXPORTS_KEY,
    queryFn: () => api.get<ExportJobView[]>('/exports'),
    // Navbatdagi yoki tayyorlanayotgan eksport bo‘lsa, ro‘yxat har 2 soniyada yangilanadi.
    refetchInterval: (query) => (query.state.data?.some((job) => isActive(job.status)) ? 2000 : false),
  });

  // Qo‘lda yangilash (avtomatik yangilanish tugmada aylanib turmasligi uchun alohida).
  const refresh = useMutation({ mutationFn: () => queryClient.refetchQueries({ queryKey: EXPORTS_KEY }) });

  const download = useMutation({
    mutationFn: (job: ExportJobView) => downloadFile(`/exports/${job.id}/download`, job.fileName ?? 'eksport'),
    onSuccess: () => toast.success('Fayl yuklab olindi.'),
    onError: (error) => {
      toast.error(errorMessage(error));
      if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
        void queryClient.invalidateQueries({ queryKey: EXPORTS_KEY });
      }
    },
  });

  // Sahifa ochiq turganda tayyor bo‘lgan eksportlar haqida xabar beriladi.
  const activeIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!jobs.data) return;
    const previous = activeIds.current;
    activeIds.current = new Set(jobs.data.filter((job) => isActive(job.status)).map((job) => job.id));
    if (!previous) return;
    const finished = jobs.data.filter((job) => previous.has(job.id) && !isActive(job.status));
    for (const job of finished) {
      if (job.status === 'READY') toast.success(`Eksport tayyor: ${job.kindLabel}`);
      else if (job.status === 'FAILED') toast.error(`Eksport bajarilmadi: ${job.kindLabel}`);
    }
    if (finished.length > 0) void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [jobs.data, queryClient, toast]);

  // Bildirishnomadan kelinganda ko‘rsatilgan eksportga bir marta aylantiriladi.
  const scrolled = useRef(false);
  const highlightRef = (node: HTMLLIElement | null) => {
    if (!node || scrolled.current) return;
    scrolled.current = true;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    node.focus({ preventScroll: true });
  };

  const highlightMissing = Boolean(highlight && jobs.data && !jobs.data.some((job) => job.id === highlight));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Eksportlar"
        description="Natijalar (Excel) va nazorat ishi bayonnomalari (Word). Fayllar navbatda tayyorlanadi, tayyor bo‘lganda bildirishnoma keladi."
        actions={
          <Button
            variant="outline"
            onClick={() => refresh.mutate()}
            loading={refresh.isPending}
            disabled={jobs.isPending}
            icon={<RefreshCw className="size-4" aria-hidden />}
          >
            Yangilash
          </Button>
        }
      />

      <Alert tone="info" title="Havolalar vaqtinchalik">
        Tayyor fayl havolasi 24 soat amal qiladi, so‘ng fayl o‘chiriladi. Yuklab olishda ruxsatingiz qayta tekshiriladi
        — sessiya natijalarini ko‘rish huquqi bekor qilingan bo‘lsa, fayl yuklanmaydi.
      </Alert>

      {highlightMissing && (
        <Alert tone="warning">
          Ko‘rsatilgan eksport ro‘yxatda topilmadi. Bu yerda faqat so‘nggi {LIST_LIMIT} ta eksport ko‘rsatiladi.
        </Alert>
      )}

      <Card>
        {jobs.isPending ? (
          <PageLoader />
        ) : jobs.isError ? (
          <div className="p-4">
            <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} />
          </div>
        ) : jobs.data.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Eksportlar hali yo‘q"
            description="Sessiya natijalari sahifasida Excel yoki Word eksportini yarating — tayyor fayllar shu yerda paydo bo‘ladi."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {jobs.data.map((job) => {
              const highlighted = job.id === highlight;
              return (
                <ExportRow
                  key={job.id}
                  job={job}
                  now={now}
                  highlighted={highlighted}
                  rowRef={highlighted ? highlightRef : undefined}
                  downloading={download.isPending && download.variables?.id === job.id}
                  onDownload={() => download.mutate(job)}
                />
              );
            })}
          </ul>
        )}
      </Card>

      {jobs.data && jobs.data.length >= LIST_LIMIT && (
        <p className="text-xs text-slate-500">So‘nggi {LIST_LIMIT} ta eksport ko‘rsatilmoqda.</p>
      )}
    </div>
  );
}

export default function ExportsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <RequireRole roles={['TEACHER', 'DEPUTY', 'SUPER_ADMIN']}>
        <ExportsList />
      </RequireRole>
    </Suspense>
  );
}
