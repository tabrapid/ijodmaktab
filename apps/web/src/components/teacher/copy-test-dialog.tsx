'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import type { TestDetail } from '@/lib/types';

const TITLE_MAX = 200;

/** Nusxa nomi: 200 belgidan oshmaydi (asl nom uzun bo‘lsa qisqartiriladi). */
export function copyTitle(title: string, suffix: string) {
  return `${title.slice(0, Math.max(0, TITLE_MAX - suffix.length))}${suffix}`;
}

/** Nusxa olish so‘rovi: nusxa so‘rovchiga tegishli yangi qoralama test. */
export const copyTest = (id: string, title?: string) =>
  api.post<TestDetail>(`/tests/${id}/copy`, title ? { title } : {});

/**
 * Testdan nusxa olish oynasi: nom tanlanadi, nusxa “Mening testlarim”ga qo‘shiladi va
 * (sukut bo‘yicha) test ustasida ochiladi.
 */
export function CopyTestDialog({
  test,
  open,
  onClose,
  onCopied,
}: {
  test: { id: string; title: string; publishedVersionNo: number | null; permission: string } | null;
  open: boolean;
  onClose: () => void;
  onCopied?: (created: TestDetail) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [lastId, setLastId] = useState<string | null>(null);
  // Boshqa test tanlanganda nom qayta taklif qilinadi.
  if (test && test.id !== lastId) {
    setLastId(test.id);
    setTitle(copyTitle(test.title, ' (nusxa)'));
  }
  const copy = useMutation({
    mutationFn: () => copyTest(test!.id, title.trim() || undefined),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['tests'] });
      toast.success('Nusxa yaratildi. Endi uni erkin tahrirlashingiz mumkin.');
      copy.reset();
      onClose();
      if (onCopied) onCopied(created);
      else router.push(`/teacher/tests/${created.id}`);
    },
  });
  const editor = test?.permission === 'OWNER' || test?.permission === 'EDIT';
  const close = () => {
    copy.reset();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Testdan nusxa olish"
      description="Nusxa “Mening testlarim” bo‘limiga qo‘shiladi. Asl test va uning sessiyalari o‘zgarmaydi."
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Bekor qilish
          </Button>
          <Button
            icon={<Copy className="size-4" />}
            loading={copy.isPending}
            disabled={!test || !title.trim() || title.trim().length > TITLE_MAX}
            onClick={() => copy.mutate()}
          >
            Nusxa olish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {copy.isError && <Alert tone="danger">{errorMessage(copy.error)}</Alert>}
        <Field
          label="Nusxa nomi"
          required
          error={title.trim().length > TITLE_MAX ? `Ko‘pi bilan ${TITLE_MAX} ta belgi` : null}
        >
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={TITLE_MAX + 20} />
        </Field>
        <p className="text-sm text-slate-600">
          {editor
            ? 'Nusxaga testning joriy holati (qoralamadagi o‘zgarishlar bilan) ko‘chiriladi.'
            : test?.publishedVersionNo
              ? `Nusxaga testning tayyor (muzlatilgan) v${test.publishedVersionNo} versiyasi ko‘chiriladi — muallifning tugallanmagan o‘zgarishlari kirmaydi.`
              : 'Testning tayyor versiyasi ko‘chiriladi.'}
        </p>
      </div>
    </Dialog>
  );
}
