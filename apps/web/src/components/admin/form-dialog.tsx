'use client';

import type { ReactNode } from 'react';
import type { FieldError, FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ApiError, errorMessage } from '@/lib/api';

/**
 * Formali muloqot oynasi: tugmalar pastki panelda, forma esa `formId` orqali yuboriladi.
 * Forma oyna ichida chiziladi — oyna yopilganda uning holati ham tozalanadi.
 */
export function FormDialog({
  open,
  onClose,
  title,
  description,
  formId,
  submitLabel = 'Saqlash',
  pending,
  submitDisabled,
  tone = 'primary',
  size = 'md',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  formId: string;
  submitLabel?: string;
  pending?: boolean;
  submitDisabled?: boolean;
  tone?: 'primary' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size={size}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Bekor qilish
          </Button>
          <Button type="submit" form={formId} variant={tone} loading={pending} disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

/**
 * Server xatosini forma maydonlariga taqsimlaydi. Maydonga bog‘lanmagan xabar qaytariladi
 * (formaning yuqorisida umumiy xato sifatida ko‘rsatish uchun).
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
  /** Xato kodi → maydon (ixtiyoriy ravishda o‘z xabari bilan), masalan `{ LOGIN_TAKEN: 'login' }`. */
  codeFields: Partial<Record<string, Path<T> | { field: Path<T>; message: string }>> = {},
): string | null {
  if (!(error instanceof ApiError)) return errorMessage(error);
  const byCode = codeFields[error.code];
  if (byCode) {
    const target = typeof byCode === 'string' ? { field: byCode, message: error.message } : byCode;
    setError(target.field, { type: 'server', message: target.message }, { shouldFocus: true });
    return null;
  }
  const entries = Object.entries(error.fieldErrors);
  const known = entries.filter(([path]) => (fields as readonly string[]).includes(path));
  known.forEach(([path, message], index) =>
    setError(path as Path<T>, { type: 'server', message }, { shouldFocus: index === 0 }),
  );
  return known.length > 0 && known.length === entries.length ? null : error.message;
}

/**
 * Tanlov maydoni xatosi: mijoz tomonidagi umumiy xabar (“Noto‘g‘ri identifikator”) o‘rniga
 * tushunarli matn, server xabari esa o‘zgarishsiz ko‘rsatiladi.
 */
export function choiceError(error: FieldError | undefined, fallback: string): string | undefined {
  if (!error) return undefined;
  return error.type === 'server' && error.message ? error.message : fallback;
}
