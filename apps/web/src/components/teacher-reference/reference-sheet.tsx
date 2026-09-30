'use client';

import { useState } from 'react';
import {
  MENTORSHIP_KINDS,
  MENTORSHIP_KIND_LABELS,
  TEACHER_CREDENTIAL_KINDS,
  TEACHER_CREDENTIAL_KIND_LABELS,
  type MentorshipKind,
} from '@ijod/shared';
import type { TeacherReferenceView } from '@/lib/types';
import { CredentialSection } from './credential-section';
import { MentorshipPicker, MentorshipSection } from './mentorship';
import { ProfileForm, ProfileSummary } from './profile-section';
import { SectionNav } from './sheet';
import { CREDENTIAL_SECTION_NUMBERS, MENTORSHIP_SECTION_NUMBERS } from './utils';

const NAV_ITEMS = [
  { number: 1, label: 'Ta’lim olgan OTM' },
  { number: 2, label: 'Ilmiy darajasi' },
  { number: 3, label: 'Malaka toifasi' },
  ...TEACHER_CREDENTIAL_KINDS.map((kind) => ({
    number: CREDENTIAL_SECTION_NUMBERS[kind],
    label: TEACHER_CREDENTIAL_KIND_LABELS[kind],
  })),
  ...MENTORSHIP_KINDS.map((kind) => ({
    number: MENTORSHIP_SECTION_NUMBERS[kind],
    label: MENTORSHIP_KIND_LABELS[kind],
  })),
];

/**
 * Qog‘ozdagi ma’lumotnoma tartibidagi 1–11-bandlar. O‘qituvchining o‘zi — tahrirlaydi; rahbariyat
 * (`readOnly`) — xuddi shu ko‘rinishni faqat o‘qiydi.
 */
export function ReferenceSheet({ data, readOnly = false }: { data: TeacherReferenceView; readOnly?: boolean }) {
  const [picker, setPicker] = useState<MentorshipKind | null>(null);
  return (
    <div className="space-y-6">
      <SectionNav items={NAV_ITEMS} />
      {readOnly ? <ProfileSummary data={data} /> : <ProfileForm data={data} />}
      {TEACHER_CREDENTIAL_KINDS.map((kind) => (
        <CredentialSection
          key={kind}
          kind={kind}
          credentials={data.credentials.filter((credential) => credential.kind === kind)}
          specialty={data.specialtySubject}
          readOnly={readOnly}
        />
      ))}
      {MENTORSHIP_KINDS.map((kind) => (
        <MentorshipSection
          key={kind}
          kind={kind}
          items={kind === 'NATIONAL' ? data.mentorships.national : data.mentorships.international}
          specialty={data.specialtySubject}
          readOnly={readOnly}
          onPick={() => setPicker(kind)}
        />
      ))}
      {!readOnly && (
        <MentorshipPicker
          open={picker !== null}
          focusKind={picker ?? 'NATIONAL'}
          specialty={data.specialtySubject}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
