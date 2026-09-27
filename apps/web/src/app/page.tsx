'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageLoader } from '@/components/ui/feedback';
import { afterLoginPath, useMe } from '@/lib/auth';

/** Bosh manzil: foydalanuvchi roliga mos panelga yo‘naltiradi. */
export default function HomeRedirect() {
  const router = useRouter();
  const { data: me } = useMe();
  useEffect(() => {
    if (me) router.replace(afterLoginPath(me));
  }, [me, router]);
  return <PageLoader />;
}
