'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, GraduationCap, HandHeart, Search, Trash2, UserRoundSearch } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { MENTORSHIP_KIND_LABELS, formatDate, type MentorshipKind } from '@ijod/shared';
import { useDebouncedValue } from '@/components/admin/queries';
import { Avatar } from '@/components/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import type {
  MentorshipCandidate,
  MentorshipCandidatesView,
  MentorshipItemView,
  MentorshipStudentRef,
  Ref,
  TeacherReferenceView,
} from '@/lib/types';
import { useMentorshipCandidates, useMentorshipStudents } from './queries';
import { Band, SectionHeading } from './sheet';
import { MENTORSHIP_SECTION_NUMBERS, referenceKeys } from './utils';

const listKey = (kind: MentorshipKind): 'national' | 'international' =>
  kind === 'NATIONAL' ? 'national' : 'international';

/** Qoida bir qatorda: faqat tasdiqlangan va mutaxassislikka mos sertifikatlar. */
function ruleText(specialty: Ref | null) {
  return `O‘quvchi portfoliosida tasdiqlangan va mutaxassislik faningiz${
    specialty ? ` (${specialty.name})` : ''
  } bo‘yicha sertifikatlargina qayd etiladi — tekshiruvsiz, bir tugma bilan.`;
}

function StudentLine({ student }: { student: MentorshipStudentRef }) {
  return (
    <span className="min-w-0">
      <span className="font-medium break-words text-slate-900">{student.fullName}</span>
      {student.className && <span className="text-slate-500"> · {student.className}</span>}
    </span>
  );
}

function MentorshipRow({
  item,
  readOnly,
  onRemove,
}: {
  item: MentorshipItemView;
  readOnly: boolean;
  onRemove: () => void;
}) {
  const { student, certificate } = item;
  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      <Avatar name={student.fullName} src={student.avatarUrl} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm">
          {readOnly ? (
            <Link href={`/portfolio/students/${student.id}`} className="hover:underline">
              <StudentLine student={student} />
            </Link>
          ) : (
            <StudentLine student={student} />
          )}
        </p>
        <p className="text-sm break-words text-slate-700">
          <span className="text-slate-500">{certificate.typeLabel}:</span>{' '}
          {readOnly ? (
            <Link href={`/portfolio/${certificate.id}`} className="font-medium text-brand-700 hover:underline">
              {certificate.summary ?? certificate.title}
            </Link>
          ) : (
            <span className="font-medium text-slate-900">{certificate.summary ?? certificate.title}</span>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {certificate.date && <span>Sertifikat sanasi: {formatDate(certificate.date)}</span>}
          <span>Qayd etilgan: {formatDate(item.createdAt)}</span>
          {!certificate.approved && <Badge tone="amber">Sertifikat qayta tasdiqlanmoqda</Badge>}
        </p>
      </div>
      {!readOnly && (
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 text-red-700 hover:bg-red-50 hover:text-red-800"
          onClick={onRemove}
          icon={<Trash2 className="size-4" aria-hidden />}
          aria-label={`${student.fullName} — ustozlik yozuvini o‘chirish`}
        >
          <span className="hidden sm:inline">O‘chirish</span>
        </Button>
      )}
    </li>
  );
}

/**
 * Ma’lumotnomaning 10–11-bandlari: qayd etilgan ustozliklar (o‘quvchi, sinf, sertifikat) va o‘qituvchining
 * o‘zi uchun “O‘quvchini tanlash” tugmasi. Rahbariyat ko‘rinishida — faqat ro‘yxat.
 */
export function MentorshipSection({
  kind,
  items,
  specialty,
  readOnly = false,
  onPick,
}: {
  kind: MentorshipKind;
  items: MentorshipItemView[];
  specialty: Ref | null;
  readOnly?: boolean;
  onPick?: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<MentorshipItemView | null>(null);
  const number = MENTORSHIP_SECTION_NUMBERS[kind];

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`/me/mentorships/${id}`),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<TeacherReferenceView>(referenceKeys.own, (old) =>
        old
          ? {
              ...old,
              mentorships: {
                ...old.mentorships,
                [listKey(kind)]: old.mentorships[listKey(kind)].filter((entry) => entry.id !== id),
              },
            }
          : old,
      );
      toast.success('Ustozlik yozuvi o‘chirildi.');
      setRemoving(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: referenceKeys.all }),
  });

  return (
    <Band number={number}>
      <Card>
        <div className="border-b border-slate-100 px-5 py-4">
          <SectionHeading
            number={number}
            title={MENTORSHIP_KIND_LABELS[kind]}
            description={
              readOnly
                ? 'O‘qituvchi ustozlik qilgan o‘quvchilar sertifikatlari (portfolioda tasdiqlangan).'
                : ruleText(specialty)
            }
            actions={
              readOnly ? undefined : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onPick}
                  disabled={!specialty}
                  icon={<UserRoundSearch className="size-4" aria-hidden />}
                >
                  O‘quvchini tanlash
                </Button>
              )
            }
          />
          {!readOnly && !specialty && (
            <p className="mt-2 text-xs font-medium text-amber-700 sm:pl-10">
              Avval yuqorida mutaxassislik faningizni belgilang va saqlang.
            </p>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            {readOnly ? 'Ma’lumot kiritilmagan.' : 'Hali qayd etilmagan.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <MentorshipRow key={item.id} item={item} readOnly={readOnly} onRemove={() => setRemoving(item)} />
            ))}
          </ul>
        )}
      </Card>
      {!readOnly && (
        <ConfirmDialog
          open={removing !== null}
          onClose={() => setRemoving(null)}
          onConfirm={() => removing && remove.mutate(removing.id)}
          title="Ustozlik yozuvini o‘chirish"
          confirmLabel="O‘chirish"
          tone="danger"
          loading={remove.isPending}
        >
          {removing?.student.fullName} ning “{removing?.certificate.title}” sertifikati bo‘yicha ustozligingiz
          ma’lumotnomadan olib tashlanadi.
        </ConfirmDialog>
      )}
    </Band>
  );
}

// ---------------------------------------------------------------- O‘quvchini tanlash

function CandidateRow({
  candidate,
  pending,
  onClaim,
}: {
  candidate: MentorshipCandidate;
  pending: boolean;
  onClaim: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-surface p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium break-words text-slate-900">{candidate.title}</p>
        <p className="text-sm break-words text-slate-600">
          {candidate.typeLabel}
          {candidate.summary ? ` · ${candidate.summary}` : ''}
          {candidate.date ? ` · ${formatDate(candidate.date)}` : ''}
        </p>
      </div>
      {candidate.claimed ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200 sm:self-auto">
          <Check className="size-4" aria-hidden />
          Qayd etilgan
        </span>
      ) : (
        <Button
          size="sm"
          className="shrink-0 self-start sm:self-auto"
          onClick={onClaim}
          loading={pending}
          icon={<HandHeart className="size-4" aria-hidden />}
          aria-label={`“${candidate.title}” — ustozlik qildim`}
        >
          Ustozlik qildim
        </Button>
      )}
    </li>
  );
}

function CandidateGroup({
  kind,
  candidates,
  pendingId,
  onClaim,
}: {
  kind: MentorshipKind;
  candidates: MentorshipCandidate[];
  pendingId: string | null;
  onClaim: (candidate: MentorshipCandidate) => void;
}) {
  const number = MENTORSHIP_SECTION_NUMBERS[kind];
  return (
    <section aria-labelledby={`candidates-${kind}`} className="space-y-2">
      <h3 id={`candidates-${kind}`} className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span className="flex size-6 items-center justify-center rounded-full bg-brand-50 text-xs text-brand-700 tabular ring-1 ring-brand-200">
          {number}
        </span>
        {kind === 'NATIONAL' ? 'Milliy sertifikatlar' : 'Xalqaro sertifikatlar'}
      </h3>
      {candidates.length === 0 ? (
        <p className="text-sm text-slate-500">Mos sertifikat yo‘q.</p>
      ) : (
        <ul className="space-y-2">
          {candidates.map((candidate) => (
            <CandidateRow
              key={candidate.portfolioItemId}
              candidate={candidate}
              pending={pendingId === candidate.portfolioItemId}
              onClaim={() => onClaim(candidate)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function StudentCandidates({
  student,
  focusKind,
  onBack,
}: {
  student: MentorshipStudentRef;
  focusKind: MentorshipKind;
  onBack: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const candidates = useMentorshipCandidates(student.id);
  const claim = useMutation({
    mutationFn: (candidate: MentorshipCandidate) =>
      api.post<MentorshipItemView>('/me/mentorships', { portfolioItemId: candidate.portfolioItemId }),
    onSuccess: (mentorship, candidate) => {
      // Darhol “qayd etilgan” — keyin ro‘yxat server bilan solishtiriladi.
      queryClient.setQueryData<MentorshipCandidatesView>(referenceKeys.candidates(student.id), (old) =>
        old
          ? {
              ...old,
              national: old.national.map((entry) =>
                entry.portfolioItemId === candidate.portfolioItemId ? { ...entry, claimed: true } : entry,
              ),
              international: old.international.map((entry) =>
                entry.portfolioItemId === candidate.portfolioItemId ? { ...entry, claimed: true } : entry,
              ),
            }
          : old,
      );
      queryClient.setQueryData<TeacherReferenceView>(referenceKeys.own, (old) => {
        if (!old) return old;
        const key = listKey(mentorship.kind);
        const rest = old.mentorships[key].filter((entry) => entry.id !== mentorship.id);
        return { ...old, mentorships: { ...old.mentorships, [key]: [mentorship, ...rest] } };
      });
      void queryClient.invalidateQueries({ queryKey: referenceKeys.own });
      toast.success(`Ustozlik qayd etildi: ${student.fullName}. O‘quvchiga xabar yuborildi.`);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      // Sertifikat o‘zgargan yoki yashirilgan bo‘lishi mumkin — ro‘yxat yangilanadi.
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) void candidates.refetch();
    },
  });

  const order: MentorshipKind[] =
    focusKind === 'NATIONAL' ? ['NATIONAL', 'INTERNATIONAL'] : ['INTERNATIONAL', 'NATIONAL'];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <Avatar name={student.fullName} src={student.avatarUrl} size="md" />
        <p className="min-w-0 flex-1 text-sm">
          <StudentLine student={student} />
        </p>
        <Button size="sm" variant="ghost" onClick={onBack} icon={<ArrowLeft className="size-4" aria-hidden />}>
          Boshqa o‘quvchi
        </Button>
      </div>
      {candidates.isPending ? (
        <div className="flex justify-center py-6 text-brand-700">
          <Spinner label="Sertifikatlar yuklanmoqda…" />
        </div>
      ) : candidates.isError ? (
        <ErrorState error={candidates.error} onRetry={() => candidates.refetch()} />
      ) : candidates.data.national.length === 0 && candidates.data.international.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Mos sertifikat topilmadi"
          description={`Bu o‘quvchi portfoliosida ${candidates.data.specialty.name} faniga mos tasdiqlangan sertifikat yo‘q. Sertifikat hali tasdiqlanmagan, boshqa fanga tegishli yoki o‘quvchi uni faqat o‘zi va tekshiruvchiga ko‘rinadigan qilib qo‘ygan bo‘lishi mumkin.`}
        />
      ) : (
        order.map((kind) => (
          <CandidateGroup
            key={kind}
            kind={kind}
            candidates={candidates.data[listKey(kind)]}
            pendingId={claim.isPending ? (claim.variables?.portfolioItemId ?? null) : null}
            onClaim={(candidate) => {
              if (!claim.isPending) claim.mutate(candidate);
            }}
          />
        ))
      )}
    </div>
  );
}

function StudentSearch({
  text,
  onTextChange,
  onPick,
}: {
  text: string;
  onTextChange: (text: string) => void;
  onPick: (student: MentorshipStudentRef) => void;
}) {
  const q = useDebouncedValue(text.trim(), 300);
  const students = useMentorshipStudents(q);
  const inputRef = useRef<HTMLInputElement>(null);
  // Oyna ochilgach (showModal dan keyin) fokus qidiruv maydoniga o‘tadi.
  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const short = q.length < 2;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <Input
          ref={inputRef}
          type="search"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Familiya yoki ism (kamida 2 harf)"
          aria-label="O‘quvchini familiyasi yoki ismi bo‘yicha qidirish"
          autoComplete="off"
          className="pl-9"
        />
      </div>
      <div aria-live="polite">
        {short ? (
          <p className="text-sm text-slate-500">
            Qidirish uchun o‘quvchi familiyasi yoki ismidan kamida 2 ta harf yozing.
          </p>
        ) : students.isPending ? (
          <div className="flex justify-center py-4 text-brand-700">
            <Spinner label="Qidirilmoqda…" />
          </div>
        ) : students.isError ? (
          <ErrorState error={students.error} onRetry={() => students.refetch()} />
        ) : students.data.length === 0 ? (
          <p className="text-sm text-slate-500">Bunday faol o‘quvchi topilmadi.</p>
        ) : (
          <ul
            className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200"
            aria-label="Topilgan o‘quvchilar"
          >
            {students.data.map((student) => (
              <li key={student.id}>
                <button
                  type="button"
                  onClick={() => onPick(student)}
                  className={cn(
                    'flex w-full items-center gap-3 bg-surface px-3 py-2.5 text-left text-sm transition-colors',
                    'hover:bg-brand-50 focus-visible:bg-brand-50',
                  )}
                >
                  <Avatar name={student.fullName} src={student.avatarUrl} size="sm" />
                  <StudentLine student={student} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * “O‘quvchini tanlash”: o‘quvchi qidiriladi (istalgan sinf), so‘ng uning mutaxassislikka mos tasdiqlangan
 * sertifikatlari chiqadi va “Ustozlik qildim” bosilishi bilan darhol qayd etiladi.
 */
export function MentorshipPicker({
  open,
  focusKind,
  specialty,
  onClose,
}: {
  open: boolean;
  focusKind: MentorshipKind;
  specialty: Ref | null;
  onClose: () => void;
}) {
  const [student, setStudent] = useState<MentorshipStudentRef | null>(null);
  const [text, setText] = useState('');
  const close = () => {
    setStudent(null);
    setText('');
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title="O‘quvchini tanlash"
      description="O‘quvchi sertifikatiga ustozlik qilganingizni qayd eting."
      footer={
        <Button variant="outline" onClick={close}>
          Yopish
        </Button>
      }
    >
      <div className="space-y-4">
        <Alert tone="info">{ruleText(specialty)} O‘quvchiga xabar boradi.</Alert>
        {student ? (
          <StudentCandidates student={student} focusKind={focusKind} onBack={() => setStudent(null)} />
        ) : (
          <StudentSearch text={text} onTextChange={setText} onPick={setStudent} />
        )}
      </div>
    </Dialog>
  );
}
