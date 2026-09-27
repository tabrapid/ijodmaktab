'use client';

import { Dialog } from '@/components/ui/dialog';

/**
 * Profil rasmini yuklash / olib tashlash oynasi (hozircha zaglushka — to‘liq amalga oshirish
 * hisoblar va profil rasmlari vazifasida). Props shu ko‘rinishda qoladi.
 */
export function AvatarUploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Profil rasmi">
      <p className="text-sm text-slate-500">Tez orada.</p>
    </Dialog>
  );
}
