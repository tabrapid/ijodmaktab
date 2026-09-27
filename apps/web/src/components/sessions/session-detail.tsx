'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SessionStateBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/card';
import { ErrorState, PageLoader } from '@/components/ui/feedback';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { sessionTimeRange } from './session-list';
import { LiveMonitor } from './live-monitor';
import { AnswerMatrix, GradingHistory } from './matrix-history';
import { QuestionAnalysis } from './question-analysis';
import { ResultsView } from './results-view';
import { SessionControls, SessionOverview } from './session-overview';
import { useSession } from './use-session';

type TabId = 'overview' | 'live' | 'results' | 'analysis' | 'matrix' | 'history';

const TAB_IDS: TabId[] = ['overview', 'live', 'results', 'analysis', 'matrix', 'history'];

export function SessionDetailView({ id, backHref, backLabel }: { id: string; backHref: string; backLabel: string }) {
  const session = useSession(id);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get('tab') as TabId | null;

  if (session.isPending) return <PageLoader />;
  if (session.isError) return <ErrorState error={session.error} onRetry={() => session.refetch()} />;
  const data = session.data;

  const tabs: TabItem<TabId>[] = [
    { id: 'overview', label: 'Umumiy' },
    ...(data.canManage
      ? [
          {
            id: 'live' as const,
            label: 'Jonli kuzatuv',
            badge: data.inProgressCount > 0 ? <Badge tone="blue">{data.inProgressCount}</Badge> : undefined,
          },
        ]
      : []),
    { id: 'results', label: 'Natijalar' },
    { id: 'analysis', label: 'Savollar tahlili' },
    { id: 'matrix', label: 'Javoblar matritsasi' },
    {
      id: 'history',
      label: 'Baholash tarixi',
      badge: data.revisions.length ? <Badge>{data.revisions.length}</Badge> : undefined,
    },
  ];
  const tab: TabId =
    requested && TAB_IDS.includes(requested) && tabs.some((item) => item.id === requested) ? requested : 'overview';
  const setTab = (next: TabId) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'overview') params.delete('tab');
    else params.set('tab', next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div>
      <PageHeader
        back={
          <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-4" aria-hidden />
            {backLabel}
          </Link>
        }
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {data.title}
            <SessionStateBadge state={data.state} />
          </span>
        }
        description={`${data.subject.name} · ${data.classes.map((item) => item.name).join(', ') || 'alohida o‘quvchilar'} · ${sessionTimeRange(data.startsAt, data.endsAt)}`}
        actions={<SessionControls session={data} />}
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-4" />
      <div role="tabpanel">
        {tab === 'overview' && <SessionOverview session={data} />}
        {tab === 'live' && <LiveMonitor session={data} />}
        {tab === 'results' && <ResultsView session={data} />}
        {tab === 'analysis' && <QuestionAnalysis session={data} />}
        {tab === 'matrix' && <AnswerMatrix session={data} />}
        {tab === 'history' && <GradingHistory session={data} />}
      </div>
    </div>
  );
}
