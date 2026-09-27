import { RequireRole } from '@/components/app-shell';

/** Administrator bo‘limi. Audit jurnali rahbariyatga ham ochiq; qolgan sahifalar alohida tekshiriladi. */
export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return <RequireRole roles={['ADMIN', 'SUPER_ADMIN', 'DEPUTY']}>{children}</RequireRole>;
}
