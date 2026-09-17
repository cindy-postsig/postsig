'use client';

import { useContext } from 'react';
import { UserContext } from '@/app/userProvider';
import { formatCurrency } from '@/app/lib/utils';
import { BASE_CURRENCY_DEFAULT } from '@/lib/base-currency';

/**
 * Client hook exposing the org's base display currency and a bound
 * `formatCurrency` helper. Reads from the UserContext populated on the server.
 */
export function useBaseCurrency() {
  const ctx = useContext(UserContext);
  const baseCurrency = ctx?.userMetadata?.baseCurrency ?? BASE_CURRENCY_DEFAULT;

  const formatBaseCurrency = (value: number, showCents?: boolean) =>
    formatCurrency(value, baseCurrency, showCents);

  return { baseCurrency, formatBaseCurrency };
}
