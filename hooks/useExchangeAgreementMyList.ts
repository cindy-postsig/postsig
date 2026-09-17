'use client';

import { useCallback, useEffect, useState } from 'react';

// "My List" is not user-account data yet — the FE is built against mock
// data, so saved products live in this browser only until the real backend
// (and a real persistence decision) lands.
const STORAGE_KEY = 'exchange-agreements:my-list';

function readStoredIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function useExchangeAgreementMyList() {
  const [productIds, setProductIds] = useState<string[]>([]);

  useEffect(() => {
    setProductIds(readStoredIds());
  }, []);

  const isSaved = useCallback(
    (productId: string) => productIds.includes(productId),
    [productIds],
  );

  const toggle = useCallback((productId: string) => {
    setProductIds((prev) => {
      const next = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { productIds, isSaved, toggle };
}
