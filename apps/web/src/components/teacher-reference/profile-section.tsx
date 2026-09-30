'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useController, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import {
  ACADEMIC_DEGREES,
  ACADEMIC_DEGREE_LABELS,
  TEACHER_CATEGORIES,
  TEACHER_CATEGORY_LABELS,
  TEACHER_CATEGORY_VALID_YEARS,
  formatDate,
  schoolToday,
  teacherProfileSchema,
  type TeacherCategory,
  type TeacherProfileInput,
} from '@ijod/shared';
import { applyServerErrors, choiceError } from '@/components/admin/form-dialog';
import { useSubjects } from '@/components/portfolio/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import type { FileRef, TeacherReferenceView } from '@/lib/types';
import { DocumentUpload } from './document-upload';
import { Band, FileLink, SectionHeading, SheetRow, notEntered } from './sheet';
import { categoryStatus, emptyToNull, referenceKeys, toNumberOrNull } from './utils';

type ProfileOutput = z.output<typeof teacherProfileSchema>;

const FIELDS = [
  'university',
  'graduationYear',
  'academicDegree',
  'degreeFileId',
  'category',
  'categoryAwardedOn',
  'categoryFileId',
  'specialtySubjectId',
] as const;

function defaultsOf(data: TeacherReferenceView): TeacherProfileInput {
  return {
    university: data.profile.university ?? '',
    graduationYear: data.profile.graduationYear,
    academicDegree: data.profile.academicDegree,
    degreeFileId: data.profile.degreeFile?.id ?? null,
    category: data.profile.category,
    categoryAwardedOn: data.profile.categoryAwardedOn,
    categoryFileId: data.profile.categoryFile?.id ?? null,
    specialtySubjectId: data.specialtySubject?.id ?? null,
  };
}

/** Toifa muddati: 5 yil; tugagan yoki 6 oydan kam qolgan bo‘lsa — ogohlantirish. */
export function CategoryValidity({
  category,
  awardedOn,
  audience = 'self',
}: {
  category: TeacherCategory;
  awardedOn: string | null | undefined;
  audience?: 'self' | 'leadership';
}) {
  if (category === 'NONE') return null;
  const status = categoryStatus(category, awardedOn);
  if (!status) {
    return (
      <p className="text-xs text-slate-500">
        {audience === 'self'
          ? `Berilgan sanani kiriting — amal qilish muddati (${TEACHER_CATEGORY_VALID_YEARS} yil) shundan hisoblanadi.`
          : 'Toifa berilgan sana kiritilmagan — amal qilish muddatini hisoblab bo‘lmaydi.'}
      </p>
    );
  }
  const until = formatDate(status.validUntil);
  if (status.expired) {
    return (
      <Alert tone="warning" title="Toifa muddati tugagan">
        Amal qilish muddati {until} da tugagan.
        {audience === 'self' ? ' Attestatsiyadan o‘tgach, yangi toifa hujjatini yuklang.' : ''}
      </Alert>
    );
  }
  if (status.expiresSoon) {
    return (
      <Alert tone="warning" title="Toifa muddati tugashiga oz qoldi">
        Amal qilish muddati: {until} gacha ({TEACHER_CATEGORY_VALID_YEARS} yil).
        {audience === 'self' ? ' Attestatsiyaga oldindan tayyorlaning.' : ''}
      </Alert>
    );
  }
  return (
    <p className="text-sm text-slate-600">
      Amal qilish muddati: <span className="font-medium text-slate-900">{until} gacha</span> (
      {TEACHER_CATEGORY_VALID_YEARS} yil).
    </p>
  );
}

/** Blok ichidagi band (1–3): raqam va sarlavha, ostida maydonlar. */
function Block({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <Band number={number}>
      <fieldset className="min-w-0 space-y-4">
        <legend className="sr-only">
          {number}. {title}
        </legend>
        <SectionHeading number={number} title={title} as="h3" />
        <div className="space-y-4 sm:pl-10">{children}</div>
      </fieldset>
    </Band>
  );
}

/**
 * Ma’lumotnomaning asosiy qismi (o‘qituvchining o‘zi): mutaxassislik fani, OTM, ilmiy daraja va malaka
 * toifasi. Umumiy `teacherProfileSchema` bilan tekshiriladi; server xatolari maydonlar ostida ko‘rinadi.
 */
export function ProfileForm({ data }: { data: TeacherReferenceView }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const subjects = useSubjects();
  const [error, setError] = useState<string | null>(null);
  const [degreeFile, setDegreeFile] = useState<FileRef | null>(data.profile.degreeFile);
  const [categoryFile, setCategoryFile] = useState<FileRef | null>(data.profile.categoryFile);
  const form = useForm<TeacherProfileInput, unknown, ProfileOutput>({
    resolver: zodResolver(teacherProfileSchema),
    defaultValues: defaultsOf(data),
  });
  const {
    register,
    formState: { errors, isDirty, isSubmitting },
  } = form;
  const specialtyField = useController({ control: form.control, name: 'specialtySubjectId' });
  const watched = useWatch({ control: form.control });
  const category = (watched.category ?? 'NONE') as TeacherCategory;
  const degree = watched.academicDegree ?? 'NONE';

  // Saqlanmagan o‘zgarish bilan sahifani yopish yoki yangilashda brauzer ogohlantiradi.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const save = useMutation({
    mutationFn: (values: ProfileOutput) => api.put<TeacherReferenceView>('/me/teacher-profile', values),
    onSuccess: (result) => {
      queryClient.setQueryData(referenceKeys.own, result);
      // Mutaxassislik o‘zgargan bo‘lishi mumkin — ustozlik nomzodlari qayta hisoblanadi.
      void queryClient.invalidateQueries({ queryKey: [...referenceKeys.all, 'candidates'] });
      form.reset(defaultsOf(result));
      setDegreeFile(result.profile.degreeFile);
      setCategoryFile(result.profile.categoryFile);
      toast.success('Ma’lumotnoma saqlandi.');
    },
  });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await save.mutateAsync(values);
    } catch (caught) {
      setError(applyServerErrors(caught, form.setError, FIELDS, { SPECIALTY_REQUIRED: 'specialtySubjectId' }));
    }
  });

  const discard = () => {
    setError(null);
    form.reset(defaultsOf(data));
    setDegreeFile(data.profile.degreeFile);
    setCategoryFile(data.profile.categoryFile);
  };

  const setFile = (field: 'degreeFileId' | 'categoryFileId', file: FileRef | null) => {
    (field === 'degreeFileId' ? setDegreeFile : setCategoryFile)(file);
    form.setValue(field, file?.id ?? null, { shouldDirty: true });
    form.clearErrors(field);
  };

  // Hujjat yuklanayotganda forma saqlanmaydi (aks holda eski fayl bilan saqlanib qoladi).
  const [uploads, setUploads] = useState({ degreeFileId: false, categoryFileId: false });
  const uploading = uploads.degreeFileId || uploads.categoryFileId;
  const trackUpload = (field: 'degreeFileId' | 'categoryFileId') => (value: boolean) =>
    setUploads((state) => (state[field] === value ? state : { ...state, [field]: value }));

  const currentSpecialty = data.specialtySubject;
  const specialtyOptions = [
    ...(currentSpecialty && !subjects.data?.some((subject) => subject.id === currentSpecialty.id)
      ? [currentSpecialty]
      : []),
    ...(subjects.data ?? []),
  ];
  const specialtyChanging = (specialtyField.field.value ?? null) !== (currentSpecialty?.id ?? null);
  const hasNational = data.credentials.some(
    (credential) => credential.kind === 'SPECIALTY_NATIONAL' || credential.kind === 'OTHER_NATIONAL',
  );
  const busy = isSubmitting || save.isPending;

  return (
    <Card>
      <form
        onSubmit={(event) => {
          if (uploading) {
            event.preventDefault();
            return;
          }
          void submit(event);
        }}
        noValidate
      >
        <CardBody className="space-y-6">
          {error && <Alert tone="danger">{error}</Alert>}

          <fieldset disabled={busy} className="min-w-0 space-y-6">
            <legend className="sr-only">Ma’lumotnomaning asosiy qismi</legend>
            <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
              <Field
                label="Mutaxassislik fani"
                hint="Asosiy dars beradigan faningiz: 4-band va o‘quvchilar sertifikatlariga ustozlik (10–11) shu fan bo‘yicha."
                error={errors.specialtySubjectId?.message}
              >
                <Select
                  name={specialtyField.field.name}
                  ref={specialtyField.field.ref}
                  value={specialtyField.field.value ?? ''}
                  onChange={(event) => specialtyField.field.onChange(event.target.value || null)}
                  onBlur={specialtyField.field.onBlur}
                  disabled={subjects.isPending}
                >
                  <option value="">{subjects.isPending ? 'Yuklanmoqda…' : 'Tanlanmagan'}</option>
                  {specialtyOptions.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {specialtyChanging && hasNational && (
                <p className="mt-2 text-xs text-slate-600">
                  Saqlangach milliy sertifikatlar faniga qarab 4-band (mutaxassislik) va 6-band (boshqa fanlar) orasida
                  avtomatik ko‘chiriladi.
                </p>
              )}
            </div>

            <Block number={1} title="Ta’lim olgan oliy ta’lim muassasasi (OTM)">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <Field
                  label="OTM nomi"
                  hint="Diplomdagi to‘liq nomi, masalan: Nizomiy nomidagi Toshkent davlat pedagogika universiteti."
                  error={errors.university?.message}
                >
                  <Input maxLength={300} autoComplete="off" {...register('university')} />
                </Field>
                <Field
                  label="Bitirgan yili"
                  hint="Ixtiyoriy."
                  error={choiceError(errors.graduationYear, 'Yilni 4 xonali son bilan kiriting (1950–2100).')}
                >
                  <Input
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="Masalan: 2012"
                    autoComplete="off"
                    {...register('graduationYear', { setValueAs: toNumberOrNull })}
                  />
                </Field>
              </div>
            </Block>

            <Block number={2} title="Ilmiy darajasi">
              <Field label="Ilmiy daraja" error={errors.academicDegree?.message} className="sm:max-w-sm">
                <Select {...register('academicDegree')}>
                  {ACADEMIC_DEGREES.map((value) => (
                    <option key={value} value={value}>
                      {ACADEMIC_DEGREE_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>
              {degree !== 'NONE' && (
                <DocumentUpload
                  label="Diplom nusxasi"
                  hint="Ixtiyoriy: fan nomzodi, PhD yoki DSc diplomi."
                  file={degreeFile}
                  onChange={(file) => setFile('degreeFileId', file)}
                  onUploadingChange={trackUpload('degreeFileId')}
                  error={errors.degreeFileId?.message}
                  disabled={busy}
                />
              )}
            </Block>

            <Block number={3} title="Malaka toifasi">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Toifa" error={errors.category?.message}>
                  <Select {...register('category')}>
                    {TEACHER_CATEGORIES.map((value) => (
                      <option key={value} value={value}>
                        {TEACHER_CATEGORY_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                </Field>
                {category !== 'NONE' && (
                  <Field
                    label="Berilgan sana"
                    hint="Attestatsiya natijasi bo‘yicha buyruq sanasi."
                    error={errors.categoryAwardedOn?.message}
                  >
                    <Input
                      type="date"
                      max={schoolToday()}
                      {...register('categoryAwardedOn', { setValueAs: emptyToNull })}
                    />
                  </Field>
                )}
              </div>
              {category !== 'NONE' && (
                <>
                  <CategoryValidity category={category} awardedOn={watched.categoryAwardedOn} />
                  <DocumentUpload
                    label="Toifa to‘g‘risidagi hujjat"
                    required
                    hint="Guvohnoma yoki buyruqdan ko‘chirma — toifa tanlanganda majburiy."
                    file={categoryFile}
                    onChange={(file) => setFile('categoryFileId', file)}
                    onUploadingChange={trackUpload('categoryFileId')}
                    error={errors.categoryFileId?.message}
                    disabled={busy}
                  />
                </>
              )}
            </Block>
          </fieldset>
        </CardBody>
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-slate-50 px-5 py-3">
          {(isDirty || uploading) && (
            <p className="mr-auto text-xs font-medium text-amber-700" role="status">
              {uploading ? 'Hujjat yuklanmoqda…' : 'Saqlanmagan o‘zgarishlar bor'}
            </p>
          )}
          {isDirty && (
            <Button variant="ghost" onClick={discard} disabled={busy || uploading}>
              Bekor qilish
            </Button>
          )}
          <Button
            type="submit"
            loading={busy}
            disabled={!isDirty || uploading}
            icon={<Save className="size-4" aria-hidden />}
          >
            Saqlash
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Rahbariyat uchun: asosiy qism faqat ko‘rish rejimida. */
export function ProfileSummary({ data }: { data: TeacherReferenceView }) {
  const { profile } = data;
  const status = categoryStatus(profile.category, profile.categoryAwardedOn);
  return (
    <Card>
      <CardBody className="space-y-6">
        <dl className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-1">
          <SheetRow label="Mutaxassislik fani">{data.specialtySubject?.name ?? notEntered}</SheetRow>
        </dl>

        <Band number={1}>
          <SectionHeading number={1} title="Ta’lim olgan oliy ta’lim muassasasi (OTM)" as="h3" />
          <dl className="mt-2 divide-y divide-slate-100 sm:pl-10">
            <SheetRow label="OTM nomi">{profile.university ?? notEntered}</SheetRow>
            <SheetRow label="Bitirgan yili">{profile.graduationYear ?? notEntered}</SheetRow>
          </dl>
        </Band>

        <Band number={2}>
          <SectionHeading number={2} title="Ilmiy darajasi" as="h3" />
          <dl className="mt-2 divide-y divide-slate-100 sm:pl-10">
            <SheetRow label="Ilmiy daraja">{ACADEMIC_DEGREE_LABELS[profile.academicDegree]}</SheetRow>
            {profile.academicDegree !== 'NONE' && (
              <SheetRow label="Diplom">
                {profile.degreeFile ? <FileLink file={profile.degreeFile} /> : notEntered}
              </SheetRow>
            )}
          </dl>
        </Band>

        <Band number={3}>
          <SectionHeading number={3} title="Malaka toifasi" as="h3" />
          <dl className="mt-2 divide-y divide-slate-100 sm:pl-10">
            <SheetRow label="Toifa">
              <span className="inline-flex flex-wrap items-center gap-2">
                {TEACHER_CATEGORY_LABELS[profile.category]}
                {status?.expired && <Badge tone="red">Muddati tugagan</Badge>}
                {status?.expiresSoon && <Badge tone="amber">Muddati tugayapti</Badge>}
              </span>
            </SheetRow>
            {profile.category !== 'NONE' && (
              <>
                <SheetRow label="Berilgan sana">
                  {profile.categoryAwardedOn ? formatDate(profile.categoryAwardedOn) : notEntered}
                </SheetRow>
                <SheetRow label="Amal qilish muddati">
                  {profile.categoryValidUntil
                    ? `${formatDate(profile.categoryValidUntil)} gacha (${TEACHER_CATEGORY_VALID_YEARS} yil)`
                    : notEntered}
                </SheetRow>
                <SheetRow label="Hujjat">
                  {profile.categoryFile ? (
                    <FileLink file={profile.categoryFile} />
                  ) : (
                    <Badge tone="red">Yuklanmagan</Badge>
                  )}
                </SheetRow>
              </>
            )}
          </dl>
          {status && (status.expired || status.expiresSoon) && (
            <div className="mt-3 sm:pl-10">
              <CategoryValidity
                category={profile.category}
                awardedOn={profile.categoryAwardedOn}
                audience="leadership"
              />
            </div>
          )}
        </Band>
      </CardBody>
    </Card>
  );
}
