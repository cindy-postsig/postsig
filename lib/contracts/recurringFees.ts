// One-time fees never recur, so renewal-facing raw-fee sums exclude them
// (psk-1492).
export function sumRecurringProductFees(
  products: Array<{ fees: number | string; one_time_only?: boolean }>,
): number {
  return products.reduce((sum, product) => {
    if (product.one_time_only) return sum;
    const fees = Number(product.fees || 0);
    // A non-numeric fee string would turn the whole total into NaN, which
    // then slips past <= 0 guards downstream.
    return sum + (Number.isFinite(fees) ? fees : 0);
  }, 0);
}
