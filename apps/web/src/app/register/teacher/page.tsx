import type { Metadata } from 'next';
import { TeacherRegistration } from '@/components/registration/teacher-registration';

export const metadata: Metadata = { title: 'O‘qituvchi sifatida ro‘yxatdan o‘tish' };

export default function TeacherRegisterPage() {
  return <TeacherRegistration />;
}
