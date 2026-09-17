import { formatCurrencyFull } from '@/app/lib/utils';
import type { Json } from '@/database.types';
import {
  getEditableField,
  getOptionLabel,
} from '@/lib/v2/inv/overrides/registry';

/**
 * Full-dollar formatter for liquidation-preference values: the exact amount
 * with thousands separators (cents shown only when present), never abbreviated.
 * Mirrors formatCompactUSD's zero handling — a value of 0 renders as "-".
 */
export function formatFullUSD(value: number): string {
  if (value === 0) return '-';
  return formatCurrencyFull(value);
}

export function formatCompactUSD(value: number): string {
  if (value === 0) return '-';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 999_950_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 999_950) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  }
  return `${sign}$${abs.toFixed(1)}`;
}

export function formatDividendSeniority(value: number | string | null): string {
  switch (`${value ?? ''}`) {
    case '1':
      return 'Senior';
    case '2':
      return 'Pari Passu';
    case '3':
      return 'Junior';
    default:
      return '-';
  }
}

export function formatNumber(value: number | undefined): string {
  if (value === undefined || value === 0) return '--';
  return value.toLocaleString();
}

export function formatPercent(value: number | undefined): string {
  if (value === undefined || value === 0) return '--';
  return `${value.toFixed(1)}%`;
}

/* --- Override tooltip formatters ------------------------------------------
 * An override tooltip shows the RAW STORED original and new values, so it needs
 * to render them the way the row displays them. These three are shared by the
 * Legal Terms tab and the Overview tab's Economic Rights section, which show the
 * same underlying fields and must read identically.
 */

/** Render a stored boolean override the way a BooleanDot row displays it. */
export const formatBool = (value: Json): string => (value ? 'Yes' : 'No');

/** Render a stored numeric override as a thousands-separated count. */
export const formatCount = (value: Json): string =>
  typeof value === 'number' ? value.toLocaleString() : String(value);

/** Anti-dilution is stored as a code; show the label the row shows. */
export function formatAntiDilution(value: Json): string {
  const fieldDef = getEditableField('inv_security_terms', 'anti_dilution_type');
  return fieldDef && (typeof value === 'string' || typeof value === 'number')
    ? getOptionLabel(fieldDef, value)
    : String(value);
}

export function getParticipationLabel(type: string | null): string {
  switch (type) {
    case 'none':
      return 'Non-Participating';
    case 'full':
      return 'Participating';
    case 'capped':
      return 'Participating (Capped)';
    default:
      return '-';
  }
}
