'use client';

import { useMutation } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, CheckCircle2, Download, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { IMPORT_FIELDS, IMPORT_FIELD_LABELS, ROLE_LABELS, fullName, type ImportField } from '@ijod/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { Field, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { Stat } from '@/components/ui/stat';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, downloadFile, errorMessage } from '@/lib/api';
import type { ImportCommitResult, ImportPreview, ImportPreviewRow } from '@/lib/types';
import { IMPORT_STATUS_LABELS, IMPORT_STATUS_TONES } from './labels';

type Mapping = Record<ImportField, number | null>;
type RowStatus = ImportPreviewRow['status'];
type Filter = 'all' | RowStatus;

const PAGE_SIZE = 50;

const FIELD_HINTS: Record<ImportField, string> = {
  fullName: 'Familiya, ism va otasining ismi bitta katakda.',
  lastName: 'F.I.Sh. ustuni bo‘lmasa majburiy.',
  firstName: 'F.I.Sh. ustuni bo‘lmasa majburiy.',
  middleName: 'Ixtiyoriy.',
  role: '“o‘quvchi” yoki “o‘qituvchi”; bo‘sh bo‘lsa standart rol.',
  className: 'Masalan, 9-A (joriy o‘quv yili).',
  login: 'Ixtiyoriy; bo‘sh bo‘lsa avtomatik yaratiladi.',
};

/** Ustun harfi: 0 → A, 26 → AA. */
function columnLetter(index: number) {
  let result = '';
  let value = index + 1;
  while (value > 0) {
    const rest = (value - 1) % 26;
    result = String.fromCharCode(65 + rest) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

const toMapping = (preview: ImportPreview): Mapping =>
  Object.fromEntries(IMPORT_FIELDS.map((field) => [field, preview.mapping[field] ?? null])) as Mapping;

/** Server qoidasi bilan bir xil: o‘tkazib yuborish belgisi, so‘ng xato, ogohlantirish. */
const effectiveStatus = (row: ImportPreviewRow, skip: ReadonlySet<number>): RowStatus =>
  skip.has(row.rowNumber) ? 'skipped' : row.errors.length ? 'error' : row.warnings.length ? 'warning' : 'ok';

function RowNotes({ row }: { row: ImportPreviewRow }) {
  if (row.errors.length === 0 && row.warnings.length === 0) return <span className="text-slate-500">—</span>;
  return (
    <ul className="space-y-1 text-xs">
      {row.errors.map((message) => (
        <li key={message} className="flex gap-1.5 text-red-700">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="sr-only">Xato: </span>
            {message}
          </span>
        </li>
      ))}
      {row.warnings.map((message) => (
        <li key={message} className="flex gap-1.5 text-amber-700">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="sr-only">Ogohlantirish: </span>
            {message}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 2-bosqich: ustunlarni moslashtirish, qatorlarni ko‘rib chiqish va tasdiqlash. */
export function ImportReview({
  initial,
  onCommitted,
  onRestart,
}: {
  initial: ImportPreview;
  onCommitted: (result: ImportCommitResult) => void;
  onRestart: () => void;
}) {
  const toast = useToast();
  const [preview, setPreview] = useState(initial);
  const [mapping, setMapping] = useState<Mapping>(() => toMapping(initial));
  const [defaultRole, setDefaultRole] = useState(initial.defaultRole);
  const [skip, setSkip] = useState<Set<number>>(
    () => new Set(initial.rows.filter((row) => row.status === 'skipped').map((row) => row.rowNumber)),
  );
  const [checkedSkip, setCheckedSkip] = useState(() => [...skip].sort((a, b) => a - b).join());
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const checkedMapping = toMapping(preview);
  const mappingDirty =
    defaultRole !== preview.defaultRole || IMPORT_FIELDS.some((field) => mapping[field] !== checkedMapping[field]);
  const skipKey = [...skip].sort((a, b) => a - b).join();
  const hasNames = mapping.fullName !== null || (mapping.lastName !== null && mapping.firstName !== null);
  const body = () => ({ mapping, defaultRole, skipRows: [...skip].sort((a, b) => a - b) });

  const statuses = useMemo(
    () => new Map(preview.rows.map((row) => [row.rowNumber, effectiveStatus(row, skip)])),
    [preview.rows, skip],
  );
  const counts = useMemo(() => {
    const result: Record<RowStatus, number> = { ok: 0, warning: 0, error: 0, skipped: 0 };
    for (const status of statuses.values()) result[status] += 1;
    return result;
  }, [statuses]);
  const importable = counts.ok + counts.warning;
  const visible =
    filter === 'all' ? preview.rows : preview.rows.filter((row) => statuses.get(row.rowNumber) === filter);
  const pageRows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const recheck = useMutation({
    mutationFn: () => api.post<ImportPreview>(`/users/import/${preview.batchId}/preview`, body()),
    onSuccess: (result) => {
      setPreview(result);
      setMapping(toMapping(result));
      setDefaultRole(result.defaultRole);
      const skipped = new Set(result.rows.filter((row) => row.status === 'skipped').map((row) => row.rowNumber));
      setSkip(skipped);
      setCheckedSkip([...skipped].sort((a, b) => a - b).join());
      setPage(1);
    },
  });
  const downloadErrors = useMutation({
    mutationFn: async () => {
      // Server xato qatorlarni oxirgi tekshiruv sozlamalari bo‘yicha chiqaradi — avval sinxronlaymiz.
      if (skipKey !== checkedSkip) {
        await api.post<ImportPreview>(`/users/import/${preview.batchId}/preview`, body());
        setCheckedSkip(skipKey);
      }
      await downloadFile(`/users/import/${preview.batchId}/errors.xlsx`, 'import-xatolari.xlsx');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const commit = useMutation({
    mutationFn: () => api.post<ImportCommitResult>(`/users/import/${preview.batchId}/commit`, body()),
    onSuccess: (result) => {
      setConfirmOpen(false);
      onCommitted(result);
    },
  });

  const toggleSkip = (rowNumber: number, checked: boolean) => {
    setSkip((current) => {
      const next = new Set(current);
      if (checked) next.add(rowNumber);
      else next.delete(rowNumber);
      return next;
    });
  };
  const changeFilter = (value: Filter) => {
    setFilter(value);
    setPage(1);
  };

  const columnOptions = preview.headers.map((header, index) => ({
    value: String(index),
    label: `${columnLetter(index)} — ${header || '(sarlavhasiz)'}`,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Ustunlarni moslashtirish"
          description={`Fayl: ${preview.fileName}. Tizim sarlavhalarni avtomatik moslashtirdi — tekshirib chiqing.`}
          actions={
            <Button variant="ghost" size="sm" onClick={onRestart}>
              Boshqa fayl tanlash
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {IMPORT_FIELDS.map((field) => (
              <Field key={field} label={IMPORT_FIELD_LABELS[field]} hint={FIELD_HINTS[field]}>
                <Select
                  value={mapping[field] === null ? '' : String(mapping[field])}
                  onChange={(event) =>
                    setMapping((current) => ({
                      ...current,
                      [field]: event.target.value === '' ? null : Number(event.target.value),
                    }))
                  }
                >
                  <option value="">— ishlatilmaydi —</option>
                  {columnOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
            <Field label="Standart rol" hint="Rol ustuni bo‘lmasa yoki katak bo‘sh bo‘lsa qo‘llanadi.">
              <Select
                value={defaultRole}
                onChange={(event) => setDefaultRole(event.target.value === 'TEACHER' ? 'TEACHER' : 'STUDENT')}
              >
                <option value="STUDENT">{ROLE_LABELS.STUDENT}</option>
                <option value="TEACHER">{ROLE_LABELS.TEACHER}</option>
              </Select>
            </Field>
          </div>
          {!hasNames && (
            <Alert tone="warning">“F.I.Sh.” ustunini yoki alohida “Familiya” va “Ism” ustunlarini moslashtiring.</Alert>
          )}
          {recheck.isError && <Alert tone="danger">{errorMessage(recheck.error)}</Alert>}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={mappingDirty ? 'primary' : 'outline'}
              onClick={() => recheck.mutate()}
              loading={recheck.isPending}
              disabled={!hasNames}
              icon={<RefreshCw className="size-4" aria-hidden />}
            >
              Qayta tekshirish
            </Button>
            {mappingDirty && (
              <span className="text-sm text-amber-700">
                Moslashtirish o‘zgardi — natijani yangilash uchun qayta tekshiring.
              </span>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Jami qatorlar" value={preview.counts.total} />
        <Stat
          label="To‘g‘ri"
          value={counts.ok}
          tone={counts.ok ? 'success' : 'default'}
          icon={<CheckCircle2 className="size-4 text-emerald-700" aria-hidden />}
        />
        <Stat
          label="Ogohlantirish"
          value={counts.warning}
          tone={counts.warning ? 'warning' : 'default'}
          hint="Import qilinadi"
        />
        <Stat label="Xato" value={counts.error} tone={counts.error ? 'danger' : 'default'} hint="Import qilinmaydi" />
        <Stat label="O‘tkazib yuboriladi" value={counts.skipped} />
      </div>

      <Card>
        <CardHeader
          title="Qatorlarni ko‘rib chiqish"
          description="Keraksiz qatorni “O‘tkazish” belgisi bilan chiqarib tashlang. Xato qatorlar baribir import qilinmaydi."
          actions={
            <>
              {skip.size > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSkip(new Set())}>
                  Belgilarni tozalash
                </Button>
              )}
              {counts.error > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadErrors.mutate()}
                  loading={downloadErrors.isPending}
                  disabled={mappingDirty}
                  icon={<Download className="size-4" aria-hidden />}
                >
                  Xato qatorlarni yuklab olish
                </Button>
              )}
            </>
          }
        />
        <Tabs<Filter>
          className="px-3"
          value={filter}
          onChange={changeFilter}
          tabs={[
            { id: 'all', label: 'Barchasi', badge: <Badge>{preview.rows.length}</Badge> },
            { id: 'error', label: 'Xatolar', badge: <Badge tone="red">{counts.error}</Badge> },
            { id: 'warning', label: 'Ogohlantirishlar', badge: <Badge tone="amber">{counts.warning}</Badge> },
            { id: 'ok', label: 'To‘g‘ri', badge: <Badge tone="green">{counts.ok}</Badge> },
            { id: 'skipped', label: 'O‘tkaziladi', badge: <Badge>{counts.skipped}</Badge> },
          ]}
        />
        {pageRows.length === 0 ? (
          <EmptyState title="Bu turdagi qator yo‘q" />
        ) : (
          <Table caption="Import qatorlari">
            <THead>
              <tr>
                <TH className="w-24">O‘tkazish</TH>
                <TH>Qator</TH>
                <TH>F.I.Sh.</TH>
                <TH>Rol</TH>
                <TH>Sinf</TH>
                <TH>Login</TH>
                <TH>Holat</TH>
                <TH className="min-w-64">Izoh</TH>
              </tr>
            </THead>
            <tbody className={mappingDirty ? 'opacity-60' : undefined}>
              {pageRows.map((row) => {
                const status = statuses.get(row.rowNumber) ?? row.status;
                const name = fullName(row.resolved);
                return (
                  <TR
                    key={row.rowNumber}
                    className={
                      status === 'error'
                        ? 'bg-red-50/40'
                        : status === 'skipped'
                          ? 'bg-slate-50 text-slate-500'
                          : undefined
                    }
                  >
                    <TD>
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={skip.has(row.rowNumber)}
                        onChange={(event) => toggleSkip(row.rowNumber, event.target.checked)}
                        aria-label={`${row.rowNumber}-qatorni o‘tkazib yuborish`}
                      />
                    </TD>
                    <TD className="text-slate-500 tabular">{row.rowNumber}</TD>
                    <TD className="min-w-48 font-medium text-slate-900">
                      {name || <span className="text-slate-500">—</span>}
                    </TD>
                    <TD className="whitespace-nowrap">{row.resolved.role ? ROLE_LABELS[row.resolved.role] : '—'}</TD>
                    <TD className="whitespace-nowrap">{row.resolved.className ?? '—'}</TD>
                    <TD className="font-mono text-xs whitespace-nowrap">
                      {row.resolved.login ?? <span className="font-sans text-slate-500 italic">avtomatik</span>}
                    </TD>
                    <TD>
                      <Badge tone={IMPORT_STATUS_TONES[status]}>{IMPORT_STATUS_LABELS[status]}</Badge>
                    </TD>
                    <TD>
                      <RowNotes row={row} />
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
        <div className="border-t border-slate-100 px-5 py-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={visible.length} onChange={setPage} />
        </div>
      </Card>

      <Card className="border-brand-200">
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-medium text-slate-900">
              {importable > 0 ? `${importable} ta yangi hisob yaratiladi` : 'Import qilinadigan to‘g‘ri qator yo‘q'}
            </p>
            <p className="text-slate-500">
              Xato: {counts.error} ta, o‘tkazib yuboriladi: {counts.skipped} ta. Tasdiqlangach kirish ma’lumotlari fayli
              bir marta beriladi.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => setConfirmOpen(true)}
            disabled={importable === 0 || mappingDirty || recheck.isPending}
          >
            Tasdiqlash va yaratish
          </Button>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          commit.reset();
        }}
        onConfirm={() => commit.mutate()}
        title="Importni tasdiqlash"
        confirmLabel={`${importable} ta hisob yaratish`}
        loading={commit.isPending}
      >
        <div className="space-y-3">
          <p>
            <span className="font-medium text-slate-900">{importable} ta</span> yangi hisob yaratiladi. Xato qatorlar (
            {counts.error} ta) va o‘tkazib yuborilganlar ({counts.skipped} ta) import qilinmaydi.
          </p>
          <p>Keyingi oynada vaqtinchalik parollar yozilgan Excel faylini darhol yuklab oling — u qayta berilmaydi.</p>
          {commit.isError && <Alert tone="danger">{errorMessage(commit.error)}</Alert>}
        </div>
      </ConfirmDialog>
    </div>
  );
}
