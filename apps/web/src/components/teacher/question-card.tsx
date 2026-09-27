import { CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatPoints } from '@ijod/shared';
import { CategoryBadge, DifficultyBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import type { QuestionItem } from '@/lib/types';

const LETTERS = 'ABCDEFGHIJ';

/** Bank savoli kartasi: matn, variantlar (to‘g‘ri javob belgisi bilan) va metama’lumotlar. */
export function QuestionCard({ question, actions }: { question: QuestionItem; actions?: ReactNode }) {
  const latest = question.latest;
  if (!latest) return null;
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <CategoryBadge category={latest.category} />
        <DifficultyBadge difficulty={latest.difficulty} />
        <Badge tone="gray">{formatPoints(latest.points)} ball</Badge>
        <Badge tone="gray">{question.subject.name}</Badge>
        {question.gradeLevel && <Badge tone="gray">{question.gradeLevel}-sinf</Badge>}
        {question.visibility === 'SCHOOL' && <Badge tone="brand">Maktab banki</Badge>}
        {question.schoolRequestedAt && question.visibility === 'PRIVATE' && (
          <Badge tone="amber">Tasdiq kutilmoqda</Badge>
        )}
        {latest.versionNo > 1 && <Badge tone="gray">v{latest.versionNo}</Badge>}
      </div>
      <p className="mt-3 whitespace-pre-wrap text-slate-900">{latest.stem}</p>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {latest.options.map((option, index) => {
          const correct = option.id === latest.correctOptionId;
          return (
            <li
              key={option.id}
              className={cn(
                'flex items-start gap-1.5 rounded-md px-2 py-1 text-sm',
                correct ? 'bg-emerald-50 text-emerald-900' : 'text-slate-600',
              )}
            >
              <span className="font-semibold">{LETTERS[index]})</span>
              <span className="flex-1">{option.text}</span>
              {correct && (
                <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="size-3.5" aria-hidden /> to‘g‘ri
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>
          {question.topic && <>Mavzu: {question.topic} · </>}
          Muallif: {question.isMine ? 'siz' : question.owner.fullName} · {question.usedInTests} ta testda
        </span>
        {actions && <div className="flex flex-wrap gap-1.5">{actions}</div>}
      </div>
    </article>
  );
}
