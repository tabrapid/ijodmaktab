'use client';

import { Suspense } from 'react';
import { RequireRole } from '@/components/app-shell';
import { GroupedReview } from '@/components/portfolio/grouped-review';
import { PageHeader } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/feedback';
import { hasRole, useMe } from '@/lib/auth';

function ReviewQueue() {
  const { data: me } = useMe();
  const leadership = hasRole(me, 'DEPUTY', 'SUPER_ADMIN');
  const homeroom = (me?.homeroomClassIds.length ?? 0) > 0;

  const note = leadership
    ? 'Rahbariyat barcha tekshiruvga yuborilgan yozuvlarni tasdiqlashi mumkin. O‘z yozuvlaringiz bu navbatda ko‘rinmaydi — o‘zini o‘zi tasdiqlash mumkin emas.'
    : 'Sinf rahbari sifatida faqat o‘z sinfingiz o‘quvchilarining yozuvlarini tasdiqlaysiz.';
  const emptyDescription = leadership
    ? 'Yangi yozuv tekshiruvga yuborilganda shu yerda paydo bo‘ladi va sizga bildirishnoma keladi.'
    : homeroom
      ? 'Sinfingiz o‘quvchilari yozuvni tekshiruvga yuborganda shu yerda o‘quvchi bo‘yicha guruhlanib ko‘rinadi.'
      : 'Portfolio yozuvlarini sinf rahbarlari o‘z sinfi o‘quvchilari uchun tasdiqlaydi. Siz hozircha sinf rahbari emassiz, shuning uchun navbatga yozuv tushmaydi.';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio tasdiqlash"
        description="Yozuvlar o‘quvchilar bo‘yicha guruhlangan: o‘quvchini tanlang — yangi va o‘zgartirilgan yutuqlari ochiladi. Qaytarishda sabab majburiy."
      />
      <GroupedReview note={note} emptyDescription={emptyDescription} />
    </div>
  );
}

export default function PortfolioReviewPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <RequireRole roles={['TEACHER', 'DEPUTY', 'SUPER_ADMIN']}>
        <ReviewQueue />
      </RequireRole>
    </Suspense>
  );
}
