'use client';

import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, CalendarClock, GraduationCap, Library, Radio, School, Users } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CATEGORIES, CATEGORY_LABELS, formatDate, formatMonth, formatPercent } from '@ijod/shared';
import { BarList } from '@/components/charts/bar-list';
import { ColumnChart } from '@/components/charts/column-chart';
import { SessionStateBadge } from '@/components/status';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { RatioText, Stat } from '@/components/ui/stat';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { LeadershipDashboard } from '@/lib/types';

function LinkTile({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-brand-500">
      {children}
    </Link>
  );
}

export default function ManagementDashboardPage() {
  const dashboard = useQuery({
    queryKey: ['dashboard', 'leadership'],
    queryFn: () => api.get<LeadershipDashboard>('/dashboard/leadership'),
    refetchInterval: 60_000,
  });

  if (dashboard.isPending) return <PageLoader />;
  if (dashboard.isError) return <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />;
  const data = dashboard.data;
  const pendingTotal = data.pending.portfolio + data.pending.schoolQuestions;

  return (
    <div>
      <PageHeader
        title="Rahbariyat ko‘rsatkichlari"
        description={`${data.academicYear ? `${data.academicYear.name} o‘quv yili` : 'Joriy o‘quv yili belgilanmagan'} · yakunlangan (yopilgan) sessiyalar bo‘yicha. Boshlamaganlar o‘rtachaga 0 sifatida qo‘shilmaydi.`}
      />
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="O‘quvchilar"
            value={data.totals.students}
            icon={<GraduationCap className="size-4" />}
            hint={`${data.totals.classes} ta sinf · ${data.totals.teachers} o‘qituvchi`}
          />
          <LinkTile href="/management/sessions">
            <Stat
              label="Sessiyalar"
              value={data.totals.sessions}
              icon={<CalendarClock className="size-4" />}
              hint={
                data.totals.openSessions > 0 ? `Hozir ochiq: ${data.totals.openSessions}` : 'Hozir ochiq sessiya yo‘q'
              }
            />
          </LinkTile>
          <Stat
            label="Testda ishtirok"
            value={formatPercent(data.participation.percent)}
            icon={<Users className="size-4" />}
            hint={`${data.participation.numerator} / ${data.participation.denominator} tayinlovda yakunlangan ish`}
          />
          <Stat
            label="Tugallanmagan ishlar"
            value={data.unfinished.inProgress + data.unfinished.underReview}
            icon={<Radio className="size-4" />}
            hint={`Ishlanmoqda ${data.unfinished.inProgress} · tekshirilmoqda ${data.unfinished.underReview}`}
          />
        </div>

        {pendingTotal > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.pending.portfolio > 0 && (
              <LinkTile href="/portfolio/review">
                <Stat
                  label="Portfolio tasdiqlash navbati"
                  value={data.pending.portfolio}
                  tone="warning"
                  icon={<BadgeCheck className="size-4" />}
                  hint="Tekshiruvga yuborilgan yozuvlar"
                />
              </LinkTile>
            )}
            {data.pending.schoolQuestions > 0 && (
              <LinkTile href="/management/questions">
                <Stat
                  label="Maktab banki so‘rovlari"
                  value={data.pending.schoolQuestions}
                  tone="warning"
                  icon={<Library className="size-4" />}
                  hint="Metodik tekshiruv kutilmoqda"
                />
              </LinkTile>
            )}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardBody>
              <ColumnChart
                title="Umumiy o‘zlashtirish oylar bo‘yicha (%)"
                valueLabel="O‘zlashtirish"
                labelHeader="Oy"
                max={100}
                tickFormat={(value) => `${value}%`}
                emptyText="Hali yakunlangan ish yo‘q"
                data={data.trend.map((point) => ({
                  key: point.month,
                  label: formatMonth(point.month, false),
                  value: point.percent,
                  display: formatPercent(point.percent),
                  detail: point.month.slice(0, 4),
                }))}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Kategoriyalar bo‘yicha o‘zlashtirish"
              description="Σ olingan / Σ maksimal ball, barcha yakunlangan ishlar."
            />
            <CardBody>
              <BarList
                caption="Kategoriyalar bo‘yicha o‘zlashtirish"
                emptyText="Hali yakunlangan ish yo‘q"
                items={CATEGORIES.filter((category) => data.categoryMastery[category]).map((category) => ({
                  key: category,
                  label: CATEGORY_LABELS[category],
                  ratio: data.categoryMastery[category]!,
                }))}
              />
            </CardBody>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_26rem]">
          <Card>
            <CardHeader
              title="Sinflar kesimida"
              description="Tartib — sinf darajasi bo‘yicha. Ko‘rsatkichlar o‘qituvchilar reytingi sifatida ishlatilmaydi."
            />
            {data.classes.length === 0 ? (
              <EmptyState icon={School} title="Yopilgan sessiyalar hali yo‘q" />
            ) : (
              <Table caption="Sinflar kesimida">
                <THead>
                  <tr>
                    <TH>Sinf</TH>
                    <TH className="text-right">Sessiyalar</TH>
                    <TH>Qatnashish</TH>
                    <TH>Umumiy o‘zlashtirish</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.classes.map((item) => (
                    <TR key={item.classId}>
                      <TD className="font-medium">{item.name}</TD>
                      <TD className="text-right tabular">{item.sessions}</TD>
                      <TD className="whitespace-nowrap">
                        <RatioText ratio={item.participation} />
                      </TD>
                      <TD className="whitespace-nowrap">
                        <RatioText ratio={item.mastery} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Fanlar bo‘yicha o‘zlashtirish" />
              <CardBody>
                <BarList
                  caption="Fanlar bo‘yicha o‘zlashtirish"
                  emptyText="Hali yakunlangan ish yo‘q"
                  items={data.subjects.map((item) => ({
                    key: item.subjectId,
                    label: item.name,
                    sublabel: `${item.sessions} sessiya`,
                    ratio: item.mastery,
                  }))}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Qiyin mavzular" description="So‘nggi 60 kun, to‘g‘ri javob ulushi eng past." />
              <CardBody>
                <BarList
                  caption="Qiyin mavzular"
                  emptyText="Tahlil uchun javoblar hali yetarli emas."
                  items={data.difficultTopics.map((topic) => ({
                    key: `${topic.subject}-${topic.topic}`,
                    label: topic.topic,
                    sublabel: topic.subject,
                    ratio: topic.correctRate,
                  }))}
                />
              </CardBody>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader
            title="So‘nggi sessiyalar"
            actions={
              <Link href="/management/sessions" className="text-sm text-brand-700 hover:underline">
                Barchasi
              </Link>
            }
          />
          {data.recentSessions.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Sessiyalar yo‘q" />
          ) : (
            <Table caption="So‘nggi sessiyalar">
              <THead>
                <tr>
                  <TH>Sessiya</TH>
                  <TH>Holat</TH>
                  <TH>Qatnashish</TH>
                  <TH>Umumiy o‘zlashtirish</TH>
                </tr>
              </THead>
              <tbody>
                {data.recentSessions.map((session) => (
                  <TR key={session.id}>
                    <TD>
                      <Link
                        href={`/management/sessions/${session.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {session.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {session.subject.name} · {session.conductor.fullName} · {formatDate(session.startsAt)}
                      </p>
                    </TD>
                    <TD>
                      <SessionStateBadge state={session.state} />
                    </TD>
                    <TD className="whitespace-nowrap">
                      <RatioText ratio={session.participation} />
                    </TD>
                    <TD className="whitespace-nowrap">
                      <RatioText ratio={session.mastery} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
