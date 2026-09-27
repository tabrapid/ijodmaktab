import { CheckCircle2, Circle, XCircle } from 'lucide-react';
import { CATEGORY_LABELS, SUBMIT_SOURCE_LABELS, formatDateTime, formatPercent, formatPoints } from '@ijod/shared';
import { ParticipationBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
import { ProgressBar } from '@/components/ui/stat';
import { cn } from '@/lib/cn';
import type { AttemptView } from '@/lib/types';

const LETTERS = 'ABCDEFGHIJ';

/** Yakunlangan urinish natijasi — sessiya siyosatiga ko‘ra ball va to‘g‘ri javoblar ko‘rsatiladi. */
export function AttemptResult({ view }: { view: AttemptView }) {
  const result = view.result;
  if (!result) return null;
  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center">
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <ParticipationBadge status={result.status} />
              {result.submitSource && (
                <span className="text-sm text-slate-500">{SUBMIT_SOURCE_LABELS[result.submitSource]}</span>
              )}
            </div>
            <p className="text-sm text-slate-500">
              Topshirilgan vaqt:{' '}
              <span className="font-medium text-slate-700">{formatDateTime(result.submittedAt)}</span>
            </p>
            {result.cancelReason && (
              <p className="text-sm text-red-700">
                Bekor qilish sababi: <span className="font-medium">{result.cancelReason}</span>
              </p>
            )}
          </div>
          {result.scoreVisible && result.score && (
            <div className="text-center sm:text-right">
              <p className="text-5xl font-bold text-slate-900">{formatPercent(result.score.percent)}</p>
              <p className="text-sm text-slate-500 tabular">
                {formatPoints(result.score.earned)} / {formatPoints(result.score.max)} ball
              </p>
              {result.passed !== null && result.passed !== undefined && (
                <Badge tone={result.passed ? 'green' : 'amber'} className="mt-2">
                  {result.passed ? 'O‘tish chegarasidan o‘tdi' : 'O‘tish chegarasiga yetmadi'} (
                  {formatPoints(result.passPercent ?? 0)}%)
                </Badge>
              )}
            </div>
          )}
        </CardBody>
        {result.message && (
          <div className="px-5 pb-5">
            <Alert tone="info">{result.message}</Alert>
          </div>
        )}
      </Card>

      {result.scoreVisible && result.categories && result.categories.length > 0 && (
        <Card>
          <CardHeader
            title="Kategoriyalar bo‘yicha natija"
            description={`Kategoriya foizi = olingan ball / kategoriya maksimal balli × 100. Mezon: ${formatPoints(result.thresholdPercent ?? 60)}%.`}
          />
          <CardBody className="space-y-4">
            {result.categories.map((item) => (
              <div key={item.category} className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-800">{CATEGORY_LABELS[item.category]}</span>
                  <span className="tabular text-slate-600">
                    {formatPoints(item.earned)} / {formatPoints(item.max)} ball ·{' '}
                    <span className="font-semibold text-slate-900">{formatPercent(item.percent)}</span>
                    {item.reachedThreshold ? (
                      <Badge tone="green" className="ml-2">
                        Mezonga yetdi
                      </Badge>
                    ) : (
                      <Badge tone="amber" className="ml-2">
                        Mezonga yetmadi
                      </Badge>
                    )}
                  </span>
                </div>
                <ProgressBar percent={item.percent} />
              </div>
            ))}
            <p className="text-xs text-slate-500">
              Umumiy foiz barcha ballar yig‘indisidan hisoblanadi (kategoriya foizlarining oddiy o‘rtachasi emas).
            </p>
          </CardBody>
        </Card>
      )}

      {result.reviewVisible && result.review && (
        <Card>
          <CardHeader title="Javoblar tahlili" description="To‘g‘ri javoblar va izohlar" />
          <CardBody className="space-y-5">
            {result.review.map((item) => {
              const correct = !item.excluded && item.selectedOptionId === item.correctOptionId;
              return (
                <article key={item.number} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-800">{item.number}-savol</h3>
                    <span className="text-sm tabular text-slate-600">
                      {item.excluded ? (
                        <Badge tone="gray">Hisobdan chiqarilgan</Badge>
                      ) : (
                        <>
                          {formatPoints(item.earned)} / {formatPoints(item.max)} ball
                        </>
                      )}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-slate-900">{item.stem}</p>
                  <ul className="mt-3 space-y-1.5">
                    {item.options.map((option, index) => {
                      const isCorrect = option.id === item.correctOptionId;
                      const isSelected = option.id === item.selectedOptionId;
                      return (
                        <li
                          key={option.id}
                          className={cn(
                            'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
                            isCorrect
                              ? 'border-emerald-300 bg-emerald-50'
                              : isSelected
                                ? 'border-red-300 bg-red-50'
                                : 'border-slate-200',
                          )}
                        >
                          {isCorrect ? (
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                          ) : isSelected ? (
                            <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
                          ) : (
                            <Circle className="mt-0.5 size-4 shrink-0 text-slate-300" aria-hidden />
                          )}
                          <span className="flex-1">
                            <span className="font-medium">{LETTERS[index]})</span> {option.text}
                            {isCorrect && (
                              <span className="ml-2 text-xs font-medium text-emerald-700">to‘g‘ri javob</span>
                            )}
                            {isSelected && (
                              <span className="ml-2 text-xs font-medium text-slate-600">sizning javobingiz</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {!item.selectedOptionId && !item.excluded && (
                    <p className="mt-2 text-sm text-amber-700">Javob berilmagan.</p>
                  )}
                  {!correct && item.explanation && (
                    <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                      <span className="font-medium">Izoh: </span>
                      {item.explanation}
                    </p>
                  )}
                </article>
              );
            })}
          </CardBody>
        </Card>
      )}

      {!result.reviewVisible && result.scoreVisible && (
        <p className="text-sm text-slate-500">To‘g‘ri javoblar o‘qituvchi belgilagan vaqtda ochiladi.</p>
      )}
    </div>
  );
}
