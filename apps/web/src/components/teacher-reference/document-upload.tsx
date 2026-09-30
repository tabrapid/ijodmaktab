'use client';

import { FileCheck2, FileUp, RefreshCw, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { formatFileSize } from '@/components/portfolio/utils';
import { Button, buttonClass } from '@/components/ui/button';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { FileRef } from '@/lib/types';
import { uploadDocument, type UploadTask } from './upload';
import { DOCUMENT_ACCEPT, DOCUMENT_EXTENSIONS, DOCUMENT_MAX_BYTES } from './utils';

function uploadErrorText(error: unknown) {
  if (error instanceof ApiError && (error.code === 'PAYLOAD_TOO_LARGE' || error.code === 'FILE_TOO_LARGE')) {
    return 'Fayl hajmi 10 MB dan oshmasligi kerak.';
  }
  // FILE_TYPE_NOT_ALLOWED, NO_FILE va boshqalar — serverning o‘zbekcha xabari.
  return errorMessage(error);
}

/** Tanlangan faylni yuborishdan oldin tekshirish (server ham turini mazmuni bo‘yicha tekshiradi). */
function localProblem(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!DOCUMENT_EXTENSIONS.includes(extension)) return 'Faqat PDF, JPG yoki PNG fayl yuklang.';
  if (file.size > DOCUMENT_MAX_BYTES) {
    return `Fayl hajmi 10 MB dan oshmasligi kerak (tanlangan fayl: ${formatFileSize(file.size)}).`;
  }
  return null;
}

/**
 * Ma’lumotnoma hujjatini yuklash: fayl tanlanishi bilan yopiq omborga yuboriladi, jarayon foizda
 * ko‘rinadi va bekor qilish mumkin. Yuklangan faylni ochib ko‘rish, almashtirish yoki olib tashlash mumkin.
 */
export function DocumentUpload({
  file,
  onChange,
  label,
  hint,
  required = false,
  error,
  disabled = false,
  onUploadingChange,
}: {
  file: FileRef | null;
  onChange: (file: FileRef | null) => void;
  label: string;
  hint?: ReactNode;
  required?: boolean;
  error?: string | null;
  disabled?: boolean;
  /** Yuklash boshlandi yoki tugadi — forma bu vaqtda saqlanmasin. */
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const labelId = useId();
  const messageId = useId();
  const [pending, setPending] = useState<{ name: string; percent: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const task = useRef<UploadTask | null>(null);
  const uploading = pending !== null;

  // Sahifa yoki oyna yopilsa, tugallanmagan yuklash to‘xtatiladi.
  useEffect(() => () => task.current?.abort(), []);

  const notify = useRef(onUploadingChange);
  useEffect(() => {
    notify.current = onUploadingChange;
  }, [onUploadingChange]);
  useEffect(() => {
    notify.current?.(uploading);
  }, [uploading]);
  useEffect(() => () => notify.current?.(false), []);

  const onSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    const problem = localProblem(selected);
    setUploadError(problem);
    if (problem) return;
    setPending({ name: selected.name, percent: 0 });
    const current = uploadDocument(selected, (percent) =>
      setPending((state) => (state ? { ...state, percent } : state)),
    );
    task.current = current;
    current.promise
      .then((uploaded) => {
        if (task.current !== current) return;
        onChange(uploaded);
      })
      .catch((caught: unknown) => {
        if (task.current !== current) return;
        if (!(caught instanceof ApiError && caught.code === 'ABORTED')) setUploadError(uploadErrorText(caught));
      })
      .finally(() => {
        if (task.current !== current) return;
        task.current = null;
        setPending(null);
      });
  };

  const cancel = () => {
    const current = task.current;
    task.current = null;
    current?.abort();
    setPending(null);
  };

  const shownError = uploadError ?? error ?? null;
  const input = (
    <input
      type="file"
      accept={DOCUMENT_ACCEPT}
      className="sr-only"
      onChange={onSelect}
      disabled={disabled}
      aria-labelledby={labelId}
      aria-describedby={messageId}
      aria-invalid={shownError ? true : undefined}
    />
  );

  return (
    <div className="space-y-1.5">
      <p id={labelId} className="text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span className="text-red-700" aria-hidden>
            {' '}
            *
          </span>
        )}
      </p>
      {pending ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-slate-800">{pending.name}</span>
            <span className="shrink-0 font-semibold text-brand-700 tabular">{pending.percent}%</span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-100"
            role="progressbar"
            aria-label="Hujjat yuklanmoqda"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pending.percent}
          >
            <div
              className="h-full rounded-full bg-brand-600 transition-[width] duration-200"
              style={{ width: `${pending.percent}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-600">
              {pending.percent >= 100 ? 'Tekshirilmoqda…' : 'Yuklanmoqda — sahifani yopmang'}
            </span>
            <Button variant="ghost" size="sm" onClick={cancel}>
              Bekor qilish
            </Button>
          </div>
        </div>
      ) : file ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <FileCheck2 className="size-4 shrink-0 text-emerald-700" aria-hidden />
          <a
            href={`/api/files/${file.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-sm font-medium text-brand-700 hover:underline"
          >
            {file.originalName}
            <span className="sr-only"> — hujjatni yangi oynada ochish</span>
          </a>
          <span className="text-xs text-slate-500 tabular">{formatFileSize(file.sizeBytes)}</span>
          {!disabled && (
            <span className="flex flex-wrap gap-1">
              <label
                className={buttonClass(
                  'ghost',
                  'sm',
                  'cursor-pointer focus-within:ring-2 focus-within:ring-brand-500/40 focus-within:outline-none',
                )}
              >
                <RefreshCw className="size-4" aria-hidden />
                Almashtirish
                {input}
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange(null)}
                icon={<X className="size-4" aria-hidden />}
              >
                Olib tashlash
              </Button>
            </span>
          )}
        </div>
      ) : (
        <label
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 px-4 py-4',
            'text-center transition-colors hover:border-brand-400 hover:bg-brand-50',
            'focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30',
            disabled && 'pointer-events-none opacity-60',
            shownError && 'border-red-300',
          )}
        >
          <FileUp className="size-6 text-brand-700" aria-hidden />
          <span className="text-sm font-medium text-slate-800">Hujjatni tanlash</span>
          <span className="text-xs text-slate-500">PDF, JPG yoki PNG · 10 MB gacha</span>
          {input}
        </label>
      )}
      <div id={messageId}>
        {shownError ? (
          <p role="alert" className="text-xs font-medium text-red-700">
            {shownError}
          </p>
        ) : hint ? (
          <p className="text-xs text-slate-500">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
