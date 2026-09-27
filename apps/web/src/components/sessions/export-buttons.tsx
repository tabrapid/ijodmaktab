'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { EXPORT_KIND_LABELS, EXPORT_STATUS_LABELS, type ExportKind } from '@ijod/shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { api, downloadFile, errorMessage } from '@/lib/api';
import type { ExportJobView } from '@/lib/types';
import { exportFilters, hasActiveFilters, type ResultFilterState } from './use-session';

/**
 * Excel/Word eksport: avval joriy filtrlar bo‘yicha qatorlar soni ko‘rsatiladi, so‘ng fon vazifasi
 * yaratiladi va tayyor bo‘lgach fayl avtomatik yuklab olinadi (ro‘yxat “Eksportlar” sahifasida ham turadi).
 */
export function ExportButtons({
  sessionId,
  filters,
  studentIds = [],
}: {
  sessionId: string;
  filters: ResultFilterState;
  /** Jadvalda belgilangan qatorlar: bo‘sh bo‘lsa — barcha filtrlangan qatorlar. */
  studentIds?: string[];
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState<{ kind: ExportKind; rowCount: number } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const downloaded = useRef<string | null>(null);
  const filtered = hasActiveFilters(filters);
  const body = (kind: ExportKind) => ({
    kind,
    sessionId,
    filters: { ...exportFilters(filters), studentIds: studentIds.length ? studentIds : undefined },
  });

  const preview = useMutation({
    mutationFn: (kind: ExportKind) => api.post<{ rowCount: number }>('/exports/preview', body(kind)),
    onSuccess: (result, kind) => setConfirm({ kind, rowCount: result.rowCount }),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const create = useMutation({
    mutationFn: (kind: ExportKind) => api.post<ExportJobView>('/exports', body(kind)),
    onSuccess: (job) => {
      setConfirm(null);
      setJobId(job.id);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const job = useQuery({
    queryKey: ['export', jobId],
    queryFn: () => api.get<ExportJobView>(`/exports/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return !status || status === 'QUEUED' || status === 'RUNNING' ? 1000 : false;
    },
  });

  const current = job.data;
  useEffect(() => {
    if (!current || current.status !== 'READY' || downloaded.current === current.id) return;
    downloaded.current = current.id;
    downloadFile(`/exports/${current.id}/download`, current.fileName ?? 'eksport')
      .then(() => toast.success('Fayl yuklab olindi.'))
      .catch((error: unknown) => toast.error(errorMessage(error)));
  }, [current, toast]);
  useEffect(() => {
    if (current?.status === 'FAILED') toast.error(current.error ?? 'Eksport bajarilmadi.');
  }, [current?.status, current?.error, toast]);

  const busy = Boolean(jobId) && (!current || current.status === 'QUEUED' || current.status === 'RUNNING');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        icon={<FileSpreadsheet className="size-4" />}
        onClick={() => preview.mutate('SESSION_RESULTS_XLSX')}
        loading={preview.isPending && preview.variables === 'SESSION_RESULTS_XLSX'}
        disabled={busy}
      >
        Excel
      </Button>
      <Button
        variant="outline"
        size="sm"
        icon={<FileText className="size-4" />}
        onClick={() => preview.mutate('SESSION_REPORT_DOCX')}
        loading={preview.isPending && preview.variables === 'SESSION_REPORT_DOCX'}
        disabled={busy}
      >
        Word hisobot
      </Button>
      {busy && (
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600" role="status">
          <Spinner className="size-4" /> Fayl tayyorlanmoqda…
        </span>
      )}
      {current?.status === 'READY' && (
        <Button
          variant="ghost"
          size="sm"
          icon={<Download className="size-4" />}
          onClick={() =>
            downloadFile(`/exports/${current.id}/download`, current.fileName ?? 'eksport').catch((error: unknown) =>
              toast.error(errorMessage(error)),
            )
          }
        >
          Qayta yuklab olish
        </Button>
      )}
      {current && current.status !== 'READY' && !busy && (
        <span className="text-sm text-red-700">{EXPORT_STATUS_LABELS[current.status]}</span>
      )}
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && create.mutate(confirm.kind)}
        loading={create.isPending}
        title={confirm ? EXPORT_KIND_LABELS[confirm.kind] : ''}
        confirmLabel="Eksport qilish"
      >
        {confirm && (
          <div className="space-y-2">
            <p>
              Faylga <strong className="text-slate-900">{confirm.rowCount} ta</strong> o‘quvchi qatori kiradi
              {studentIds.length
                ? ' (faqat jadvalda belgilangan qatorlar).'
                : filtered
                  ? ' (joriy filtrlar bo‘yicha).'
                  : '.'}
            </p>
            <p>
              Fayl bir necha soniyada tayyorlanadi va avtomatik yuklab olinadi. Keyinroq{' '}
              <Link href="/exports" className="text-brand-700 underline">
                “Eksportlar”
              </Link>{' '}
              sahifasidan ham olish mumkin.
            </p>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
