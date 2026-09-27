import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Klasslarni birlashtiradi; ziddiyatli Tailwind klasslarida oxirgisi qoladi (`h-10` + `h-12` → `h-12`). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
