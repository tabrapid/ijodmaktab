'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp, Paperclip, Save, Send, X } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { useController, useForm, useWatch, type DefaultValues } from 'react-hook-form';
import type { z } from 'zod';
import {
  ACHIEVEMENT_LEVELS,
  ACHIEVEMENT_LEVEL_LABELS,
  CREATIVE_PORTFOLIO_TYPES,
  PORTFOLIO_ITEM_TYPES,
  PORTFOLIO_ITEM_TYPE_LABELS,
  PORTFOLIO_VISIBILITIES,
  PORTFOLIO_VISIBILITY_LABELS,
  TEACHER_ONLY_PORTFOLIO_TYPES,
  portfolioItemSchema,
  type PortfolioItemInput,
  type PortfolioItemType,
} from '@ijod/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorMessage } from '@/lib/api';
import { hasRole, useMe } from '@/lib/auth';
import { cn } from '@/lib/cn';
import type { FileRef, PortfolioItemView } from '@/lib/types';
import { ReturnReasonAlert } from './parts';
import { useSubjects } from './queries';
import { formatFileSize, isCreativeType, keyFieldsChanged, portfolioKeys, toDateInput } from './utils';

type PortfolioItemOutput = z.output<typeof portfolioItemSchema>;

const FIELDS = [
  'type',
  'title',
  'subjectId',
  'direction',
  'description',
  'organization',
  'date',
  'level',
  'result',
  'evidenceUrl',
  'evidenceFileId',
  'visibility',
] as const;
type FieldName = (typeof FIELDS)[number];
const isFieldName = (value: string): value is FieldName => (FIELDS as readonly string[]).includes(value);

/** Server bilan bir xil cheklovlar (apps/api/src/files/files.service.ts). */
const FILE_MAX_BYTES = 10 * 1024 * 1024;
const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.docx';
const FILE_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'docx'];

const TYPE_GROUPS: { label: string; types: readonly PortfolioItemType[]; teacherOnly?: boolean }[] = [
  { label: 'Ijodiy ishlar', types: CREATIVE_PORTFOLIO_TYPES },
  {
    label: 'Yutuqlar va loyihalar',
    types: PORTFOLIO_ITEM_TYPES.filter(
      (type) => !CREATIVE_PORTFOLIO_TYPES.includes(type) && !TEACHER_ONLY_PORTFOLIO_TYPES.includes(type),
    ),
  },
  { label: 'O‘qituvchi faoliyati', types: TEACHER_ONLY_PORTFOLIO_TYPES, teacherOnly: true },
];

/** Bo‘sh tanlov yoki sana `null` sifatida yuboriladi (sxema bo‘sh satrni qabul qilmaydi). */
const emptyToNull = (value: unknown) => (value === '' || value === undefined ? null : value);

function defaultsFor(item?: PortfolioItemView | null): DefaultValues<PortfolioItemInput> {
  return {
    type: item?.type,
    title: item?.title ?? '',
    subjectId: item?.subject?.id ?? null,
    direction: item?.direction ?? '',
    description: item?.description ?? '',
    organization: item?.organization ?? '',
    date: toDateInput(item?.date),
    level: item?.level ?? null,
    result: item?.result ?? '',
    evidenceUrl: item?.evidenceUrl ?? '',
    evidenceFileId: item?.evidenceFile?.id ?? null,
    visibility: item?.visibility ?? 'STAFF',
  };
}

function uploadErrorMessage(error: unknown) {
  if (error instanceof ApiError && (error.code === 'PAYLOAD_TOO_LARGE' || error.code === 'FILE_TOO_LARGE')) {
    return 'Fayl hajmi 10 MB dan oshmasligi kerak.';
  }
  // FILE_TYPE_NOT_ALLOWED, NO_FILE va boshqalar — serverning o‘zbekcha xabari.
  return errorMessage(error);
}

function successMessage(before: PortfolioItemView | null | undefined, saved: PortfolioItemView, submitted: boolean) {
  if (!before) {
    return submitted
      ? 'Yozuv qo‘shildi va tekshiruvga yuborildi.'
      : 'Yozuv qoralama sifatida saqlandi. Tasdiqlanishi uchun uni tekshiruvga yuboring.';
  }
  if (submitted) return 'O‘zgarishlar saqlandi va yozuv tekshiruvga yuborildi.';
  if (before.status === 'APPROVED' && saved.status === 'DRAFT') {
    return 'O‘zgarishlar saqlandi. Muhim maydonlar o‘zgargani uchun yozuv qoralamaga qaytdi — qayta tasdiqlash uchun yuboring.';
  }
  if (before.status === 'SUBMITTED' && saved.status === 'DRAFT') {
    return 'O‘zgarishlar saqlandi. Yozuv qoralamaga qaytdi — uni tekshiruvga qayta yuboring.';
  }
  return 'O‘zgarishlar saqlandi.';
}

interface SaveRequest {
  values: PortfolioItemOutput;
  submitAfter: boolean;
}

interface SaveResult {
  saved: PortfolioItemView;
  submitted: boolean;
  submitError: string | null;
}

/**
 * Portfolio yozuvini yaratish va tahrirlash formasi (umumiy `portfolioItemSchema` bilan tekshiriladi).
 * Tahrirlashda butun obyekt yuboriladi (PUT). Tasdiqlangan yozuvning muhim maydoni o‘zgarsa yoki
 * tekshiruvdagi yozuv tahrirlansa, saqlashdan oldin ogohlantiriladi.
 */
export function PortfolioForm({
  item,
  onSaved,
  onCancel,
}: {
  item?: PortfolioItemView | null;
  onSaved: (item: PortfolioItemView) => void;
  onCancel: () => void;
}) {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const toast = useToast();
  const subjects = useSubjects();
  const staff = hasRole(me, 'TEACHER', 'DEPUTY', 'ADMIN', 'SUPER_ADMIN');

  const form = useForm<PortfolioItemInput, unknown, PortfolioItemOutput>({
    resolver: zodResolver(portfolioItemSchema),
    defaultValues: defaultsFor(item),
  });
  const {
    register,
    formState: { errors },
  } = form;
  const subjectField = useController({ control: form.control, name: 'subjectId' });
  const watched = useWatch({ control: form.control });

  const [file, setFile] = useState<FileRef | null>(item?.evidenceFile ?? null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<SaveRequest | null>(null);

  const selectedType = watched.type as PortfolioItemType | '' | undefined;
  const creative = selectedType ? isCreativeType(selectedType) : false;
  const keyChanged = item ? keyFieldsChanged(item, watched) : false;
  const author = item?.owner.fullName ?? me?.fullName ?? '';

  const upload = useMutation({
    mutationFn: (selected: File) => api.upload<FileRef>('/files', selected),
    onSuccess: (uploaded) => {
      setFile(uploaded);
      form.setValue('evidenceFileId', uploaded.id, { shouldDirty: true });
      form.clearErrors('evidenceFileId');
    },
    onError: (caught) => setFileError(uploadErrorMessage(caught)),
  });

  const save = useMutation({
    mutationFn: async ({ values, submitAfter }: SaveRequest): Promise<SaveResult> => {
      const saved = item
        ? await api.put<PortfolioItemView>(`/portfolio/${item.id}`, values)
        : await api.post<PortfolioItemView>('/portfolio', values);
      if (!submitAfter) return { saved, submitted: false, submitError: null };
      try {
        return {
          saved: await api.post<PortfolioItemView>(`/portfolio/${saved.id}/submit`),
          submitted: true,
          submitError: null,
        };
      } catch (caught) {
        return { saved, submitted: false, submitError: errorMessage(caught) };
      }
    },
    onSuccess: ({ saved, submitted, submitError }) => {
      queryClient.setQueryData(portfolioKeys.item(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
      if (submitError) toast.error(`Yozuv saqlandi, lekin tekshiruvga yuborilmadi: ${submitError}`);
      else toast.success(successMessage(item, saved, submitted));
      onSaved(saved);
    },
    onError: (caught) => {
      setConfirm(null);
      if (!(caught instanceof ApiError)) {
        setError(errorMessage(caught));
        return;
      }
      let mapped = false;
      for (const [path, message] of Object.entries(caught.fieldErrors)) {
        const name = path.split('.')[0] ?? '';
        if (isFieldName(name)) {
          form.setError(name, { type: 'server', message });
          mapped = true;
        }
      }
      if (caught.code === 'TYPE_NOT_ALLOWED') {
        form.setError('type', { type: 'server', message: caught.message });
        mapped = true;
      }
      setError(
        mapped ? 'Ba’zi maydonlar noto‘g‘ri to‘ldirilgan — belgilangan maydonlarni tekshiring.' : caught.message,
      );
    },
  });

  const handle = (submitAfter: boolean) =>
    form.handleSubmit((values) => {
      setError(null);
      const request = { values, submitAfter };
      const losesApproval = item?.status === 'APPROVED' && keyFieldsChanged(item, values);
      const leavesReview = item?.status === 'SUBMITTED' && !submitAfter;
      if (losesApproval || leavesReview) {
        setConfirm(request);
        return;
      }
      save.mutate(request);
    });

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    setFileError(null);
    const extension = selected.name.split('.').pop()?.toLowerCase() ?? '';
    if (!FILE_EXTENSIONS.includes(extension)) {
      setFileError('Bu turdagi fayl qabul qilinmaydi. Ruxsat etilgan turlar: PDF, JPG, PNG, WEBP, DOCX.');
      return;
    }
    if (selected.size > FILE_MAX_BYTES) {
      setFileError(`Fayl hajmi 10 MB dan oshmasligi kerak (tanlangan fayl: ${formatFileSize(selected.size)}).`);
      return;
    }
    upload.mutate(selected);
  };

  const removeFile = () => {
    setFile(null);
    setFileError(null);
    form.setValue('evidenceFileId', null, { shouldDirty: true });
  };

  const showSubmitButton = !item || item.status !== 'APPROVED' || keyChanged;
  const submitLabel = item?.status === 'SUBMITTED' ? 'Saqlash va qayta yuborish' : 'Saqlash va tekshiruvga yuborish';
  const busy = save.isPending || confirm !== null;
  const evidenceError = fileError ?? errors.evidenceFileId?.message ?? null;

  return (
    <form noValidate onSubmit={handle(false)} className="flex flex-col">
      <div className="space-y-4">
        {item?.status === 'APPROVED' && (
          <Alert tone="warning" title="Yozuv tasdiqlangan">
            Tur, nom, fan, tashkilot, sana, bosqich, natija yoki dalil o‘zgartirilsa, yozuv qoralamaga qaytadi va qayta
            tasdiqlanishi kerak. Tavsif, yo‘nalish va ko‘rinish doirasini o‘zgartirish tasdiqqa ta’sir qilmaydi.
          </Alert>
        )}
        {item?.status === 'SUBMITTED' && (
          <Alert tone="info" title="Yozuv tekshiruvda">
            Tahrirlab saqlasangiz, yozuv qoralamaga qaytadi va tasdiqlovchi navbatidan chiqadi. Uni qayta yuborishingiz
            kerak bo‘ladi.
          </Alert>
        )}
        {item?.status === 'RETURNED' && <ReturnReasonAlert reason={item.returnReason} />}
        {error && <Alert tone="danger">{error}</Alert>}

        <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <legend className="sr-only">Yozuv ma’lumotlari</legend>

          <Field label="Turi" required error={errors.type?.message}>
            <Select {...register('type')}>
              <option value="">Turini tanlang</option>
              {TYPE_GROUPS.map((group) => {
                const types = group.types.filter((type) => staff || !group.teacherOnly || type === item?.type);
                if (types.length === 0) return null;
                return (
                  <optgroup key={group.label} label={group.label}>
                    {types.map((type) => (
                      <option key={type} value={type}>
                        {PORTFOLIO_ITEM_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </Select>
          </Field>

          <Field label="Bosqich" error={errors.level?.message}>
            <Select {...register('level', { setValueAs: emptyToNull })}>
              <option value="">Ko‘rsatilmagan</option>
              {ACHIEVEMENT_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {ACHIEVEMENT_LEVEL_LABELS[level]}
                </option>
              ))}
            </Select>
          </Field>

          {creative && (
            <Alert tone="info" title="Ijodiy ish — muallifligingiz saqlanadi" className="sm:col-span-2">
              Chop etilgan portfolio va eksportda asar “Muallif: {author}” deb ko‘rsatiladi. Tavsif maydoniga asar matni
              yoki qisqa mazmunini yozishingiz mumkin.
            </Alert>
          )}

          <Field label="Nomi" required error={errors.title?.message} className="sm:col-span-2">
            <Input
              maxLength={300}
              placeholder={
                creative ? 'Masalan: “Kuz ohanglari” she’ri' : 'Masalan: Matematika fan olimpiadasi, tuman bosqichi'
              }
              {...register('title')}
            />
          </Field>

          <Field label="Fan" error={errors.subjectId?.message}>
            <Select
              name={subjectField.field.name}
              ref={subjectField.field.ref}
              value={subjectField.field.value ?? ''}
              onChange={(event) => subjectField.field.onChange(event.target.value || null)}
              onBlur={subjectField.field.onBlur}
              disabled={subjects.isPending}
            >
              <option value="">{subjects.isPending ? 'Yuklanmoqda…' : 'Fanga bog‘liq emas'}</option>
              {item?.subject && !subjects.data?.some((subject) => subject.id === item.subject?.id) && (
                <option value={item.subject.id}>{item.subject.name}</option>
              )}
              {subjects.data?.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Yo‘nalish" error={errors.direction?.message}>
            <Input maxLength={200} placeholder="Masalan: she’riyat, robototexnika" {...register('direction')} />
          </Field>

          <Field label="Tashkilot" error={errors.organization?.message}>
            <Input maxLength={300} placeholder="Masalan: Tuman xalq ta’limi bo‘limi" {...register('organization')} />
          </Field>

          <Field label="Sana" error={errors.date?.message}>
            <Input type="date" {...register('date', { setValueAs: emptyToNull })} />
          </Field>

          <Field label="Natija yoki o‘rin" error={errors.result?.message} className="sm:col-span-2">
            <Input maxLength={200} placeholder="Masalan: 1-o‘rin, diplom, faxriy yorliq" {...register('result')} />
          </Field>

          <Field
            label="Tavsif"
            hint={creative ? 'Asar matni yoki qisqa mazmuni.' : 'Qisqacha: nima qilindi va qanday natijaga erishildi.'}
            error={errors.description?.message}
            className="sm:col-span-2"
          >
            <Textarea rows={4} maxLength={5000} {...register('description')} />
          </Field>

          <div className="space-y-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium text-slate-700">Dalil</p>
              <p className="text-xs text-slate-500">
                Diplom, sertifikat, nashr sahifasi yoki ish fayli — tasdiqlovchi shu asosida tekshiradi. Fayl yopiq
                omborda saqlanadi.
              </p>
            </div>
            {file ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <Paperclip className="size-4 shrink-0 text-slate-500" aria-hidden />
                <a
                  href={`/api/files/${file.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-sm font-medium text-brand-700 hover:underline"
                >
                  {file.originalName}
                  <span className="sr-only"> — yangi oynada ochiladi</span>
                </a>
                <span className="text-xs text-slate-500 tabular">{formatFileSize(file.sizeBytes)}</span>
                <Button variant="ghost" size="sm" onClick={removeFile} icon={<X className="size-4" aria-hidden />}>
                  Olib tashlash
                </Button>
              </div>
            ) : (
              <label
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 px-4 py-5',
                  'text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40',
                  'focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30',
                  upload.isPending && 'pointer-events-none opacity-70',
                  evidenceError && 'border-red-300',
                )}
              >
                {upload.isPending ? (
                  <Spinner className="size-5 text-brand-600" label="Fayl yuklanmoqda…" />
                ) : (
                  <>
                    <FileUp className="size-6 text-brand-600" aria-hidden />
                    <span className="text-sm font-medium text-slate-800">Fayl tanlash</span>
                    <span className="text-xs text-slate-500">PDF, JPG, PNG, WEBP yoki DOCX · 10 MB gacha</span>
                  </>
                )}
                <input
                  type="file"
                  accept={FILE_ACCEPT}
                  className="sr-only"
                  onChange={onFileChange}
                  disabled={upload.isPending}
                />
              </label>
            )}
            {evidenceError && (
              <p role="alert" className="text-xs font-medium text-red-600">
                {evidenceError}
              </p>
            )}
            <Field
              label="Tashqi havola"
              hint="Ixtiyoriy. Masalan, nashr yoki tanlov natijalari sahifasi."
              error={errors.evidenceUrl?.message}
            >
              <Input type="url" inputMode="url" placeholder="https://…" maxLength={1000} {...register('evidenceUrl')} />
            </Field>
          </div>

          <Field
            label="Kim ko‘ra oladi"
            hint="Portfolio hech qachon ommaga ochilmaydi. Tasdiqlovchi (sinf rahbari yoki rahbariyat) yozuvni har doim ko‘radi."
            error={errors.visibility?.message}
            className="sm:col-span-2"
          >
            <Select {...register('visibility')}>
              {PORTFOLIO_VISIBILITIES.map((visibility) => (
                <option key={visibility} value={visibility}>
                  {PORTFOLIO_VISIBILITY_LABELS[visibility]}
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>
      </div>

      <div className="sticky bottom-0 -mx-5 -mb-4 mt-5 border-t border-slate-100 bg-white px-5 py-3">
        {confirm ? (
          <div className="space-y-3">
            <Alert
              tone="warning"
              title={
                item?.status === 'SUBMITTED'
                  ? 'Yozuv tekshiruvdan qaytariladi'
                  : 'Yozuv qayta tasdiqlanishi kerak bo‘ladi'
              }
            >
              {item?.status === 'SUBMITTED'
                ? 'Saqlasangiz, yozuv qoralamaga qaytadi va tasdiqlovchi navbatidan chiqadi. Keyin uni qayta yuborishingiz kerak.'
                : 'Muhim maydonlar o‘zgardi. Saqlasangiz, yozuv “Qoralama” holatiga qaytadi va qayta tasdiqlanmaguncha tasdiqlangan yutuq hisoblanmaydi.'}
            </Alert>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirm(null)} disabled={save.isPending}>
                Orqaga
              </Button>
              <Button onClick={() => save.mutate(confirm)} loading={save.isPending}>
                Ha, saqlash
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {item?.status === 'APPROVED' && keyChanged && (
              <p className="mr-auto text-xs font-medium text-amber-700">
                Muhim maydon o‘zgardi — saqlangach qayta tasdiqlash kerak.
              </p>
            )}
            <Button variant="outline" onClick={onCancel}>
              Bekor qilish
            </Button>
            {showSubmitButton && (
              <Button
                variant="secondary"
                onClick={handle(true)}
                disabled={upload.isPending || save.isPending}
                icon={<Send className="size-4" aria-hidden />}
              >
                {submitLabel}
              </Button>
            )}
            <Button
              type="submit"
              loading={save.isPending}
              disabled={upload.isPending}
              icon={<Save className="size-4" aria-hidden />}
            >
              Saqlash
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}

/** Yaratish/tahrirlash oynasi. Har ochilishda forma yangidan boshlanadi. */
export function PortfolioFormDialog({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  item?: PortfolioItemView | null;
  onClose: () => void;
  onSaved?: (item: PortfolioItemView) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={item ? 'Yozuvni tahrirlash' : 'Yangi portfolio yozuvi'}
      description={
        item ? item.title : 'Yozuv qoralama sifatida saqlanadi; tasdiqlanishi uchun uni tekshiruvga yuboring.'
      }
    >
      {open && (
        <PortfolioForm
          key={item?.id ?? 'new'}
          item={item}
          onCancel={onClose}
          onSaved={(saved) => {
            onSaved?.(saved);
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}
