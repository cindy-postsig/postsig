/**
 * Org base display currency. Stored in `org_preferences`
 * (preference_key = 'regional.currency') and managed by the admin app; this
 * repo only reads it.
 */
export const BASE_CURRENCY_PREFERENCE_KEY = 'regional.currency';

export const SUPPORTED_BASE_CURRENCIES = ['USD', 'EUR'] as const;

export type BaseCurrency = (typeof SUPPORTED_BASE_CURRENCIES)[number];

/** Hard fallback used when the org has no base-currency preference. */
export const BASE_CURRENCY_DEFAULT: BaseCurrency = 'USD';

/**
 * Coerce an arbitrary stored value into a supported base currency.
 * Matching is case-insensitive; anything unrecognized falls back to the default.
 */
export function parseBaseCurrency(value: unknown): BaseCurrency {
  if (typeof value !== 'string') return BASE_CURRENCY_DEFAULT;
  const normalized = value.trim().toUpperCase();
  return (
    SUPPORTED_BASE_CURRENCIES.find((c) => c === normalized) ??
    BASE_CURRENCY_DEFAULT
  );
}
