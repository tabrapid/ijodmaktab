'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { portfolioReviewSchema, type PortfolioReviewInput } from '@ijod/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { Field, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorMessage } from '@/lib/api';
import type { PortfolioItemView } from '@/lib/types';
import { DetailsView } from './details-view';
import { EvidenceLinks, PortfolioMeta } from './parts';
import { portfolioKeys } from './utils';

export type ReviewDecision = 'APPROVED' | 'RETURNED';

export interface ReviewTarget {
  item: PortfolioItemView;
  decision: ReviewDecision;
}

type ReviewOutput = z.output<typeof portfolioReviewSchema>;

function ReviewForm({
  target,
  onClose,
  onReviewed,
}: {
  target: ReviewTarget;
  onClose: () => void;
  onReviewed?: (item: PortfolioItemView) => void;
}) {
  const { item, decision } = target;
  const returning = decision === 'RETURNED';
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<PortfolioReviewInput, unknown, ReviewOutput>({
    resolver: zodResolver(portfolioReviewSchema),
    defaultValues: { decision, reason: '' },
  });

  const review = useMutation({
    // Ko‘rsatilgan versiya bilan: egasi shu orada tahrirlagan bo‘lsa, qaror qo‘llanmaydi (409).
    mutationFn: (values: ReviewOutput) =>
      api.post<PortfolioItemView>(`/portfolio/${item.id}/review`, { ...values, updatedAt: item.updatedAt }),
    onSuccess: (updated) => {
      queryClient.setQueryData(portfolioKeys.item(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
      toast.success(
        returning
          ? `“${item.title}” tuzatishga qaytarildi. Egasiga bildirishnoma yuborildi.`
          : `“${item.title}” tasdiqlandi. Egasiga bildirishnoma yuborildi.`,
      );
      onReviewed?.(updated);
      onClose();
    },
    onError: (caught) => {
      if (caught instanceof ApiError && caught.fieldErrors.reason) {
        form.setError('reason', { type: 'server', message: caught.fieldErrors.reason });
        return;
      }
      setError(errorMessage(caught));
      // Yozuvni boshqa tasdiqlovchi ko‘rib chiqqan bo‘lishi mumkin — ro‘yxatlar yangilanadi.
      if (caught instanceof ApiError && (caught.status === 404 || caught.status === 409)) {
        void queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
      }
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    review.mutate(values);
  });

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="font-medium text-slate-900">{item.title}</p>
        <p className="text-sm text-slate-600">
          {item.owner.fullName}
          {item.owner.className ? ` · ${item.owner.className}` : ''}
        </p>
        <DetailsView type={item.type} details={item.details} compact />
        <PortfolioMeta item={item} />
        <EvidenceLinks file={item.evidenceFile} url={item.evidenceUrl} />
      </div>

      <p className="text-sm text-slate-600">
        {returning
          ? 'Yozuv egasiga qaytariladi: u sababni ko‘radi, yozuvni tuzatib, qayta yuboradi. Qaytarilgan yozuv tasdiqlangan yutuq hisoblanmaydi.'
          : 'Tasdiqlangach yozuv egasining portfoliosida tasdiqlangan yutuq sifatida hisoblanadi. Qarorni dalilni ko‘rib chiqqandan so‘ng qabul qiling.'}
      </p>

      {error && <Alert tone="danger">{error}</Alert>}

      <Field
        label={returning ? 'Qaytarish sababi' : 'Izoh (ixtiyoriy)'}
        required={returning}
        hint={
          returning
            ? 'Nimani tuzatish kerakligini aniq yozing — egasi shu matnni ko‘radi.'
            : 'Izoh tekshiruv tarixida saqlanadi.'
        }
        error={form.formState.errors.reason?.message}
      >
        <Textarea rows={4} maxLength={1000} autoFocus={returning} {...form.register('reason')} />
      </Field>

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="outline" onClick={onClose} disabled={review.isPending}>
          Bekor qilish
        </Button>
        <Button
          type="submit"
          loading={review.isPending}
          icon={returning ? <Undo2 className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
        >
          {returning ? 'Tuzatishga qaytarish' : 'Tasdiqlash'}
        </Button>
      </div>
    </form>
  );
}

/** Tasdiqlash yoki sababi bilan tuzatishga qaytarish oynasi (qaytarish sababi majburiy). */
export function ReviewDialog({
  target,
  onClose,
  onReviewed,
}: {
  target: ReviewTarget | null;
  onClose: () => void;
  onReviewed?: (item: PortfolioItemView) => void;
}) {
  const returning = target?.decision === 'RETURNED';
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={returning ? 'Tuzatishga qaytarish' : 'Yozuvni tasdiqlash'}
      description={
        returning
          ? 'Qaytarish sababi majburiy — egasi uni ko‘radi.'
          : 'Qaror tekshiruv tarixida saqlanadi, egasiga bildirishnoma yuboriladi.'
      }
    >
      {target && (
        <ReviewForm
          key={`${target.item.id}:${target.decision}`}
          target={target}
          onClose={onClose}
          onReviewed={onReviewed}
        />
      )}
    </Dialog>
  );
}
