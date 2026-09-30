'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  TEACHER_CREDENTIAL_FILE_REQUIRED,
  TEACHER_CREDENTIAL_KIND_LABELS,
  type TeacherCredentialKind,
} from '@ijod/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import type { Ref, TeacherCredentialView, TeacherReferenceView } from '@/lib/types';
import { CredentialDialog } from './credential-form';
import { Band, FileLink, SectionHeading } from './sheet';
import { CREDENTIAL_SECTION_NUMBERS, credentialExpired, credentialFacts, referenceKeys } from './utils';

function CredentialRow({
  credential,
  readOnly,
  onEdit,
  onDelete,
}: {
  credential: TeacherCredentialView;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const facts = credentialFacts(credential);
  const missingFile = TEACHER_CREDENTIAL_FILE_REQUIRED[credential.kind] && !credential.file;
  return (
    <li className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex flex-wrap items-center gap-2 font-medium break-words text-slate-900">
          {credential.title}
          {credentialExpired(credential) && <Badge tone="amber">Muddati o‘tgan</Badge>}
          {missingFile && <Badge tone="red">Hujjat yuklanmagan</Badge>}
        </p>
        {facts.length > 0 && (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {facts.map((fact) => (
              <div key={fact.label} className="flex min-w-0 gap-1">
                <dt className="shrink-0 text-slate-500">{fact.label}:</dt>
                <dd className="min-w-0 font-medium break-words text-slate-800">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {credential.file && <FileLink file={credential.file} />}
      </div>
      {!readOnly && (
        <div className="flex shrink-0 flex-wrap gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onEdit}
            icon={<Pencil className="size-4" aria-hidden />}
            aria-label={`“${credential.title}” — tahrirlash`}
          >
            Tahrirlash
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-700 hover:bg-red-50 hover:text-red-800"
            onClick={onDelete}
            icon={<Trash2 className="size-4" aria-hidden />}
            aria-label={`“${credential.title}” — o‘chirish`}
          >
            O‘chirish
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * Ma’lumotnomaning 4–9-bandlaridan biri: yozuvlar ro‘yxati va (o‘qituvchining o‘zi uchun) qo‘shish,
 * tahrirlash va o‘chirish. Rahbariyat ko‘rinishida — faqat ro‘yxat.
 */
export function CredentialSection({
  kind,
  credentials,
  specialty,
  readOnly = false,
}: {
  kind: TeacherCredentialKind;
  credentials: TeacherCredentialView[];
  specialty: Ref | null;
  readOnly?: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TeacherCredentialView | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TeacherCredentialView | null>(null);
  const number = CREDENTIAL_SECTION_NUMBERS[kind];
  const fileRequired = TEACHER_CREDENTIAL_FILE_REQUIRED[kind];
  // 4-band mutaxassislik faniga bog‘liq: fan belgilanmaguncha yangi yozuv qo‘shilmaydi.
  const needsSpecialty = kind === 'SPECIALTY_NATIONAL' && !specialty;

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`/me/teacher-credentials/${id}`),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<TeacherReferenceView>(referenceKeys.own, (old) =>
        old ? { ...old, credentials: old.credentials.filter((entry) => entry.id !== id) } : old,
      );
      toast.success('Hujjat o‘chirildi.');
      setDeleting(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: referenceKeys.own }),
  });

  return (
    <Band number={number}>
      <Card>
        <div className="border-b border-slate-100 px-5 py-4">
          <SectionHeading
            number={number}
            title={TEACHER_CREDENTIAL_KIND_LABELS[kind]}
            description={fileRequired ? 'Tasdiqlovchi hujjat (sertifikat nusxasi) majburiy.' : 'Hujjat ixtiyoriy.'}
            actions={
              readOnly ? undefined : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing('new')}
                  disabled={needsSpecialty}
                  icon={<Plus className="size-4" aria-hidden />}
                  aria-label={`${number}-bandga qo‘shish`}
                >
                  Qo‘shish
                </Button>
              )
            }
          />
          {!readOnly && needsSpecialty && (
            <p className="mt-2 text-xs font-medium text-amber-700 sm:pl-10">
              Avval yuqorida mutaxassislik faningizni belgilang va saqlang.
            </p>
          )}
        </div>
        {credentials.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            {readOnly ? 'Ma’lumot kiritilmagan.' : 'Hali qo‘shilmagan.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {credentials.map((credential) => (
              <CredentialRow
                key={credential.id}
                credential={credential}
                readOnly={readOnly}
                onEdit={() => setEditing(credential)}
                onDelete={() => setDeleting(credential)}
              />
            ))}
          </ul>
        )}
      </Card>
      {!readOnly && (
        <>
          <CredentialDialog
            open={editing !== null}
            kind={editing && editing !== 'new' ? editing.kind : kind}
            credential={editing === 'new' ? null : editing}
            specialty={specialty}
            onClose={() => setEditing(null)}
          />
          <ConfirmDialog
            open={deleting !== null}
            onClose={() => setDeleting(null)}
            onConfirm={() => deleting && remove.mutate(deleting.id)}
            title="Hujjatni o‘chirish"
            confirmLabel="O‘chirish"
            tone="danger"
            loading={remove.isPending}
          >
            “{deleting?.title}” ma’lumotnomadan o‘chiriladi. Yuklangan fayl ham keyinroq ombordan o‘chiriladi.
          </ConfirmDialog>
        </>
      )}
    </Band>
  );
}
