import type { ContractCredit, RawContractCreditRow } from './types';

/**
 * The credits embed on the contract detail select. Rides the same fetch as the
 * rest of the row, so the section costs no extra request.
 */
export const CONTRACT_PRODUCT_CREDITS_EMBED = `contract_product_credits (
            id, product_id, year, amount, sort_order,
            vendor_products ( id, name, product_code )
          )`;

/**
 * Maps the embed to credits, ordered the way the extractor approved them:
 * `sort_order` first, then row id for rows written before sort_order existed.
 * A row whose product join is missing is skipped rather than shown blank, and a
 * non-numeric amount is dropped rather than rendered as NaN.
 */
export function creditsFromEmbed(
  rows: readonly RawContractCreditRow[] | null | undefined,
): ContractCredit[] {
  if (!rows || rows.length === 0) return [];

  return [...rows]
    .sort(
      (a, b) =>
        (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
          (b.sort_order ?? Number.MAX_SAFE_INTEGER) || a.id - b.id,
    )
    .flatMap((row) => {
      const name = row.vendor_products?.name?.trim();
      const amount = Number(row.amount);
      if (!name || !Number.isFinite(amount)) return [];
      return [
        {
          id: row.id,
          productId: row.product_id,
          year: row.year,
          amount,
          name,
          productCode: row.vendor_products?.product_code ?? null,
        },
      ];
    });
}

/** Credits grouped by relative year, keyed as strings to match productsByYear. */
export function creditsByYear(
  credits: readonly ContractCredit[],
): Record<string, ContractCredit[]> {
  return credits.reduce<Record<string, ContractCredit[]>>((acc, credit) => {
    const key = String(credit.year);
    (acc[key] ??= []).push(credit);
    return acc;
  }, {});
}

/** The total credited, as a positive magnitude -- the sign is not shown. */
export function creditsTotal(credits: readonly ContractCredit[]): number {
  return credits.reduce((sum, credit) => sum + credit.amount, 0);
}

export function contractCredits(contract: {
  contract_product_credits?: readonly RawContractCreditRow[] | null;
}): ContractCredit[] {
  return creditsFromEmbed(contract.contract_product_credits);
}
