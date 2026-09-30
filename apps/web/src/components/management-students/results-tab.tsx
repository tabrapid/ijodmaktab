'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { CATEGORY_LABELS, categoryEntries, formatDate, formatPercent, formatPoints } from '@ijod/shared';
import { BarList } from '@/components/charts/bar-list';
import { ColumnChart } from '@/components/charts/column-chart';
import { ParticipationBadge } from '@/components/status';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Stat } from '@/components/ui/stat';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { StudentResultsView } from '@/lib/types';
import { studentResultsKey } from './queries';

/**
 * “Natijalar” yorlig‘i: o‘quvchining test natijalari (GET /students/:id/results — o‘qituvchi sahifasi bilan
 * bir xil so‘rov): qatnashish, o‘zlashtirish, vaqt bo‘yicha natijalar, kategoriyalar va sessiyalar jadvali.
 */
export function StudentResultsPanel({ studentId, approvedCount }: { studentId: string; approvedCount: number }) {
  const overview = useQuery({
    queryKey: studentResultsKey(studentId),
    queryFn: () => api.get<StudentResultsView>(`/students/${studentId}/results`),
  });

  if (overview.isPending) return <PageLoader />;
  if (overview.isError) return <ErrorState error={overview.error} onRetry={() => overview.refetch()} />;
  const { summary, results } = overview.data;
  const graded = results.filter((item) => item.percent !== null);
  const timeline = [...graded]
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(-12)
    .map((item) => ({
      key: item.sessionId,
      label: formatDate(item.startsAt).slice(0, 5),
      value: item.percent,
      display: formatPercent(item.percent),
      detail: `${item.subject.name}: ${item.title}`,
    }));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Qatnashish"
          value={formatPercent(summary.participation.percent)}
          hint={`${summary.participation.numerator} / ${summary.participation.denominator} yopilgan sessiyada yakunlagan`}
        />
        <Stat
          label="Umumiy o‘zlashtirish"
          value={formatPercent(summary.mastery.percent)}
          hint={`${formatPoints(summary.mastery.numerator)} / ${formatPoints(summary.mastery.denominator)} ball`}
        />
        <Stat label="Tasdiqlangan yutuqlar" value={approvedCount} hint="Faqat tasdiqlangan portfolio yozuvlari" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardBody>
            <ColumnChart
              title="Natijalar vaqt bo‘yicha (so‘nggi 12 ta, %)"
              valueLabel="Foiz"
              labelHeader="Sana"
              data={timeline}
              max={100}
              tickFormat={(value) => `${value}%`}
              emptyText="Hali baholangan natija yo‘q"
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Kategoriyalar bo‘yicha"
            description="Barcha baholangan ishlar: Σ olingan / Σ maksimal ball."
          />
          <CardBody>
            <BarList
              caption="Kategoriyalar bo‘yicha o‘zlashtirish"
              items={summary.categories.map((item) => ({
                key: item.category,
                label: CATEGORY_LABELS[item.category],
                ratio: item,
              }))}
              emptyText="Hali baholangan natija yo‘q"
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Test natijalari"
          description="O‘quvchi tayinlangan barcha sessiyalar (bekor qilinganlaridan tashqari), yangilari yuqorida."
        />
        {results.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Natija yo‘q"
            description="O‘quvchiga test sessiyasi tayinlanganda natijalari shu yerda ko‘rinadi."
          />
        ) : (
          <Table caption="Test natijalari">
            <THead>
              <tr>
                <TH>Sessiya</TH>
                <TH>Sana</TH>
                <TH>Holat</TH>
                <TH className="text-right">Ball</TH>
                <TH className="text-right">Foiz</TH>
                <TH>Kategoriyalar</TH>
              </tr>
            </THead>
            <tbody>
              {results.map((item) => (
                <TR key={item.sessionId}>
                  <TD className="min-w-48">
                    <Link
                      href={`/management/sessions/${item.sessionId}?tab=results`}
                      className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                    >
                      {item.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {item.subject.name}
                      {item.className && ` · ${item.className}`}
                      {item.attemptsCount > 1 && ` · ${item.attemptsCount} urinish`}
                    </p>
                  </TD>
                  <TD className="whitespace-nowrap text-slate-600 tabular">{formatDate(item.startsAt)}</TD>
                  <TD>
                    <ParticipationBadge status={item.status} />
                  </TD>
                  <TD className="text-right whitespace-nowrap tabular">
                    {item.score === null ? '—' : `${formatPoints(item.score)} / ${formatPoints(item.maxScore)}`}
                  </TD>
                  <TD className="text-right font-medium tabular">{formatPercent(item.percent)}</TD>
                  <TD className="min-w-40 text-sm text-slate-600">
                    {categoryEntries(item.categories)
                      .map(([category, value]) => `${CATEGORY_LABELS[category]} ${formatPercent(value.percent)}`)
                      .join(' · ') || '—'}
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
