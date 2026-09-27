'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp, Paperclip, Save, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
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
  isLegacyPortfolioDetails,
  isStructuredPortfolioType,
  normalizeForSearch,
  portfolioDetailsSummary,
  portfolioItemSchema,
  portfolioItemUpdateSchema,
  type AchievementLevel,
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
import { DetailsFields, initialDetails, type DetailsErrors, type DetailsValue } from './details-fields';
import { ReturnReasonAlert } from './parts';
import { useSubjects } from './queries';
import {
  DEFAULT_ORGANIZATION,
  ORGANIZATION_SUGGESTIONS,
  formatFileSize,
  isCreativeType,
  keyFieldsChanged,
  portfolioKeys,
  suggestTitle,
  toDateInput,
} from './utils';

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
  'details',
  'visibility',
] as const;
type FieldName = (typeof FIELDS)[number];
const isFieldName = (value: string): value is FieldName => (FIELDS as readonly string[]).includes(value);

/** Server bilan bir xil cheklovlar (apps/api/src/files/files.service.ts). */
const FILE_MAX_BYTES = 10 * 1024 * 1024;
const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.docx';
const FILE_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'docx'];

const CERTIFICATE_GROUP: readonly PortfolioItemType[] = ['NATIONAL_CERTIFICATE', 'CEFR', 'IELTS', 'SAT', 'CERTIFICATE'];
const OLYMPIAD_GROUP: readonly PortfolioItemType[] = ['OLYMPIAD', 'CONTEST'];

const TYPE_GROUPS: { label: string; types: readonly PortfolioItemType[]; teacherOnly?: boolean }[] = [
  { label: 'Sertifikatlar va imtihonlar', types: CERTIFICATE_GROUP },
  { label: 'Olimpiada va tanlovlar', types: OLYMPIAD_GROUP },
  { label: 'Ijodiy ishlar', types: CREATIVE_PORTFOLIO_TYPES },
  {
    label: 'Loyihalar va boshqa',
    types: PORTFOLIO_ITEM_TYPES.filter(
      (type) =>
        !CERTIFICATE_GROUP.includes(type) &&
        !OLYMPIAD_GROUP.includes(type) &&
        !CREATIVE_PORTFOLIO_TYPES.includes(type) &&
        !TEACHER_ONLY_PORTFOLIO_TYPES.includes(type),
    ),
  },
  { label: 'O‘qituvchi faoliyati', types: TEACHER_ONLY_PORTFOLIO_TYPES, teacherOnly: true },
];

/** Tur tanlanganda bo‘sh bosqich shu qiymat bilan to‘ldiriladi. */
const DEFAULT_LEVEL: Partial<Record<PortfolioItemType, AchievementLevel>> = {
  NATIONAL_CERTIFICATE: 'NATIONAL',
  IELTS: 'INTERNATIONAL',
  SAT: 'INTERNATIONAL',
};

/** Bo‘sh tanlov yoki sana `null` sifatida yuboriladi (sxema bo‘sh satrni qabul qilmaydi). */
const emptyToNull = (value: unknown) => (value === '' || value === undefined ? null : value);

const asDetails = (value: unknown): DetailsValue =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as DetailsValue) : {};

function defaultsFor(
  item?: PortfolioItemView | null,
  presetType?: PortfolioItemType,
): DefaultValues<PortfolioItemInput> {
  const type = item?.type ?? presetType;
  return {
    type,
    title: item?.title ?? '',
    subjectId: item?.subject?.id ?? null,
    direction: item?.direction ?? '',
    description: item?.description ?? '',
    organization: item?.organization ?? (presetType ? (DEFAULT_ORGANIZATION[presetType] ?? '') : ''),
    date: toDateInput(item?.date),
    level: item?.level ?? (presetType ? (DEFAULT_LEVEL[presetType] ?? null) : null),
    result: item?.result ?? '',
    details: item ? (item.details ?? null) : type && isStructuredPortfolioType(type) ? initialDetails(type) : null,
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

/** zod xatolari `details.<maydon>` yo‘li bilan keladi — ichki maydonlar bo‘yicha xabarlar. */
function detailErrorsOf(value: unknown): DetailsErrors {
  if (!value || typeof value !== 'object') return {};
  const result: DetailsErrors = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const message = (entry as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string' && key !== 'message' && key !== 'type' && key !== 'ref') result[key] = message;
  }
  return result;
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
 * Tur tanlanganda maydonlar moslashadi: milliy sertifikat, CEFR, IELTS, SAT va olimpiada uchun tuzilgan
 * maydonlar chiqadi, natija ulardan avtomatik yasaladi. Tahrirlashda butun obyekt yuboriladi (PUT).
 */
export function PortfolioForm({
  item,
  presetType,
  onSaved,
  onCancel,
}: {
  item?: PortfolioItemView | null;
  /** Tezkor qo‘shish tugmasidan kelgan tur (faqat yangi yozuv uchun). */
  presetType?: PortfolioItemType;
  onSaved: (item: PortfolioItemView) => void;
  onCancel: () => void;
}) {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const toast = useToast();
  const subjects = useSubjects();
  const staff = hasRole(me, 'TEACHER', 'DEPUTY', 'ADMIN', 'SUPER_ADMIN');
  const organizationListId = useId();
  // Avvalgi shaklda kiritilgan olimpiada (fan va o‘rin alohida yo‘q): ular to‘ldirilmaguncha natija matni
  // saqlanadi va tasdiq bekor bo‘lmaydi (server ham shunday yozuv uchun details’ni majburiy qilmaydi).
  const legacyItem = Boolean(item && isLegacyPortfolioDetails(item.type, item.details));

  const form = useForm<PortfolioItemInput, unknown, PortfolioItemOutput>({
    resolver: zodResolver(legacyItem ? portfolioItemUpdateSchema : portfolioItemSchema),
    defaultValues: defaultsFor(item, presetType),
  });
  const {
    register,
    formState: { errors },
  } = form;
  const subjectField = useController({ control: form.control, name: 'subjectId' });
  const detailsField = useController({ control: form.control, name: 'details' });
  const watched = useWatch({ control: form.control });

  const [file, setFile] = useState<FileRef | null>(item?.evidenceFile ?? null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<SaveRequest | null>(null);

  const selectedType = watched.type as PortfolioItemType | '' | undefined;
  const structured = selectedType ? isStructuredPortfolioType(selectedType) : false;
  const certificate = selectedType ? CERTIFICATE_GROUP.includes(selectedType) : false;
  const creative = selectedType ? isCreativeType(selectedType) : false;
  const olympiad = selectedType === 'OLYMPIAD';
  const details = asDetails(detailsField.field.value);
  const legacy = legacyItem && selectedType === 'OLYMPIAD' && isLegacyPortfolioDetails(selectedType, details);
  // Umumiy maydonlar (fan, yo‘nalish, natija) tuzilgan turlarda yashiriladi, eski olimpiadada qoladi.
  const generic = !structured || legacy;
  const summary = structured && selectedType ? portfolioDetailsSummary(selectedType, details) : null;
  const keyChanged = item ? keyFieldsChanged(item, watched) : false;
  const author = item?.owner.fullName ?? me?.fullName ?? '';

  // Nom taklifi: foydalanuvchi nomni o‘zi o‘zgartirmagan bo‘lsa, ma’lumotlar bilan birga yangilanadi.
  const suggestion = suggestTitle(selectedType, details, watched.level as AchievementLevel | null | undefined);
  const lastSuggestion = useRef(item ? suggestTitle(item.type, item.details, item.level) : null);
  useEffect(() => {
    if (!suggestion) return;
    const title = form.getValues('title') ?? '';
    if (!title.trim() || title === lastSuggestion.current) {
      form.setValue('title', suggestion, { shouldDirty: true });
      form.clearErrors('title');
    }
    lastSuggestion.current = suggestion;
  }, [suggestion, form]);

  // Milliy sertifikat va olimpiada fani maktab fanlari ro‘yxatiga moslanadi (filtrlar uchun).
  const detailSubject =
    selectedType === 'NATIONAL_CERTIFICATE' || selectedType === 'OLYMPIAD'
      ? typeof details.subject === 'string'
        ? details.subject
        : ''
      : null;
  const initialDetailsSubject = asDetails(item?.details).subject;
  const initialSubject = typeof initialDetailsSubject === 'string' ? initialDetailsSubject : null;
  useEffect(() => {
    if (detailSubject === null || !subjects.data) return;
    // Tahrirlashda fan o‘zgarmagan bo‘lsa (eski olimpiadada details bo‘sh) — saqlangan fan qoladi.
    if (item && detailSubject === (initialSubject ?? '') && selectedType === item.type) return;
    const needle = normalizeForSearch(detailSubject);
    const match = needle ? subjects.data.find((subject) => normalizeForSearch(subject.name) === needle) : undefined;
    const next = match?.id ?? null;
    if ((form.getValues('subjectId') ?? null) !== next) form.setValue('subjectId', next, { shouldDirty: true });
  }, [detailSubject, initialSubject, subjects.data, form, item, selectedType]);

  const typeField = register('type');
  const onTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const previous = form.getValues('type');
    void typeField.onChange(event);
    const next = event.target.value as PortfolioItemType | '';
    if (next === previous) return;
    // Turga xos maydonlar yangi turdan boshlanadi. Tuzilgan turlarda fan va yo‘nalish yashirin — eski
    // qiymatlar saqlanib qolmasligi uchun tozalanadi (milliy sertifikat va olimpiadada fan details dan olinadi).
    const nextStructured = Boolean(next && isStructuredPortfolioType(next));
    form.setValue('details', next && isStructuredPortfolioType(next) ? initialDetails(next) : null);
    form.clearErrors('details');
    if (nextStructured) {
      form.setValue('subjectId', null);
      form.setValue('direction', '');
    }
    if (!form.getValues('level') && next && DEFAULT_LEVEL[next]) form.setValue('level', DEFAULT_LEVEL[next]);
    const organization = (form.getValues('organization') ?? '').trim();
    const previousDefault = previous ? DEFAULT_ORGANIZATION[previous] : undefined;
    if (!organization || organization === previousDefault) {
      form.setValue('organization', (next && DEFAULT_ORGANIZATION[next]) || '');
    }
    const title = form.getValues('title') ?? '';
    if (title && title === lastSuggestion.current) form.setValue('title', '');
  };

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
        if (name === 'details' && path !== 'details') {
          // Ichki maydon: details.overall, details.total …
          form.setError(path as never, { type: 'server', message });
          mapped = true;
        } else if (isFieldName(name)) {
          form.setError(name, { type: 'server', message });
          mapped = true;
        }
      }
      if (caught.code === 'TYPE_NOT_ALLOWED') {
        form.setError('type', { type: 'server', message: caught.message });
        mapped = true;
      }
      if (caught.status === 404 && caught.message.startsWith('Fayl')) {
        setFileError(
          'Dalil fayli topilmadi yoki ishlatib bo‘lmaydi (profil rasmi dalil bo‘la olmaydi). Boshqa fayl yuklang.',
        );
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
      const keepsLegacy = legacyItem && isLegacyPortfolioDetails(values.type, values.details);
      if (values.type === 'OLYMPIAD' && !values.level && !keepsLegacy) {
        form.setError('level', { type: 'manual', message: 'Olimpiada bosqichini tanlang' });
        return;
      }
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
  const detailErrors = detailErrorsOf(errors.details);
  const organizationOptions = [
    ...(selectedType === 'CEFR' && typeof details.provider === 'string' && details.provider ? [details.provider] : []),
    ...((selectedType && ORGANIZATION_SUGGESTIONS[selectedType]) ?? []),
  ].filter((value, index, all) => all.indexOf(value) === index);
  const currentTitle = watched.title ?? '';

  return (
    <form noValidate onSubmit={handle(false)} className="flex flex-col">
      <div className="space-y-4">
        {item?.status === 'APPROVED' && (
          <Alert tone="warning" title="Yozuv tasdiqlangan">
            Tur, nom, fan, tashkilot, sana, bosqich, natija, sertifikat ma’lumotlari yoki dalil o‘zgartirilsa, yozuv
            qoralamaga qaytadi va qayta tasdiqlanishi kerak. Tavsif, yo‘nalish va ko‘rinish doirasini o‘zgartirish
            tasdiqqa ta’sir qilmaydi.
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
            <Select {...typeField} onChange={onTypeChange}>
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

          <Field label="Bosqich" required={olympiad && !legacy} error={errors.level?.message}>
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

          {structured && selectedType && isStructuredPortfolioType(selectedType) && (
            <div className="space-y-4 rounded-xl border border-brand-100 bg-brand-50/40 p-4 sm:col-span-2">
              <p className="text-sm font-semibold text-slate-800">
                {olympiad ? 'Olimpiada natijasi' : `${PORTFOLIO_ITEM_TYPE_LABELS[selectedType]} ma’lumotlari`}
              </p>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <DetailsFields
                  key={selectedType}
                  type={selectedType}
                  value={details}
                  onChange={(next) => detailsField.field.onChange(next)}
                  errors={detailErrors}
                  optional={legacy}
                />
              </div>
              {legacy ? (
                <p className="text-sm text-slate-600">
                  Bu yozuv avvalgi shaklda kiritilgan: fan va o‘rin alohida ko‘rsatilmagan, natija quyidagi “Natija yoki
                  o‘rin” maydonida. Ularni to‘ldirsangiz, natija shulardan avtomatik yoziladi (tasdiqlangan yozuv qayta
                  tasdiqlanishi kerak bo‘ladi). Bo‘sh qoldirsangiz, yozuv avvalgidek saqlanadi.
                </p>
              ) : (
                <p className="text-sm">
                  <span className="text-slate-500">Natija (avtomatik): </span>
                  {summary ? (
                    <span className="font-medium text-slate-900">{summary}</span>
                  ) : (
                    <span className="text-slate-500">majburiy maydonlarni to‘ldiring</span>
                  )}
                </p>
              )}
            </div>
          )}

          <Field
            label="Nomi"
            required
            error={errors.title?.message}
            className="sm:col-span-2"
            hint={
              suggestion && currentTitle.trim() !== suggestion ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                  onClick={() => {
                    form.setValue('title', suggestion, { shouldDirty: true });
                    lastSuggestion.current = suggestion;
                  }}
                >
                  <Sparkles className="size-3.5" aria-hidden />
                  Taklif: “{suggestion}” — qo‘llash
                </button>
              ) : structured ? (
                'Ma’lumotlardan avtomatik taklif qilinadi — xohlasangiz o‘zgartiring.'
              ) : undefined
            }
          >
            <Input
              maxLength={300}
              placeholder={
                creative
                  ? 'Masalan: “Kuz ohanglari” she’ri'
                  : certificate
                    ? 'Masalan: Milliy sertifikat — Matematika (A+)'
                    : 'Masalan: Matematika fan olimpiadasi, tuman bosqichi'
              }
              {...register('title')}
            />
          </Field>

          {generic && (
            <>
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
            </>
          )}

          <Field
            label={certificate ? 'Tashkilot (sertifikat bergan)' : 'Tashkilot'}
            error={errors.organization?.message}
          >
            <Input
              maxLength={300}
              list={organizationOptions.length ? organizationListId : undefined}
              placeholder={
                organizationOptions[0] ? `Masalan: ${organizationOptions[0]}` : 'Masalan: Tuman xalq ta’limi bo‘limi'
              }
              {...register('organization')}
            />
          </Field>
          {organizationOptions.length > 0 && (
            <datalist id={organizationListId}>
              {organizationOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          )}

          <Field label={certificate ? 'Imtihon (berilgan) sanasi' : 'Sana'} error={errors.date?.message}>
            <Input type="date" {...register('date', { setValueAs: emptyToNull })} />
          </Field>

          {generic && (
            <Field label="Natija yoki o‘rin" error={errors.result?.message} className="sm:col-span-2">
              <Input maxLength={200} placeholder="Masalan: 1-o‘rin, diplom, faxriy yorliq" {...register('result')} />
            </Field>
          )}

          <Field
            label="Tavsif"
            hint={
              creative
                ? 'Asar matni yoki qisqa mazmuni.'
                : structured
                  ? 'Ixtiyoriy: qo‘shimcha izoh (masalan, qaysi maqsadda topshirilgan).'
                  : 'Qisqacha: nima qilindi va qanday natijaga erishildi.'
            }
            error={errors.description?.message}
            className="sm:col-span-2"
          >
            <Textarea rows={structured ? 2 : 4} maxLength={5000} {...register('description')} />
          </Field>

          <div className="space-y-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium text-slate-700">Dalil</p>
              <p className="text-xs text-slate-500">
                {certificate
                  ? 'Sertifikat skaneri yoki PDF nusxasi — tasdiqlovchi shu asosida tekshiradi.'
                  : 'Diplom, sertifikat, nashr sahifasi yoki ish fayli — tasdiqlovchi shu asosida tekshiradi.'}{' '}
                Fayl yopiq omborda saqlanadi.
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
                    <span className="text-sm font-medium text-slate-800">
                      {certificate ? 'Sertifikat faylini tanlash' : 'Fayl tanlash'}
                    </span>
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
              <p role="alert" className="text-xs font-medium text-red-700">
                {evidenceError}
              </p>
            )}
            <Field
              label="Tashqi havola"
              hint={
                certificate
                  ? 'Ixtiyoriy. Masalan, sertifikatni tekshirish sahifasi.'
                  : 'Ixtiyoriy. Masalan, nashr yoki tanlov natijalari sahifasi.'
              }
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

      <div className="sticky bottom-0 -mx-5 -mb-4 mt-5 border-t border-slate-100 bg-surface px-5 py-3">
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
  presetType,
  onClose,
  onSaved,
}: {
  open: boolean;
  item?: PortfolioItemView | null;
  presetType?: PortfolioItemType;
  onClose: () => void;
  onSaved?: (item: PortfolioItemView) => void;
}) {
  const presetLabel = presetType ? PORTFOLIO_ITEM_TYPE_LABELS[presetType] : null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={item ? 'Yozuvni tahrirlash' : presetLabel ? `Yangi yozuv: ${presetLabel}` : 'Yangi portfolio yozuvi'}
      description={
        item ? item.title : 'Yozuv qoralama sifatida saqlanadi; tasdiqlanishi uchun uni tekshiruvga yuboring.'
      }
    >
      {open && (
        <PortfolioForm
          key={item?.id ?? `new:${presetType ?? ''}`}
          item={item}
          presetType={presetType}
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
