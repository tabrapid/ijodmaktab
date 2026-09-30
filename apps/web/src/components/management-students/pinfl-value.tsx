'use client';

import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';

/** Ochilgan JSHSHIR shuncha vaqtdan keyin yana yashiriladi. */
const REVEAL_MS = 60_000;

/**
 * JSHSHIR: odatda yashirilgan (“3**********789”). “Ko‘rsatish” to‘liq raqamni alohida so‘rov bilan oladi —
 * har bir ko‘rish audit jurnalida qayd etiladi. Raqam keshda saqlanmaydi va bir daqiqadan so‘ng yashiriladi.
 */
export function PinflValue({
  studentId,
  masked,
  hasPinfl,
}: {
  studentId: string;
  masked: string | null;
  hasPinfl: boolean;
}) {
  const toast = useToast();
  const [revealed, setRevealed] = useState<string | null>(null);
  // Raqam faqat shu komponent holatida turadi: so‘rov natijasi mutatsiya keshida qoldirilmaydi.
  const reveal = useMutation({
    mutationFn: () => api.get<{ pinfl: string }>(`/management/students/${studentId}/pinfl`),
    gcTime: 0,
    onSuccess: (result) => setRevealed(result.pinfl),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const { reset } = reveal;
  const hide = useCallback(() => {
    setRevealed(null);
    reset();
  }, [reset]);

  useEffect(() => {
    if (!revealed) return;
    const timer = window.setTimeout(hide, REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealed, hide]);

  if (!hasPinfl) return <span className="font-normal text-slate-500">Kiritilmagan</span>;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      <span className="font-mono tracking-wide tabular" aria-live="polite">
        {revealed ?? masked ?? '••••••••••••••'}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        onClick={() => (revealed ? hide() : reveal.mutate())}
        loading={reveal.isPending}
        icon={revealed ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        title={revealed ? undefined : 'Ko‘rish audit jurnalida qayd etiladi'}
      >
        {revealed ? 'Yashirish' : 'Ko‘rsatish'}
      </Button>
    </span>
  );
}
