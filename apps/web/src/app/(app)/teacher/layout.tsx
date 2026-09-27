import { RequireRole } from '@/components/app-shell';

export default function TeacherLayout({ children }: LayoutProps<'/teacher'>) {
  return <RequireRole roles={['TEACHER', 'DEPUTY', 'SUPER_ADMIN']}>{children}</RequireRole>;
}
