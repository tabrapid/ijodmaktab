'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';
import { ImportResult } from '@/components/admin/import-result';
import { ImportReview } from '@/components/admin/import-review';
import { ImportUpload } from '@/components/admin/import-upload';
import { BackLink } from '@/components/admin/info-list';
import { adminKeys, useInvalidate } from '@/components/admin/queries';
import { RequireRole } from '@/components/app-shell';
import { PageHeader } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import type { ImportCommitResult, ImportPreview } from '@/lib/types';

type Step =
  { kind: 'upload' } | { kind: 'review'; preview: ImportPreview } | { kind: 'done'; result: ImportCommitResult };

const STEPS = [
  { kind: 'upload', label: 'Faylni yuklash' },
  { kind: 'review', label: 'Tekshirish va moslashtirish' },
  { kind: 'done', label: 'Natija va kirish ma’lumotlari' },
] as const;

function Stepper({ current }: { current: Step['kind'] }) {
  const index = STEPS.findIndex((step) => step.kind === current);
  return (
    <ol className="mb-6 grid gap-2 sm:grid-cols-3" aria-label="Import bosqichlari">
      {STEPS.map((step, position) => {
        const done = position < index;
        const active = position === index;
        return (
          <li
            key={step.kind}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-3 py-2 text-sm',
              active
                ? 'border-brand-300 bg-brand-50 text-brand-800'
                : done
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-surface text-slate-500',
            )}
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                active ? 'bg-brand-600 text-white' : done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600',
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : position + 1}
            </span>
            <span className="font-medium">{step.label}</span>
            {done && <span className="sr-only">(bajarildi)</span>}
          </li>
        );
      })}
    </ol>
  );
}

function ImportWizard() {
  const invalidate = useInvalidate();
  const [step, setStep] = useState<Step>({ kind: 'upload' });

  return (
    <div>
      <PageHeader
        back={<BackLink href="/admin/users">Foydalanuvchilar</BackLink>}
        title="Excel orqali import"
        description="O‘quvchi va o‘qituvchi hisoblarini ro‘yxatdan birdaniga yaratish. Tasdiqlashdan oldin hech narsa saqlanmaydi."
      />
      <Stepper current={step.kind} />
      {step.kind === 'upload' && <ImportUpload onUploaded={(preview) => setStep({ kind: 'review', preview })} />}
      {step.kind === 'review' && (
        <ImportReview
          key={step.preview.batchId}
          initial={step.preview}
          onRestart={() => setStep({ kind: 'upload' })}
          onCommitted={(result) => {
            setStep({ kind: 'done', result });
            void invalidate(adminKeys.users, adminKeys.dashboard, adminKeys.classes);
          }}
        />
      )}
      {step.kind === 'done' && <ImportResult result={step.result} onRestart={() => setStep({ kind: 'upload' })} />}
    </div>
  );
}

export default function UserImportPage() {
  return (
    <RequireRole roles={['ADMIN', 'SUPER_ADMIN']}>
      <ImportWizard />
    </RequireRole>
  );
}
