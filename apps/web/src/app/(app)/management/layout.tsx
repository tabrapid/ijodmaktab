import { RequireRole } from '@/components/app-shell';

export default function ManagementLayout({ children }: LayoutProps<'/management'>) {
  return <RequireRole roles={['DEPUTY', 'SUPER_ADMIN']}>{children}</RequireRole>;
}
