import type { Metadata } from 'next';
import { StudentRegistration } from '@/components/registration/student-registration';

export const metadata: Metadata = { title: 'O‘quvchi sifatida ro‘yxatdan o‘tish' };

export default function StudentRegisterPage() {
  return <StudentRegistration />;
}
