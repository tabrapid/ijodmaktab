/**
 * Sonlarni ko‘rsatish qoidalari: ichki hisoblash yaxlitlanmagan qiymatlar bilan,
 * ko‘rsatish bir kasr xonasi bilan (reja, 9-bo‘lim). O‘zbekcha yozuvda kasr vergul bilan.
 */
import type { Ratio } from './metrics.js';

export const NOT_AVAILABLE = '—';

/** 66.6667 → “66,7%”; `null` → “—”. */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  return `${value.toFixed(digits).replace('.', ',')}%`;
}

/** Ball: 2 → “2”, 1.5 → “1,5”, 1.25 → “1,25”. */
export function formatPoints(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace('.', ',');
}

/** “20 / 25” */
export function formatRatioCounts(value: Ratio): string {
  return `${formatPoints(value.numerator)} / ${formatPoints(value.denominator)}`;
}

/** “80,0% (20 / 25)” yoki maxraj 0 bo‘lsa “— (0 / 0)”. */
export function formatRatio(value: Ratio): string {
  return `${formatPercent(value.percent)} (${formatRatioCounts(value)})`;
}
