'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Award, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ACHIEVEMENT_LEVEL_LABELS,
  CATEGORY_LABELS,
  categoryEntries,
  formatDate,
  formatDateTime,
  formatInternalId,
  formatPercent,
  formatPoints,
} from '@ijod/shared';
import { BarList } from '@/components/charts/bar-list';
import { ColumnChart } from '@/components/charts/column-chart';
import { ParticipationBadge, UserStatusBadge } from '@/components/status';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Stat } from '@/components/ui/stat';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { Page, PortfolioItemView, StudentResultsView } from '@/lib/types';

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const overview = useQuery({
    queryKey: ['student-results', id],
    queryFn: () => api.get<StudentResultsView>(`/students/${id}/results`),
  });
  const portfolio = useQuery({
    queryKey: ['portfolio', { ownerId: id, status: 'APPROVED' }],
    queryFn: () => api.get<Page<PortfolioItemView>>(`/portfolio?ownerId=${id}&status=APPROVED&pageSize=50`),
  });

  if (overview.isPending) return <PageLoader />;
  if (overview.isError) return <ErrorState error={overview.error} onRetry={() => overview.refetch()} />;
  const { student, summary, results } = overview.data;
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
    <div>
      <PageHeader
        back={
          <Link
            href={student.classId ? `/teacher/classes/${student.classId}` : '/teacher/classes'}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {student.className ?? 'Sinflarim'}
          </Link>
        }
        title={student.fullName}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="tabular">ID {formatInternalId(student.internalId)}</span>
            {student.className && <span>· {student.className}</span>}
            <UserStatusBadge status={student.status} />
            <span>· oxirgi faollik: {student.lastActiveAt ? formatDateTime(student.lastActiveAt) : '—'}</span>
          </span>
        }
      />

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
          <Stat
            label="Tasdiqlangan yutuqlar"
            value={portfolio.data?.total ?? '—'}
            hint="Faqat tasdiqlangan portfolio yozuvlari"
          />
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
            description="Siz ko‘rish huquqiga ega sessiyalar (o‘z sessiyalaringiz va sinf rahbari sifatida — sinfingizdagi sessiyalar)."
          />
          {results.length === 0 ? (
            <EmptyState title="Natija yo‘q" />
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
                    <TD>
                      <Link
                        href={`/teacher/sessions/${item.sessionId}?tab=results`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {item.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {item.subject.name}
                        {item.className && ` · ${item.className}`}
                        {item.attemptsCount > 1 && ` · ${item.attemptsCount} urinish`}
                      </p>
                    </TD>
                    <TD className="whitespace-nowrap text-slate-600">{formatDate(item.startsAt)}</TD>
                    <TD>
                      <ParticipationBadge status={item.status} />
                    </TD>
                    <TD className="text-right whitespace-nowrap tabular">
                      {item.score === null ? '—' : `${formatPoints(item.score)} / ${formatPoints(item.maxScore)}`}
                    </TD>
                    <TD className="text-right font-medium tabular">{formatPercent(item.percent)}</TD>
                    <TD className="text-sm text-slate-600">
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

        <Card>
          <CardHeader
            title="Tasdiqlangan yutuqlar"
            description="Tasdiqlanmagan yozuvlar bu ro‘yxatga kirmaydi."
            actions={
              <Link
                href={`/portfolio/students/${id}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
              >
                <FolderOpen className="size-4" aria-hidden />
                To‘liq portfolio
              </Link>
            }
          />
          {portfolio.isPending ? (
            <PageLoader />
          ) : portfolio.isError ? (
            <CardBody>
              <ErrorState error={portfolio.error} onRetry={() => portfolio.refetch()} />
            </CardBody>
          ) : portfolio.data.items.length === 0 ? (
            <EmptyState icon={Award} title="Tasdiqlangan yutuq yo‘q" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {portfolio.data.items.map((item) => (
                <li key={item.id} className="px-5 py-3">
                  <Link href={`/portfolio/${item.id}`} className="font-medium text-slate-900 hover:underline">
                    {item.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {[
                      item.typeLabel,
                      item.level ? ACHIEVEMENT_LEVEL_LABELS[item.level] : null,
                      item.result,
                      item.date ? formatDate(item.date) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
