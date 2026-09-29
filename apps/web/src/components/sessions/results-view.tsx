'use client';

import { Check, FilterX, Minus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  CATEGORY_LABELS,
  PARTICIPATION_STATUSES,
  PARTICIPATION_STATUS_LABELS,
  formatDateTime,
  formatDuration,
  formatInternalId,
  formatPercent,
  formatPoints,
  type Category,
  type ClassMetrics,
  type ParticipationStatus,
} from '@ijod/shared';
import { ColumnChart } from '@/components/charts/column-chart';
import { ParticipationBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { RatioText, Stat } from '@/components/ui/stat';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import type { ResultRow, SessionDetail, SessionResults } from '@/lib/types';
import { ExportButtons } from './export-buttons';
import { EMPTY_RESULT_FILTERS, hasActiveFilters, useSessionResults, type ResultFilterState } from './use-session';

const STATUS_PRESETS: { id: string; label: string; statuses: ParticipationStatus[] }[] = [
  { id: '', label: 'Barchasi', statuses: [] },
  { id: 'final', label: 'Yakunlaganlar', statuses: ['SUBMITTED', 'EXPIRED'] },
  ...PARTICIPATION_STATUSES.map((status) => ({
    id: status,
    label: PARTICIPATION_STATUS_LABELS[status],
    statuses: [status],
  })),
];

const presetOf = (statuses: ParticipationStatus[]) =>
  STATUS_PRESETS.find(
    (preset) =>
      preset.statuses.length === statuses.length && preset.statuses.every((status) => statuses.includes(status)),
  )?.id ?? '';

type SortKey = 'name' | 'percent-desc' | 'percent-asc' | 'submitted' | `cat-asc:${Category}` | `cat-desc:${Category}`;

/** Bo‘sh qiymatlar doim oxirida; teng qiymatlar server tartibida (sinf, ism, ichki ID) qoladi. */
function sortRows(rows: ResultRow[], key: SortKey) {
  if (key === 'name') return rows;
  const pick = (row: ResultRow): number | null => {
    if (key === 'submitted') return row.submittedAt ? new Date(row.submittedAt).getTime() : null;
    if (key.startsWith('cat-')) {
      const category = key.split(':')[1] as Category;
      return row.score === null ? null : (row.categories[category]?.percent ?? null);
    }
    return row.percent;
  };
  const direction = key === 'percent-desc' || key.startsWith('cat-desc') ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = pick(a);
    const right = pick(b);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return (left - right) * direction;
  });
}

export function MetricTiles({ metrics }: { metrics: ClassMetrics }) {
  const { overall } = metrics;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Qatnashish"
        value={formatPercent(metrics.participation.percent)}
        hint={`${metrics.participation.numerator} / ${metrics.participation.denominator} nafar yakunlagan`}
      />
      <Stat
        label="Umumiy o‘zlashtirish"
        value={formatPercent(overall.mastery.percent)}
        hint={`${formatPoints(overall.mastery.numerator)} / ${formatPoints(overall.mastery.denominator)} ball (Σ olingan / Σ maksimal)`}
      />
      <Stat
        label="O‘rtacha natija"
        value={formatPercent(overall.meanPercent)}
        hint={`Mediana ${formatPercent(overall.medianPercent)} · o‘rtacha ball ${formatPoints(overall.meanScore)}`}
      />
      {metrics.pass && metrics.passPercent !== null ? (
        <Stat
          label={`O‘tish chegarasi (${formatPercent(metrics.passPercent, 0)})`}
          value={formatPercent(metrics.pass.ofGraded.percent)}
          hint={`${metrics.pass.ofGraded.numerator} / ${metrics.pass.ofGraded.denominator} yakunlagandan · tayinlanganlardan ${formatPercent(metrics.pass.ofAssigned.percent)}`}
        />
      ) : (
        <Stat
          label="Eng past – eng yuqori"
          value={`${formatPercent(overall.minPercent)} – ${formatPercent(overall.maxPercent)}`}
          hint={`${metrics.graded} ta baholangan ish`}
        />
      )}
    </div>
  );
}

export function CategoryTable({
  results,
  metrics,
}: {
  results: Pick<SessionResults, 'categories'>;
  metrics: ClassMetrics;
}) {
  if (results.categories.length === 0) return null;
  return (
    <Table caption="Kategoriyalar bo‘yicha o‘zlashtirish">
      <THead>
        <tr>
          <TH>Kategoriya</TH>
          <TH className="text-right">Savollar</TH>
          <TH>O‘zlashtirish</TH>
          <TH className="whitespace-normal">Mezonga yetgan: yakunlaganlardan</TH>
          <TH className="whitespace-normal">Mezonga yetgan: tayinlanganlardan</TH>
        </tr>
      </THead>
      <tbody>
        {results.categories.map((entry) => {
          const reach = metrics.thresholdReach[entry.category];
          return (
            <TR key={entry.category}>
              <TD className="font-medium">{CATEGORY_LABELS[entry.category]}</TD>
              <TD className="text-right whitespace-nowrap tabular">
                {entry.count} ta · {formatPoints(entry.max)} ball
              </TD>
              <TD className="whitespace-nowrap">
                <RatioText ratio={metrics.categoryMastery[entry.category]} />
              </TD>
              <TD className="whitespace-nowrap">
                <RatioText ratio={reach?.ofGraded} />
              </TD>
              <TD className="whitespace-nowrap">
                <RatioText ratio={reach?.ofAssigned} />
              </TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}

export function DistributionChart({ metrics }: { metrics: ClassMetrics }) {
  const graded = metrics.graded;
  const data = metrics.overall.distribution.map((bucket) => ({
    key: `${bucket.from}`,
    label: `${bucket.from}–${bucket.to}`,
    value: bucket.count,
    display: `${bucket.count} ta`,
    detail: graded ? `${formatPercent((bucket.count / graded) * 100)} ishlar` : undefined,
  }));
  return (
    <ColumnChart
      title="Natijalar taqsimoti (foiz oraliqlari)"
      valueLabel="O‘quvchilar"
      data={graded ? data : []}
      emptyText="Hali baholangan ish yo‘q"
      integer
    />
  );
}

function StatusCounts({ metrics }: { metrics: ClassMetrics }) {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
      {PARTICIPATION_STATUSES.map((status) => (
        <span key={status}>
          {PARTICIPATION_STATUS_LABELS[status]}:{' '}
          <span className="font-medium text-slate-900 tabular">{metrics.statusCounts[status]}</span>
        </span>
      ))}
    </p>
  );
}

export function ResultsView({
  session,
  studentBase = '/teacher/students',
}: {
  session: SessionDetail;
  studentBase?: string;
}) {
  const [filters, setFilters] = useState<ResultFilterState>(EMPTY_RESULT_FILTERS);
  const [sort, setSort] = useState<SortKey>('name');
  const [selected, setSelected] = useState<string[]>([]);
  const results = useSessionResults(session.id, filters);
  // Filtr o‘zgarsa tanlov bekor bo‘ladi — ko‘rinmayotgan qatorlar eksportga tushib qolmasin.
  const set = (patch: Partial<ResultFilterState>) => {
    setSelected([]);
    setFilters((current) => ({ ...current, ...patch }));
  };
  const rows = useMemo(() => sortRows(results.data?.rows ?? [], sort), [results.data, sort]);
  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.studentId));

  if (results.isPending) return <PageLoader />;
  if (results.isError) return <ErrorState error={results.error} onRetry={() => results.refetch()} />;
  const data = results.data;
  const { metrics } = data;
  const categoryOrder = data.categories.map((entry) => entry.category);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Filtrlar"
          description="Ko‘rsatkichlar, jadval va eksport joriy filtr bo‘yicha hisoblanadi."
          actions={<ExportButtons sessionId={session.id} filters={filters} studentIds={selected} />}
        />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Qidiruv">
            <Input
              value={filters.q}
              onChange={(event) => set({ q: event.target.value })}
              placeholder="Ism yoki ichki ID"
            />
          </Field>
          <Field label="Holat">
            <Select
              value={presetOf(filters.statuses)}
              onChange={(event) =>
                set({ statuses: STATUS_PRESETS.find((preset) => preset.id === event.target.value)?.statuses ?? [] })
              }
            >
              {STATUS_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sinf">
            <Select
              value={filters.classIds[0] ?? ''}
              onChange={(event) => set({ classIds: event.target.value ? [event.target.value] : [] })}
            >
              <option value="">Barchasi</option>
              {session.classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Foiz (dan)">
            <Input
              type="number"
              min={0}
              max={100}
              value={filters.minPercent}
              onChange={(event) => set({ minPercent: event.target.value })}
            />
          </Field>
          <Field label="Foiz (gacha)">
            <Input
              type="number"
              min={0}
              max={100}
              value={filters.maxPercent}
              onChange={(event) => set({ maxPercent: event.target.value })}
            />
          </Field>
          <Field label="Kategoriya">
            <Select
              value={filters.category}
              onChange={(event) => set({ category: event.target.value as ResultFilterState['category'] })}
            >
              <option value="">Tanlanmagan</option>
              {categoryOrder.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kategoriya foizi (dan)">
            <Input
              type="number"
              min={0}
              max={100}
              value={filters.categoryMinPercent}
              disabled={!filters.category}
              onChange={(event) => set({ categoryMinPercent: event.target.value })}
            />
          </Field>
          <Field label="Kategoriya foizi (gacha)">
            <Input
              type="number"
              min={0}
              max={100}
              value={filters.categoryMaxPercent}
              disabled={!filters.category}
              onChange={(event) => set({ categoryMaxPercent: event.target.value })}
            />
          </Field>
          <div className="flex items-end">
            <Button
              variant="ghost"
              icon={<FilterX className="size-4" />}
              onClick={() => set(EMPTY_RESULT_FILTERS)}
              disabled={!hasActiveFilters(filters)}
            >
              Filtrlarni tozalash
            </Button>
          </div>
        </CardBody>
      </Card>

      {data.limitedToClasses && (
        <Alert tone="info">Siz sinf rahbari sifatida faqat o‘z sinfingiz o‘quvchilari natijalarini ko‘rasiz.</Alert>
      )}
      {session.state === 'OPEN' && (
        <Alert tone="info">Sessiya hali ochiq: ko‘rsatkichlar yakunlangan ishlar bo‘yicha va o‘zgarib boradi.</Alert>
      )}

      <MetricTiles metrics={metrics} />
      <StatusCounts metrics={metrics} />
      <p className="text-xs text-slate-500">
        Boshlamaganlar o‘rtacha va o‘zlashtirishga 0 sifatida qo‘shilmaydi; nol olgan yakunlangan ish esa haqiqiy 0
        sifatida hisoblanadi. Kategoriya chegarasi: {formatPercent(metrics.thresholdPercent, 0)}.
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Kategoriyalar" />
          <CategoryTable results={data} metrics={metrics} />
        </Card>
        <Card>
          <CardBody>
            <DistributionChart metrics={metrics} />
          </CardBody>
        </Card>
      </div>

      {data.byClass.length > 1 && (
        <Card>
          <CardHeader title="Sinflar kesimida" />
          <Table caption="Sinflar kesimida">
            <THead>
              <tr>
                <TH>Sinf</TH>
                <TH>Qatnashish</TH>
                <TH>Umumiy o‘zlashtirish</TH>
                <TH className="text-right">O‘rtacha</TH>
                <TH className="text-right">Mediana</TH>
              </tr>
            </THead>
            <tbody>
              {data.byClass.map((item) => (
                <TR key={item.classId}>
                  <TD className="font-medium">{item.className}</TD>
                  <TD className="whitespace-nowrap">
                    <RatioText ratio={item.metrics.participation} />
                  </TD>
                  <TD className="whitespace-nowrap">
                    <RatioText ratio={item.metrics.overall.mastery} />
                  </TD>
                  <TD className="text-right tabular">{formatPercent(item.metrics.overall.meanPercent)}</TD>
                  <TD className="text-right tabular">{formatPercent(item.metrics.overall.medianPercent)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader
          title={`O‘quvchilar natijalari (${rows.length})`}
          description={`${data.session.testTitle} · ${data.session.testVersionNo}-versiya · baholash versiyasi ${data.session.gradingVersion}`}
          actions={
            <>
              {selected.length > 0 && (
                <span className="text-sm text-slate-600">
                  Tanlangan: <span className="font-medium tabular">{selected.length}</span>{' '}
                  <button type="button" className="text-brand-700 underline" onClick={() => setSelected([])}>
                    bekor qilish
                  </button>
                </span>
              )}
              <div className="w-56">
                <Select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Saralash">
                  <option value="name">Sinf va ism bo‘yicha</option>
                  <option value="percent-desc">Umumiy foiz: yuqoridan</option>
                  <option value="percent-asc">Umumiy foiz: pastdan</option>
                  {categoryOrder.map((category) => (
                    <option key={`asc-${category}`} value={`cat-asc:${category}`}>
                      {CATEGORY_LABELS[category]}: pastdan
                    </option>
                  ))}
                  {categoryOrder.map((category) => (
                    <option key={`desc-${category}`} value={`cat-desc:${category}`}>
                      {CATEGORY_LABELS[category]}: yuqoridan
                    </option>
                  ))}
                  <option value="submitted">Topshirish vaqti</option>
                </Select>
              </div>
            </>
          }
        />
        {rows.length === 0 ? (
          <EmptyState title="Filtr bo‘yicha o‘quvchi topilmadi" />
        ) : (
          <Table caption="O‘quvchilar natijalari">
            <THead>
              <tr>
                <TH className="w-8">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.studentId))}
                    aria-label="Barcha qatorlarni tanlash"
                  />
                </TH>
                <TH>O‘quvchi</TH>
                <TH>Holat</TH>
                <TH className="text-right">Ball</TH>
                <TH className="text-right">Foiz</TH>
                {categoryOrder.map((category) => (
                  <TH key={category} className="text-right">
                    {CATEGORY_LABELS[category]}
                  </TH>
                ))}
                {data.session.passPercent !== null && <TH>O‘tdi</TH>}
                <TH className="text-right">Sarflangan vaqt</TH>
                <TH>Topshirilgan</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((row) => (
                <TR key={row.studentId} className={selected.includes(row.studentId) ? 'bg-brand-50/50' : undefined}>
                  <TD>
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={selected.includes(row.studentId)}
                      onChange={() => toggle(row.studentId)}
                      aria-label={`${row.fullName}ni tanlash`}
                    />
                  </TD>
                  <TD className="min-w-52">
                    <Link
                      href={`${studentBase}/${row.studentId}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {row.fullName}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {formatInternalId(row.internalId)}
                      {row.className && ` · ${row.className}`}
                      {row.attemptsCount > 1 && ` · ${row.attemptNo}/${row.attemptsCount}-urinish hisobga olindi`}
                    </p>
                  </TD>
                  <TD>
                    <ParticipationBadge status={row.status} />
                  </TD>
                  <TD className="text-right whitespace-nowrap tabular">
                    {row.score === null ? '—' : `${formatPoints(row.score)} / ${formatPoints(row.maxScore)}`}
                  </TD>
                  <TD className="text-right font-medium tabular">{formatPercent(row.percent)}</TD>
                  {categoryOrder.map((category) => {
                    const value = row.categories[category];
                    return (
                      <TD key={category} className="text-right whitespace-nowrap tabular">
                        {value && row.score !== null ? (
                          <span className="inline-flex items-center gap-1">
                            {formatPercent(value.percent)}
                            {value.reached ? (
                              <Check className="size-3.5 text-emerald-700" aria-label="chegaraga yetdi" />
                            ) : (
                              <Minus className="size-3.5 text-slate-400" aria-label="chegaraga yetmadi" />
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TD>
                    );
                  })}
                  {data.session.passPercent !== null && (
                    <TD>{row.passed === null ? '—' : row.passed ? 'Ha' : 'Yo‘q'}</TD>
                  )}
                  <TD className="text-right tabular">
                    {row.durationSeconds === null ? '—' : formatDuration(row.durationSeconds)}
                  </TD>
                  <TD className="whitespace-nowrap text-slate-600">
                    {row.submittedAt ? formatDateTime(row.submittedAt) : '—'}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
