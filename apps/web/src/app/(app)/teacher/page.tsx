'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CalendarPlus,
  FilePlus2,
  FileText,
  Library,
  Radio,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatHumanDateTime } from '@ijod/shared';
import { BarList } from '@/components/charts/bar-list';
import { sessionTimeRange } from '@/components/sessions/session-list';
import { SessionStateBadge } from '@/components/status';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { RatioText, Stat } from '@/components/ui/stat';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import type { TeacherDashboard } from '@/lib/types';

export default function TeacherHomePage() {
  const { data: me } = useMe();
  const dashboard = useQuery({
    queryKey: ['dashboard', 'teacher'],
    queryFn: () => api.get<TeacherDashboard>('/dashboard/teacher'),
    refetchInterval: 30_000,
  });
  const homeroom = (me?.homeroomClassIds.length ?? 0) > 0;

  return (
    <div>
      <PageHeader
        title={me ? `Assalomu alaykum, ${me.firstName}!` : 'Bosh sahifa'}
        description={`Bugun ${formatDate(new Date())}. Bugungi sessiyalar, so‘nggi natijalar va qiyin mavzular.`}
        actions={
          <>
            <ButtonLink href="/teacher/sessions/new" icon={<CalendarPlus className="size-4" />}>
              Yangi sessiya
            </ButtonLink>
            <ButtonLink href="/teacher/tests" variant="outline" icon={<FilePlus2 className="size-4" />}>
              Test yaratish
            </ButtonLink>
          </>
        }
      />
      {dashboard.isPending ? (
        <PageLoader />
      ) : dashboard.isError ? (
        <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Bugungi sessiyalar"
              value={dashboard.data.today.length}
              icon={<Radio className="size-4" />}
              hint="Bugun boshlanadigan yoki davom etayotgan"
            />
            <Stat
              label="Yaqin 7 kunda"
              value={dashboard.data.upcomingCount}
              icon={<CalendarClock className="size-4" />}
              hint="Rejalashtirilgan sessiyalar"
            />
            <Link
              href="/teacher/tests"
              className="block rounded-xl *:transition-colors hover:*:border-brand-300 focus-visible:outline-2"
            >
              <Stat
                label="Qoralama testlar"
                value={dashboard.data.draftTests}
                icon={<FileText className="size-4" />}
                hint="Tugallanmagan test shablonlari"
              />
            </Link>
            {homeroom ? (
              <Link
                href="/portfolio/review"
                className="block rounded-xl *:transition-colors hover:*:border-brand-300 focus-visible:outline-2"
              >
                <Stat
                  label="Portfolio tasdiqlash"
                  value={dashboard.data.pendingReview}
                  tone={dashboard.data.pendingReview > 0 ? 'warning' : 'default'}
                  icon={<BadgeCheck className="size-4" />}
                  hint="Sinfingiz o‘quvchilari yuborgan yozuvlar"
                />
              </Link>
            ) : (
              <Link
                href="/teacher/questions"
                className="block rounded-xl *:transition-colors hover:*:border-brand-300 focus-visible:outline-2"
              >
                <Stat
                  label="Savollar banki"
                  value={<Library className="size-7 text-slate-400" aria-hidden />}
                  hint="Savollarni qayta ishlating"
                />
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="space-y-6">
              <Card>
                <CardHeader title="Bugungi va davom etayotgan sessiyalar" />
                {dashboard.data.today.length === 0 ? (
                  <EmptyState
                    icon={CalendarClock}
                    title="Bugun sessiya yo‘q"
                    description="O‘z testingizni yoki maktab test bankidagi testni tanlab, sinfga sessiya belgilang — o‘quvchilar kod bilan kiradi."
                    action={
                      <ButtonLink href="/teacher/sessions/new" size="sm" icon={<CalendarPlus className="size-4" />}>
                        Yangi sessiya
                      </ButtonLink>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {dashboard.data.today.map((session) => (
                      <li key={session.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/teacher/sessions/${session.id}`}
                              className="font-medium text-slate-900 hover:underline"
                            >
                              {session.title}
                            </Link>
                            <SessionStateBadge state={session.state} />
                          </p>
                          <p className="mt-0.5 text-sm text-slate-500">
                            {session.subject.name} ·{' '}
                            {session.classes.map((item) => item.name).join(', ') || 'alohida o‘quvchilar'} ·{' '}
                            {sessionTimeRange(session.startsAt, session.endsAt)}
                          </p>
                          <p className="mt-0.5 text-sm text-slate-600 tabular">
                            Yakunlagan {session.finishedCount} / {session.assignedCount}
                            {session.inProgressCount > 0 && ` · ishlamoqda ${session.inProgressCount}`}
                          </p>
                        </div>
                        <ButtonLink
                          href={`/teacher/sessions/${session.id}${session.state === 'OPEN' ? '?tab=live' : ''}`}
                          size="sm"
                          variant={session.state === 'OPEN' ? 'primary' : 'outline'}
                          icon={
                            session.state === 'OPEN' ? <Radio className="size-4" /> : <ArrowRight className="size-4" />
                          }
                        >
                          {session.state === 'OPEN' ? 'Jonli kuzatuv' : 'Ochish'}
                        </ButtonLink>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader
                  title="So‘nggi yakunlangan sessiyalar"
                  actions={
                    <Link href="/teacher/sessions" className="text-sm text-brand-700 hover:underline">
                      Barchasi
                    </Link>
                  }
                />
                {dashboard.data.recent.length === 0 ? (
                  <EmptyState title="Hali yakunlangan sessiya yo‘q" />
                ) : (
                  <Table caption="So‘nggi yakunlangan sessiyalar">
                    <THead>
                      <tr>
                        <TH>Sessiya</TH>
                        <TH>Qatnashish</TH>
                        <TH>Umumiy o‘zlashtirish</TH>
                      </tr>
                    </THead>
                    <tbody>
                      {dashboard.data.recent.map((session) => (
                        <TR key={session.id}>
                          <TD>
                            <Link
                              href={`/teacher/sessions/${session.id}?tab=results`}
                              className="font-medium text-slate-900 hover:underline"
                            >
                              {session.title}
                            </Link>
                            <p className="text-xs text-slate-500">
                              {session.subject.name} · {formatHumanDateTime(session.endsAt)}
                            </p>
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

            <div className="space-y-6">
              <Card>
                <CardHeader
                  title="Qiyin mavzular"
                  description="So‘nggi 60 kun, to‘g‘ri javob ulushi eng past mavzular (kamida 5 ta javob)."
                />
                <CardBody>
                  <BarList
                    caption="Qiyin mavzular"
                    emptyText="Tahlil uchun javoblar hali yetarli emas."
                    items={dashboard.data.difficultTopics.map((topic) => ({
                      key: `${topic.subject}-${topic.topic}`,
                      label: topic.topic,
                      sublabel: topic.subject,
                      ratio: topic.correctRate,
                    }))}
                  />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Tezkor havolalar" />
                <CardBody className="grid gap-2">
                  <ButtonLink
                    href="/teacher/questions"
                    variant="outline"
                    icon={<Library className="size-4" />}
                    className="justify-start"
                  >
                    Savollar banki
                  </ButtonLink>
                  <ButtonLink
                    href="/teacher/classes"
                    variant="outline"
                    icon={<Users className="size-4" />}
                    className="justify-start"
                  >
                    Sinflarim
                  </ButtonLink>
                  <ButtonLink
                    href="/portfolio"
                    variant="outline"
                    icon={<BadgeCheck className="size-4" />}
                    className="justify-start"
                  >
                    Shaxsiy portfolio
                  </ButtonLink>
                </CardBody>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
