import { cn } from '@/lib/cn';

/** Maktab nomi (logotip yonida). */
export const SCHOOL_NAME = 'Hamid Olimjon va Zulfiya ijod maktabi';
/** Ikki qatorli ko‘rinish uchun: “Hamid Olimjon va Zulfiya” / “ijod maktabi”. */
export const SCHOOL_NAME_LINES = ['Hamid Olimjon va Zulfiya', 'ijod maktabi'] as const;
export const SCHOOL_TAGLINE = 'Ijodkor avlod — kelajak poydevori';

/** Tayyor o‘lchamlar (public/brand): kichik belgilar uchun yengil fayllar. */
const FILES = [96, 192, 256, 512] as const;
const fileFor = (pixels: number) => `/brand/logo-${FILES.find((file) => file >= pixels) ?? 512}.png`;

/**
 * Maktab rasmiy logotipi (shaffof fonli PNG). Fayl o‘lchamga qarab tanlanadi (1x/2x).
 * `plate` — to‘q fonda logotipning ko‘k chegarasi yo‘qolmasligi uchun oq taglik:
 * `true` — doimo (siyoh panellar), `'dark'` — faqat qorong‘u rejimda.
 */
export function BrandLogo({
  size = 40,
  plate = false,
  alt = `${SCHOOL_NAME} logotipi`,
  className,
}: {
  size?: number;
  plate?: boolean | 'dark';
  alt?: string;
  className?: string;
}) {
  // Taglik ichki chegarasi piksel bilan (foizli padding ota element eniga bog‘lanib qoladi).
  const pad = Math.round(size * 0.1);
  const inner = plate === true ? size - pad * 2 : size;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center select-none',
        plate === true && 'rounded-[26%] bg-white shadow-lg ring-1 shadow-black/25 ring-white/40',
        plate === 'dark' && 'dark:rounded-[26%] dark:bg-white dark:p-(--logo-pad) dark:ring-1 dark:ring-white/30',
        className,
      )}
      style={{
        width: size,
        height: size,
        padding: plate === true ? pad : undefined,
        ['--logo-pad' as string]: `${pad}px`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- kichik statik belgi, optimallashtirish shart emas */}
      <img
        src={fileFor(inner)}
        srcSet={`${fileFor(inner)} 1x, ${fileFor(inner * 2)} 2x`}
        alt={alt}
        width={inner}
        height={inner}
        className="size-full object-contain"
        draggable={false}
        decoding="async"
      />
    </span>
  );
}
