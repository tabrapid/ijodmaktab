'use client';

import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useState } from 'react';
import {
  GRADING_OVERRIDE_MODE_LABELS,
  formatDateTime,
  formatInternalId,
  formatPoints,
  type QuestionOutcome,
} from '@ijod/shared';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { GradeRevisionItem, RevisionDetail, SessionDetail } from '@/lib/types';
import { useSessionResults } from './use-session';

const OUTCOME: Record<QuestionOutcome, { symbol: string; label: string; className: string }> = {
  CORRECT: { symbol: '✓', label: 'to‘g‘ri', className: 'text-emerald-700' },
  WRONG: { symbol: '✗', label: 'noto‘g‘ri', className: 'text-red-700' },
  BLANK: { symbol: '–', label: 'javobsiz', className: 'text-slate-400' },
  EXCLUDED: { symbol: 'Ch', label: 'hisobdan chiqarilgan', className: 'text-slate-500 italic' },
  CREDITED: { symbol: '+', label: 'hammaga ball berilgan', className: 'text-violet-700' },
};

/** O‘quvchi × savol matritsasi: har katakda natija belgisi va tanlangan variant harfi. */
export function AnswerMatrix({ session }: { session: SessionDetail }) {
  const results = useSessionResults(session.id);
  if (results.isPending) return <PageLoader />;
  if (results.isError) return <ErrorState error={results.error} onRetry={() => results.refetch()} />;
  const { questions, rows, matrix } = results.data;
  const graded = rows.filter((row) => matrix[row.studentId]);
  if (graded.length === 0) {
    return (
      <Card>
        <EmptyState title="Hali yakunlangan ish yo‘q" description="Matritsa o‘quvchilar testni topshirgach to‘ladi." />
      </Card>
    );
  }
  const letters = new Map(
    questions.flatMap((question) =>
      question.options.map((option) => [`${question.testQuestionId}:${option.id}`, option.letter] as const),
    ),
  );
  const correctCounts = questions.map(
    (question) =>
      graded.filter((row) => matrix[row.studentId]?.[question.testQuestionId]?.outcome === 'CORRECT').length,
  );

  return (
    <Card>
      <CardHeader
        title="Javoblar matritsasi"
        description={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {Object.values(OUTCOME).map((item) => (
              <span key={item.label}>
                <span className={cn('font-semibold', item.className)}>{item.symbol}</span> — {item.label}
              </span>
            ))}
            <span>harf — tanlangan variant</span>
          </span>
        }
      />
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Javoblar matritsasi</caption>
          <thead className="sticky top-0 z-20 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-30 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium"
              >
                O‘quvchi
              </th>
              <th scope="col" className="border-b border-slate-200 px-2 py-2 text-right font-medium">
                Ball
              </th>
              {questions.map((question) => (
                <th
                  key={question.testQuestionId}
                  scope="col"
                  className="border-b border-slate-200 px-1.5 py-2 text-center font-medium tabular"
                  title={question.stem}
                >
                  {question.number}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {graded.map((row) => (
              <tr key={row.studentId} className="border-b border-slate-100 hover:bg-slate-50/60">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-normal whitespace-nowrap"
                >
                  <span className="font-medium text-slate-900">{row.fullName}</span>
                  <span className="ml-2 text-xs text-slate-500">{formatInternalId(row.internalId)}</span>
                </th>
                <td className="px-2 py-1.5 text-right whitespace-nowrap tabular">
                  {row.score === null ? '—' : formatPoints(row.score)}
                </td>
                {questions.map((question) => {
                  const cell = matrix[row.studentId]?.[question.testQuestionId];
                  if (!cell)
                    return (
                      <td key={question.testQuestionId} className="px-1.5 py-1.5 text-center text-slate-300">
                        ·
                      </td>
                    );
                  const outcome = OUTCOME[cell.outcome];
                  const letter = cell.selectedOptionId
                    ? letters.get(`${question.testQuestionId}:${cell.selectedOptionId}`)
                    : null;
                  return (
                    <td
                      key={question.testQuestionId}
                      className="px-1.5 py-1.5 text-center whitespace-nowrap"
                      title={`${row.fullName}, ${question.number}-savol: ${outcome.label}${letter ? ` (${letter})` : ''}, ${formatPoints(cell.earned)} ball`}
                    >
                      <span className={cn('font-semibold', outcome.className)}>{outcome.symbol}</span>
                      {letter && <span className="ml-0.5 text-xs text-slate-500">{letter}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-slate-50 text-xs text-slate-600">
            <tr>
              <th scope="row" className="sticky left-0 bg-slate-50 px-3 py-2 text-left font-medium">
                To‘g‘ri javoblar
              </th>
              <td />
              {correctCounts.map((count, index) => (
                <td key={questions[index]!.testQuestionId} className="px-1.5 py-2 text-center tabular">
                  {count}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function RevisionDialog({
  session,
  revision,
  onClose,
}: {
  session: SessionDetail;
  revision: GradeRevisionItem;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: ['revision', session.id, revision.id],
    queryFn: () => api.get<RevisionDetail>(`/sessions/${session.id}/revisions/${revision.id}`),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Baholash versiyasi ${revision.version}`}
      description={revision.reason}
      size="lg"
    >
      {detail.isPending ? (
        <PageLoader />
      ) : detail.isError ? (
        <ErrorState error={detail.error} />
      ) : (
        <Table caption="Qayta hisoblash natijalari">
          <THead>
            <tr>
              <TH>O‘quvchi</TH>
              <TH className="text-right">Oldin</TH>
              <TH className="text-right">Keyin</TH>
              <TH className="text-right">Farq</TH>
            </tr>
          </THead>
          <tbody>
            {detail.data.items.map((item) => {
              const diff = item.before.score === null ? null : item.after.score - item.before.score;
              return (
                <TR key={item.attemptId}>
                  <TD>
                    {item.student.fullName}{' '}
                    <span className="text-xs text-slate-500">{formatInternalId(item.student.internalId)}</span>
                  </TD>
                  <TD className="text-right tabular">
                    {formatPoints(item.before.score)} / {formatPoints(item.before.maxScore)}
                  </TD>
                  <TD className="text-right tabular">
                    {formatPoints(item.after.score)} / {formatPoints(item.after.maxScore)}
                  </TD>
                  <TD
                    className={cn(
                      'text-right tabular',
                      diff && diff > 0 && 'text-emerald-700',
                      diff && diff < 0 && 'text-red-700',
                    )}
                  >
                    {diff === null ? '—' : diff > 0 ? `+${formatPoints(diff)}` : formatPoints(diff)}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </Dialog>
  );
}

/** Qayta baholash tarixi: har o‘zgarish sabab, muallif va oldingi/yangi natijalar bilan saqlanadi. */
export function GradingHistory({ session }: { session: SessionDetail }) {
  const results = useSessionResults(session.id);
  const [open, setOpen] = useState<GradeRevisionItem | null>(null);
  const questionById = new Map((results.data?.questions ?? []).map((question) => [question.testQuestionId, question]));

  if (session.revisions.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={History}
          title="Qayta baholash bo‘lmagan"
          description="Savol qayta baholansa, har bir o‘zgarish shu yerda sabab va oldingi natijalar bilan saqlanadi."
        />
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title="Baholash tarixi" description={`Joriy baholash versiyasi: ${session.gradingVersion}`} />
      <Table caption="Baholash tarixi">
        <THead>
          <tr>
            <TH>Versiya</TH>
            <TH>O‘zgarish</TH>
            <TH>Sabab</TH>
            <TH className="text-right">Natijasi o‘zgargan</TH>
            <TH>Kim / qachon</TH>
            <TH />
          </tr>
        </THead>
        <tbody>
          {session.revisions.map((revision) => {
            const question = questionById.get(revision.change.testQuestionId);
            const newKey =
              revision.change.mode === 'CHANGE_KEY' && question
                ? question.options.find((option) => option.id === revision.change.correctOptionId)?.letter
                : null;
            return (
              <TR key={revision.id}>
                <TD className="tabular">{revision.version}</TD>
                <TD>
                  {question ? `${question.number}-savol: ` : ''}
                  {GRADING_OVERRIDE_MODE_LABELS[revision.change.mode]}
                  {newKey && ` (yangi javob: ${newKey})`}
                </TD>
                <TD className="max-w-xs text-slate-600">{revision.reason}</TD>
                <TD className="text-right tabular">{revision.affectedCount} nafar</TD>
                <TD className="whitespace-nowrap text-slate-600">
                  {revision.createdBy.fullName}
                  <p className="text-xs text-slate-500">{formatDateTime(revision.createdAt)}</p>
                </TD>
                <TD className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(revision)}>
                    Batafsil
                  </Button>
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
      {open && <RevisionDialog session={session} revision={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}
