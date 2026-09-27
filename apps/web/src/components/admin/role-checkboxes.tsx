'use client';

import { ROLE_LABELS, type Role } from '@ijod/shared';
import { Checkbox } from '@/components/ui/form';
import { ROLE_DESCRIPTIONS } from './labels';

/** Rollarni belgilash: har bir rol yonida qisqa izoh. */
export function RoleCheckboxes({
  options,
  value,
  onChange,
  error,
  disabled,
  legend = 'Rollar',
}: {
  options: readonly Role[];
  value: readonly Role[];
  onChange: (roles: Role[]) => void;
  error?: string;
  disabled?: boolean;
  legend?: string;
}) {
  const toggle = (role: Role, checked: boolean) => {
    // Tartib doimiy bo‘lsin: variantlar ro‘yxatidagi tartibda.
    const next = new Set(value);
    if (checked) next.add(role);
    else next.delete(role);
    onChange(options.filter((item) => next.has(item)));
  };
  return (
    <fieldset aria-invalid={error ? true : undefined}>
      <legend className="text-sm font-medium text-slate-700">
        {legend}
        <span className="text-red-600" aria-hidden>
          {' '}
          *
        </span>
      </legend>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {options.map((role) => (
          <Checkbox
            key={role}
            label={ROLE_LABELS[role]}
            description={ROLE_DESCRIPTIONS[role]}
            checked={value.includes(role)}
            disabled={disabled}
            onChange={(event) => toggle(role, event.target.checked)}
            className="rounded-lg border border-slate-200 p-3 has-checked:border-brand-300 has-checked:bg-brand-50/50"
          />
        ))}
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </fieldset>
  );
}
