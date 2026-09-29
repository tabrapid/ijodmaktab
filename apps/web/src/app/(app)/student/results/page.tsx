'use client';

import { useQuery } from '@tanstack/react-query';
import { Award } from 'lucide-react';
import Link from 'next/link';
import {
  CATEGORY_LABELS,
  categoryEntries,
  formatDateTime,
  formatPercent,
  formatPoints,
  pairPercent,
} from '@ijod/shared';
import { ParticipationBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Table, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { MyResultItem } from '@/lib/types';

export default function MyResultsPage() {
  const query = useQuery({ queryKey: ['me', 'results'], queryFn: () => api.get<MyResultItem[]>('/me/results') });

  return (
    <div>
      <PageHeader
        title="Natijalarim"
        description="Topshirilgan testlar. Ball o‘qituvchi belgilagan vaqtda ko‘rinadi."
      />
      <Card>
        {query.isPending ? (
          <PageLoader />
        ) : query.isError ? (
          <div className="p-4">
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          </div>
        ) : query.data.length === 0 ? (
          <EmptyState
            icon={Award}
            title="Hali natijalar yo‘q"
            description="Test topshirganingizdan so‘ng natijalar shu yerda ko‘rinadi."
          />
        ) : (
          <Table caption="Natijalar">
            <THead>
              <tr>
                <TH>Test</TH>
                <TH>Sana</TH>
                <TH>Holat</TH>
                <TH>Kategoriyalar</TH>
                <TH className="text-right">Natija</TH>
              </tr>
            </THead>
            <tbody>
              {query.data.map((item) => (
                <TR key={item.attemptId}>
                  <TD>
                    <Link
                      href={`/student/results/${item.attemptId}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {item.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {item.subject.name}
                      {item.attemptNo > 1 && ` · ${item.attemptNo}-urinish`}
                    </p>
                  </TD>
                  <TD className="whitespace-nowrap text-slate-600">{formatDateTime(item.submittedAt)}</TD>
                  <TD>
                    <ParticipationBadge status={item.status} />
                  </TD>
                  <TD>
                    {item.scoreVisible && item.categories ? (
                      <div className="flex flex-wrap gap-1">
                        {categoryEntries(item.categories).map(([category, pair]) => (
                          <Badge key={category} tone="gray">
                            {CATEGORY_LABELS[category]}: {formatPercent(pairPercent(pair))}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </TD>
                  <TD className="text-right">
                    {item.scoreVisible ? (
                      <>
                        <p className="font-semibold tabular">{formatPercent(item.percent ?? null)}</p>
                        <p className="text-xs text-slate-500 tabular">
                          {formatPoints(item.score)} / {formatPoints(item.maxScore)}
                        </p>
                      </>
                    ) : (
                      <Badge tone="gray">E’lon qilinmagan</Badge>
                    )}
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
