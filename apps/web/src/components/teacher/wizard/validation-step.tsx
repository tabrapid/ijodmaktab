'use client';

import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ValidationIssue } from '@ijod/shared';
import { Alert } from '@/components/ui/feedback';
import type { TestDetail } from '@/lib/types';

/** 5-bosqich: avtomatik tekshiruv. Qat’iy xatolar nashrni to‘xtatadi, ogohlantirishlar tushuntiriladi. */
export function ValidationStep({
  test,
  onGoToQuestion,
}: {
  test: TestDetail;
  onGoToQuestion: (number: number) => void;
}) {
  const errors = test.issues.filter((issue) => issue.level === 'error');
  const warnings = test.issues.filter((issue) => issue.level === 'warning');
  const renderIssue = (issue: ValidationIssue, index: number) => (
    <li key={`${issue.code}-${index}`} className="flex items-start gap-2 text-sm">
      {issue.level === 'error' ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
      )}
      <span className="flex-1">{issue.message}</span>
      {issue.questionNumber && (
        <button
          type="button"
          onClick={() => onGoToQuestion(issue.questionNumber!)}
          className="shrink-0 text-brand-700 hover:underline"
        >
          Savolga o‘tish
        </button>
      )}
    </li>
  );
  if (test.issues.length === 0) {
    return (
      <Alert tone="success" title="Test tekshiruvdan o‘tdi">
        Xato yoki ogohlantirish topilmadi. Oldindan ko‘rish va e’lon qilish bosqichlariga o‘tishingiz mumkin.
      </Alert>
    );
  }
  return (
    <div className="space-y-4">
      {errors.length > 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
          <p className="mb-3 font-semibold text-red-800">
            Qat’iy xatolar ({errors.length}) — ular tuzatilmaguncha test e’lon qilinmaydi
          </p>
          <ul className="space-y-2">{errors.map(renderIssue)}</ul>
        </div>
      ) : (
        <Alert tone="success" title="Qat’iy xato yo‘q">
          Test e’lon qilinishi mumkin.
        </Alert>
      )}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <p className="mb-3 font-semibold text-amber-900">Tavsiyaviy ogohlantirishlar ({warnings.length})</p>
          <ul className="space-y-2">{warnings.map(renderIssue)}</ul>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-800">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Ogohlantirishlar nashrni to‘xtatmaydi, lekin ularni ko‘rib chiqish tavsiya etiladi.
          </p>
        </div>
      )}
    </div>
  );
}
