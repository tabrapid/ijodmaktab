'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useId, useState, type ChangeEvent, type DragEvent } from 'react';
import { AVATAR_MAX_BYTES, AVATAR_MAX_PIXELS, AVATAR_MIME_TYPES } from '@ijod/shared';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert, PageLoader } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { ME_KEY, useMe } from '@/lib/auth';
import { cn } from '@/lib/cn';
import type { Me } from '@/lib/types';

const ACCEPT = AVATAR_MIME_TYPES.join(',');
const MAX_MB = AVATAR_MAX_BYTES / (1024 * 1024);
const MAX_MEGAPIXELS = AVATAR_MAX_PIXELS / 1_000_000;

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Tanlangan faylni yuborishdan oldin tekshirish (server baribir mazmun bo‘yicha qayta tekshiradi). */
function checkFile(file: File): string | null {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Faqat JPG, PNG yoki WEBP formatidagi rasm tanlang.';
  }
  if (file.size === 0) return 'Tanlangan fayl bo‘sh.';
  if (file.size > AVATAR_MAX_BYTES) {
    return `Rasm hajmi ${MAX_MB} MB dan oshmasligi kerak (tanlangan rasm: ${formatSize(file.size)}).`;
  }
  return null;
}

/** Profil rasmini olib tashlash; javobdagi yangi “me” keshga yoziladi (sarlavhadagi rasm darhol yangilanadi). */
export function useRemoveOwnAvatar(onDone?: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: () => api.delete<Me>('/me/avatar'),
    onSuccess: (me) => {
      queryClient.setQueryData(ME_KEY, me);
      toast.success('Profil rasmi olib tashlandi.');
      onDone?.();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

interface Selected {
  file: File;
  url: string;
}

/** Profil rasmini yuklash, almashtirish yoki olib tashlash oynasi. */
export function AvatarUploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inputId = useId();
  const hintId = useId();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const [selected, setSelected] = useState<Selected | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Oldindan ko‘rish manzili almashganda yoki oyna yopilganda xotira bo‘shatiladi.
  useEffect(() => {
    if (!selected) return;
    return () => URL.revokeObjectURL(selected.url);
  }, [selected]);

  const upload = useMutation({
    mutationFn: (file: File) => api.upload<Me>('/me/avatar', file),
    onSuccess: (next) => {
      queryClient.setQueryData(ME_KEY, next);
      toast.success('Profil rasmi saqlandi.');
      finish();
    },
  });
  const remove = useRemoveOwnAvatar(() => finish());
  const busy = upload.isPending || remove.isPending;

  function reset() {
    setSelected(null);
    setLocalError(null);
    setDragging(false);
    upload.reset();
    remove.reset();
  }
  function finish() {
    reset();
    onClose();
  }
  const close = () => {
    if (!busy) finish();
  };

  const choose = (file: File | undefined) => {
    if (!file || busy) return;
    upload.reset();
    const problem = checkFile(file);
    setLocalError(problem);
    setSelected(problem ? null : { file, url: URL.createObjectURL(file) });
  };
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    choose(event.target.files?.[0]);
    // Xuddi shu faylni qayta tanlash ham ishlashi uchun.
    event.target.value = '';
  };
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  };

  const error = localError ?? (upload.isError ? errorMessage(upload.error) : null);

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Profil rasmi"
      description="Rasm maktabdagi barcha foydalanuvchilarga ko‘rinadi. Yuzingiz aniq ko‘ringan rasm tanlang."
      footer={
        <>
          {me?.avatarUrl && !selected && (
            <Button
              variant="ghost"
              className="mr-auto text-red-700 hover:bg-red-50 hover:text-red-800"
              onClick={() => remove.mutate()}
              loading={remove.isPending}
              disabled={upload.isPending}
              icon={<Trash2 className="size-4" aria-hidden />}
            >
              Rasmni olib tashlash
            </Button>
          )}
          <Button variant="outline" onClick={close} disabled={busy}>
            Bekor qilish
          </Button>
          <Button
            onClick={() => selected && upload.mutate(selected.file)}
            disabled={!selected || remove.isPending}
            loading={upload.isPending}
          >
            Saqlash
          </Button>
        </>
      }
    >
      {!me ? (
        <PageLoader />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-4 py-2 sm:gap-6">
            <figure className="flex flex-col items-center gap-2">
              <Avatar
                name={me.fullName}
                src={me.avatarUrl}
                size="xl"
                label={me.avatarUrl ? 'Hozirgi profil rasmi' : 'Profil rasmi yo‘q'}
                className={cn(!selected && 'size-32 text-4xl')}
              />
              <figcaption className="text-xs text-slate-500">{me.avatarUrl ? 'Hozirgi rasm' : 'Rasm yo‘q'}</figcaption>
            </figure>
            {selected && (
              <>
                <ArrowRight className="size-5 shrink-0 text-slate-400" aria-hidden />
                <figure className="flex flex-col items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- mahalliy oldindan ko‘rish (blob manzil) */}
                  <img
                    src={selected.url}
                    alt="Yangi profil rasmi (hali saqlanmagan)"
                    className="size-32 rounded-full object-cover ring-2 ring-brand-300"
                    onLoad={(event) => {
                      // Hajmi kichik, lekin piksellari juda ko‘p rasmni server qabul qilmaydi — oldindan aytamiz.
                      const { naturalWidth, naturalHeight } = event.currentTarget;
                      if (naturalWidth * naturalHeight > AVATAR_MAX_PIXELS) {
                        setSelected(null);
                        setLocalError(
                          `Rasm o‘lchami juda katta (${naturalWidth}×${naturalHeight} piksel; ${MAX_MEGAPIXELS} megapikseldan oshmasin). Rasmni kichraytirib yoki skrinshot qilib yuklang.`,
                        );
                      }
                    }}
                  />
                  <figcaption className="text-xs font-medium text-brand-700">Yangi rasm</figcaption>
                </figure>
              </>
            )}
          </div>

          <input
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="peer sr-only"
            onChange={onChange}
            disabled={busy}
            aria-describedby={hintId}
          />
          <label
            htmlFor={inputId}
            onDragOver={(event) => {
              event.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500',
              dragging
                ? 'border-brand-400 bg-brand-50'
                : 'border-slate-300 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40',
              busy && 'pointer-events-none opacity-70',
            )}
          >
            <ImagePlus className="size-8 text-brand-700" aria-hidden />
            <span className="font-medium text-slate-900">
              {selected ? 'Boshqa rasm tanlash' : me.avatarUrl ? 'Yangi rasm tanlash' : 'Rasm tanlash'}
            </span>
            <span id={hintId} className="text-xs text-slate-500">
              yoki shu yerga sudrab tashlang · JPG, PNG yoki WEBP, {MAX_MB} MB gacha
            </span>
          </label>
          {selected && (
            <p className="text-center text-xs text-slate-500">
              {selected.file.name} · {formatSize(selected.file.size)}. Rasm kvadrat shaklida kesiladi.
            </p>
          )}
          {error && (
            <Alert tone="danger" title="Rasmni qabul qilib bo‘lmadi">
              {error}
            </Alert>
          )}
        </div>
      )}
    </Dialog>
  );
}
