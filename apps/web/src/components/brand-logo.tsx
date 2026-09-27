import { cn } from '@/lib/cn';

/** Maktab rasmiy logotipi (shaffof fonli PNG, /public/brand). */
export function BrandLogo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- kichik statik belgi, optimallashtirish shart emas
    <img
      src={size > 128 ? '/brand/logo-512.png' : '/brand/logo-256.png'}
      alt="Hamid Olimjon va Zulfiya nomidagi ijod maktabi"
      width={size}
      height={size}
      className={cn('shrink-0 select-none', className)}
      draggable={false}
    />
  );
}

/** Maktab nomi (logotip yonida). */
export const SCHOOL_NAME = 'Hamid Olimjon va Zulfiya ijod maktabi';
