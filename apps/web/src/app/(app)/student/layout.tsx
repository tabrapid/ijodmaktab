import { RequireRole } from '@/components/app-shell';

export default function StudentLayout({ children }: LayoutProps<'/student'>) {
  return <RequireRole roles={['STUDENT']}>{children}</RequireRole>;
}
