'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useController, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import {
  INTERNATIONAL_CERTIFICATE_LABELS,
  INTERNATIONAL_CERTIFICATE_TYPES,
  NATIONAL_CERTIFICATE_GRADES,
  TEACHER_CREDENTIAL_FILE_REQUIRED,
  TEACHER_CREDENTIAL_KIND_LABELS,
  schoolToday,
  teacherCredentialSchema,
  type InternationalCertificateType,
  type TeacherCredentialInput,
  type TeacherCredentialKind,
} from '@ijod/shared';
import { FormDialog, applyServerErrors, choiceError } from '@/components/admin/form-dialog';
import { useSubjects } from '@/components/portfolio/queries';
import { Alert } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import type { FileRef, Ref, TeacherCredentialView, TeacherReferenceView } from '@/lib/types';
import { DocumentUpload } from './document-upload';
import { CREDENTIAL_SECTION_NUMBERS, credentialGroup, emptyToNull, referenceKeys, toNumberOrNull } from './utils';

type CredentialOutput = z.output<typeof teacherCredentialSchema>;

const FIELDS = [
  'kind',
  'title',
  'subjectId',
  'provider',
  'level',
  'score',
  'certificateNumber',
  'issuedOn',
  'validUntil',
  'certificateType',
  'fileId',
] as const;

/** Xalqaro sertifikat nomi turidan: “CEFR (Multilevel va boshqalar)” → “CEFR”. */
const typeTitle = (type: InternationalCertificateType) =>
  type === 'OTHER' ? '' : INTERNATIONAL_CERTIFICATE_LABELS[type].replace(/\s*\(.*\)\s*$/, '');

const nationalTitle = (subject: string) => `Milliy sertifikat — ${subject}`;

function defaultsFor(
  kind: TeacherCredentialKind,
  credential: TeacherCredentialView | null,
  specialty: Ref | null,
): TeacherCredentialInput {
  if (credential) {
    return {
      kind: credential.kind,
      title: credential.title,
      subjectId: credential.subject?.id ?? null,
      provider: credential.provider ?? '',
      level: credential.level ?? '',
      score: credential.score,
      certificateNumber: credential.certificateNumber ?? '',
      issuedOn: credential.issuedOn,
      validUntil: credential.validUntil,
      certificateType: credential.certificateType,
      fileId: credential.file?.id ?? null,
    };
  }
  return {
    kind,
    title: '',
    subjectId: kind === 'SPECIALTY_NATIONAL' ? (specialty?.id ?? null) : null,
    provider: '',
    level: '',
    score: null,
    certificateNumber: '',
    issuedOn: null,
    validUntil: null,
    certificateType: null,
    fileId: null,
  };
}

/**
 * Hujjat formasi: maydonlar band turiga qarab — milliy sertifikat (fan, daraja A+…C), xalqaro sertifikat
 * (turi, daraja/ball, tashkilot), kurs yoki tanlov (nomi, tashkilot, sana, natija). Fayl 4–7-bandlarda majburiy.
 */
function CredentialForm({
  formId,
  kind,
  credential,
  specialty,
  onPendingChange,
  onUploadingChange,
  onSaved,
}: {
  formId: string;
  kind: TeacherCredentialKind;
  credential: TeacherCredentialView | null;
  specialty: Ref | null;
  onPendingChange: (pending: boolean) => void;
  onUploadingChange: (uploading: boolean) => void;
  onSaved: (saved: TeacherCredentialView) => void;
}) {
  const group = credentialGroup(kind);
  const subjects = useSubjects();
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<FileRef | null>(credential?.file ?? null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    onUploadingChange(uploading);
  }, [uploading, onUploadingChange]);
  // Oyna yopilganda (yuklash yoki saqlash to‘xtatilgan bo‘lsa ham) holat tozalanadi.
  useEffect(
    () => () => {
      onUploadingChange(false);
      onPendingChange(false);
    },
    [onUploadingChange, onPendingChange],
  );
  const form = useForm<TeacherCredentialInput, unknown, CredentialOutput>({
    resolver: zodResolver(teacherCredentialSchema),
    defaultValues: defaultsFor(kind, credential, specialty),
  });
  const {
    register,
    formState: { errors, isSubmitting },
  } = form;
  useEffect(() => {
    onPendingChange(isSubmitting);
  }, [isSubmitting, onPendingChange]);
  const subjectField = useController({ control: form.control, name: 'subjectId' });
  const certificateType = useWatch({ control: form.control, name: 'certificateType' }) as
    InternationalCertificateType | null | undefined;

  // Xalqaro sertifikat nomi turidan taklif qilinadi; foydalanuvchi o‘zgartirgan nom saqlanadi.
  const lastSuggestion = useRef(credential?.certificateType ? typeTitle(credential.certificateType) : '');
  useEffect(() => {
    if (group !== 'international' || !certificateType) return;
    const suggestion = typeTitle(certificateType);
    const title = form.getValues('title') ?? '';
    if (!title.trim() || title === lastSuggestion.current) {
      form.setValue('title', suggestion, { shouldDirty: true });
      if (suggestion) form.clearErrors('title');
    }
    lastSuggestion.current = suggestion;
  }, [certificateType, group, form]);

  const subjectOptions =
    kind === 'OTHER_NATIONAL'
      ? [
          ...(credential?.subject && !subjects.data?.some((subject) => subject.id === credential.subject?.id)
            ? [credential.subject]
            : []),
          ...(subjects.data ?? []).filter((subject) => subject.id !== specialty?.id),
        ]
      : [];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    // Hujjat yuklanayotganda saqlanmaydi (aks holda fayl biriktirilmay qoladi).
    if (uploading) {
      event.preventDefault();
      return;
    }
    // Milliy sertifikat nomi fanidan yasaladi (forma nom so‘ramaydi).
    if (group === 'national') {
      const subjectId = form.getValues('subjectId');
      const subjectName =
        kind === 'SPECIALTY_NATIONAL'
          ? specialty?.name
          : subjectOptions.find((subject) => subject.id === subjectId)?.name;
      if (subjectName) form.setValue('title', nationalTitle(subjectName));
      else if (!form.getValues('title')) form.setValue('title', 'Milliy sertifikat');
    }
    return form.handleSubmit(async (values) => {
      setError(null);
      try {
        const saved = credential
          ? await api.put<TeacherCredentialView>(`/me/teacher-credentials/${credential.id}`, values)
          : await api.post<TeacherCredentialView>('/me/teacher-credentials', values);
        onSaved(saved);
      } catch (caught) {
        setError(applyServerErrors(caught, form.setError, FIELDS, { SPECIALTY_REQUIRED: 'subjectId' }));
      }
    })(event);
  };

  const fileRequired = TEACHER_CREDENTIAL_FILE_REQUIRED[kind];
  const today = schoolToday();

  return (
    <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <input type="hidden" {...register('kind')} />
      <fieldset disabled={form.formState.isSubmitting} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="sr-only">{TEACHER_CREDENTIAL_KIND_LABELS[kind]}</legend>

        {group === 'national' &&
          (kind === 'SPECIALTY_NATIONAL' ? (
            <Field
              label="Fan"
              hint="Bu bandda faqat mutaxassislik faningiz."
              error={errors.subjectId?.message}
              className="sm:col-span-2"
            >
              <Input value={specialty?.name ?? 'Mutaxassislik fani belgilanmagan'} readOnly disabled />
            </Field>
          ) : (
            <Field
              label="Fan"
              required
              hint="Mutaxassislik faningizdan boshqa fan."
              error={choiceError(errors.subjectId, 'Fanni tanlang')}
              className="sm:col-span-2"
            >
              <Select
                name={subjectField.field.name}
                ref={subjectField.field.ref}
                value={subjectField.field.value ?? ''}
                onChange={(event) => subjectField.field.onChange(event.target.value || null)}
                onBlur={subjectField.field.onBlur}
                disabled={subjects.isPending}
              >
                <option value="">{subjects.isPending ? 'Yuklanmoqda…' : 'Fanni tanlang'}</option>
                {subjectOptions.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Select>
            </Field>
          ))}

        {group === 'international' && (
          <>
            <Field
              label="Sertifikat turi"
              required
              error={choiceError(errors.certificateType, 'Sertifikat turini tanlang')}
              className="sm:col-span-2"
            >
              <Select {...register('certificateType', { setValueAs: emptyToNull })}>
                <option value="">Turini tanlang</option>
                {INTERNATIONAL_CERTIFICATE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {INTERNATIONAL_CERTIFICATE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Nomi"
              required
              hint={certificateType === 'OTHER' ? 'Ro‘yxatda yo‘q sertifikat nomi.' : 'Turidan taklif qilinadi.'}
              error={errors.title?.message}
              className="sm:col-span-2"
            >
              <Input
                maxLength={200}
                autoComplete="off"
                placeholder={certificateType === 'OTHER' ? 'Masalan: DELE B2 (ispan tili)' : undefined}
                {...register('title')}
              />
            </Field>
          </>
        )}

        {(group === 'course' || group === 'contest') && (
          <Field
            label={group === 'course' ? 'Kurs nomi' : 'Tanlov, ko‘rgazma yoki musobaqa nomi'}
            required
            error={errors.title?.message}
            className="sm:col-span-2"
          >
            <Input
              maxLength={200}
              autoComplete="off"
              placeholder={
                group === 'course'
                  ? 'Masalan: Raqamli pedagogika asoslari'
                  : 'Masalan: “Yilning eng yaxshi fan o‘qituvchisi”'
              }
              {...register('title')}
            />
          </Field>
        )}

        {group === 'national' && (
          <Field label="Daraja" required error={choiceError(errors.level, 'Darajani tanlang (A+ … C)')}>
            <Select {...register('level')}>
              <option value="">Darajani tanlang</option>
              {NATIONAL_CERTIFICATE_GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {(group === 'international' || group === 'contest') && (
          <Field
            label={group === 'contest' ? 'Natija yoki daraja' : 'Daraja yoki natija'}
            hint={group === 'contest' ? 'Masalan: 1-o‘rin, faxriy yorliq, ishtirokchi.' : 'Masalan: C1, Band 7.5.'}
            error={errors.level?.message}
          >
            <Input maxLength={60} autoComplete="off" {...register('level')} />
          </Field>
        )}
        {(group === 'national' || group === 'international') && (
          <Field
            label="Ball"
            hint="Ixtiyoriy, sertifikatda ko‘rsatilgan bo‘lsa."
            error={choiceError(errors.score, 'Ballni 0 dan 10 000 gacha son bilan kiriting (masalan, 7,5).')}
          >
            <Input
              inputMode="decimal"
              autoComplete="off"
              placeholder={group === 'international' ? 'Masalan: 7,5' : 'Masalan: 86,5'}
              {...register('score', { setValueAs: toNumberOrNull })}
            />
          </Field>
        )}
        {group !== 'national' && (
          <Field
            label="Tashkilot"
            hint={group === 'international' ? 'Imtihon yoki sertifikat bergan tashkilot.' : 'Ixtiyoriy.'}
            error={errors.provider?.message}
          >
            <Input
              maxLength={200}
              autoComplete="off"
              placeholder={group === 'international' ? 'Masalan: British Council' : undefined}
              {...register('provider')}
            />
          </Field>
        )}
        {(group === 'national' || group === 'international') && (
          <Field label="Sertifikat raqami" hint="Ixtiyoriy." error={errors.certificateNumber?.message}>
            <Input maxLength={100} autoComplete="off" {...register('certificateNumber')} />
          </Field>
        )}
        <Field
          label={group === 'course' || group === 'contest' ? 'Sana' : 'Berilgan sana'}
          error={errors.issuedOn?.message}
        >
          <Input type="date" max={today} {...register('issuedOn', { setValueAs: emptyToNull })} />
        </Field>
        {(group === 'national' || group === 'international') && (
          <Field label="Amal qilish muddati" hint="Ixtiyoriy." error={errors.validUntil?.message}>
            <Input type="date" {...register('validUntil', { setValueAs: emptyToNull })} />
          </Field>
        )}

        <div className="sm:col-span-2">
          <DocumentUpload
            label={
              group === 'course'
                ? 'Sertifikat yoki guvohnoma'
                : group === 'contest'
                  ? 'Diplom yoki sertifikat'
                  : 'Sertifikat nusxasi'
            }
            required={fileRequired}
            hint={fileRequired ? 'Majburiy: sertifikatning skaneri yoki PDF nusxasi.' : 'Ixtiyoriy.'}
            file={file}
            onChange={(next) => {
              setFile(next);
              form.setValue('fileId', next?.id ?? null, { shouldDirty: true });
              form.clearErrors('fileId');
            }}
            onUploadingChange={setUploading}
            error={errors.fileId?.message}
            disabled={form.formState.isSubmitting}
          />
        </div>
      </fieldset>
    </form>
  );
}

/** Hujjat qo‘shish yoki tahrirlash oynasi (har ochilishda forma yangidan boshlanadi). */
export function CredentialDialog({
  open,
  kind,
  credential,
  specialty,
  onClose,
}: {
  open: boolean;
  kind: TeacherCredentialKind;
  credential: TeacherCredentialView | null;
  specialty: Ref | null;
  onClose: () => void;
}) {
  const formId = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const onSaved = (result: TeacherCredentialView) => {
    // Ro‘yxat darhol yangilanadi, keyin server bilan solishtiriladi.
    queryClient.setQueryData<TeacherReferenceView>(referenceKeys.own, (old) =>
      old
        ? {
            ...old,
            credentials: credential
              ? old.credentials.map((entry) => (entry.id === result.id ? result : entry))
              : [...old.credentials, result],
          }
        : old,
    );
    void queryClient.invalidateQueries({ queryKey: referenceKeys.own });
    toast.success(credential ? 'Hujjat saqlandi.' : 'Hujjat qo‘shildi.');
    setPending(false);
    onClose();
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={`${CREDENTIAL_SECTION_NUMBERS[kind]}-band: ${credential ? 'hujjatni tahrirlash' : 'yangi hujjat'}`}
      description={TEACHER_CREDENTIAL_KIND_LABELS[kind]}
      formId={formId}
      submitLabel={credential ? 'Saqlash' : 'Qo‘shish'}
      pending={pending}
      submitDisabled={uploading}
      size="lg"
    >
      {open && (
        <CredentialForm
          key={credential?.id ?? `new:${kind}`}
          formId={formId}
          kind={kind}
          credential={credential}
          specialty={specialty}
          onPendingChange={setPending}
          onUploadingChange={setUploading}
          onSaved={onSaved}
        />
      )}
    </FormDialog>
  );
}
