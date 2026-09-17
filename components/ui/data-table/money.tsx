'use client';

import React from 'react';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';

interface BaseCurrencyCellProps {
  amount: number | null | undefined;
  showCents?: boolean;
  className?: string;
}

/**
 * Render a monetary value in the org's base display currency.
 *
 * Use this only for amounts the pipeline already converted: rollups across
 * contracts (vendor group rows, report totals) and converted counterparts shown
 * instead of a native amount. Per-contract and per-product amounts keep their
 * own currency and should be formatted with `formatCurrency(amount, currency)`.
 */
export function BaseCurrencyCell({
  amount,
  showCents,
  className,
}: BaseCurrencyCellProps) {
  const { formatBaseCurrency } = useBaseCurrency();
  return (
    <span className={className}>
      {formatBaseCurrency(amount ?? 0, showCents)}
    </span>
  );
}
