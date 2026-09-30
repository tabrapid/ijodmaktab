import { redirect } from 'next/navigation';

/** Sinflar ro‘yxati alohida sahifa emas — “O‘quvchilar” bo‘limining “Sinflar” yorlig‘i. */
export default function ManagementClassesIndex() {
  redirect('/management/students?tab=classes');
}
