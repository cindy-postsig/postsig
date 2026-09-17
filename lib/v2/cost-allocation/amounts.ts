import { isInvoiceType } from '@/app/lib/constants';
import type { ContractWithPricing } from '@/lib/v2/core/types';

export type EngineSpendStamp = NonNullable<ContractWithPricing['engineSpend']>;

/** A vendor_products_details row as the engine's native fee read sees it: one product-year's recorded fee. */
export interface RecordedProductFee {
  product_id: number;
  fees?: number | string | null;
}

/** Scope values in the org base currency: the whole contract and each product by vendor_products.id. */
export interface ScopeValues {
  /** null = absent from the engine's value set (archived, filtered out): render "—", never a false zero. */
  contract: number | null;
  products: Record<number, number>;
}

export const EMPTY_SCOPE_VALUES: ScopeValues = { contract: null, products: {} };

/**
 * A contract's current-FY commitment (the contracts/budget tables' row value),
 * with its products priced from the current-window product stamps at the rate
 * of the base/native pair. A record that contributed nothing to the window
 * reads as zero throughout — the engine stamps `?? 0` and the tables print
 * it — so a stamped zero is a value here too (product ruling 2026-08-25);
 * "—" is reserved for a record absent from the set (editor.ts' scopeValueFor).
 *
 * An invoice's amount is a property of the document, not of a fiscal window:
 * its whole recorded amount, with products priced from its own recorded fee
 * rows (what the engine's native read books for it) at the recorded
 * base/native rate. Never the current-window product stamps — those are zero
 * for every invoice outside the window, which is most of the register.
 */
export function scopeValuesFromEngineSpend(
  stamp: EngineSpendStamp | undefined,
  isInvoice: boolean,
  recordedFees?: ReadonlyArray<RecordedProductFee> | null,
): ScopeValues {
  if (!stamp) return EMPTY_SCOPE_VALUES;
  if (isInvoice && stamp.recordedBase !== undefined) {
    return invoiceScopeValues(
      stamp.recordedBase,
      stamp.recordedNative,
      recordedFees,
    );
  }
  return contractScopeValues(stamp);
}

function contractScopeValues(stamp: EngineSpendStamp): ScopeValues {
  const contract = stamp.currentBase;
  const rate = stamp.currentNative > 0 ? contract / stamp.currentNative : 0;
  const products: Record<number, number> = {};
  for (const [productId, value] of Object.entries(stamp.products ?? {})) {
    products[Number(productId)] = value.currentNative * rate;
  }
  return { contract, products };
}

function invoiceScopeValues(
  recordedBase: number,
  recordedNative: number | undefined,
  recordedFees: ReadonlyArray<RecordedProductFee> | null | undefined,
): ScopeValues {
  const rate =
    recordedNative !== undefined && recordedNative > 0
      ? recordedBase / recordedNative
      : 0;
  const nativeByProduct: Record<number, number> = {};
  for (const row of recordedFees ?? []) {
    nativeByProduct[row.product_id] =
      (nativeByProduct[row.product_id] ?? 0) + (recordedFee(row) ?? 0);
  }
  const products: Record<number, number> = {};
  for (const [productId, native] of Object.entries(nativeByProduct)) {
    products[Number(productId)] = native * rate;
  }
  return { contract: recordedBase, products };
}

/**
 * A fee row is recorded when it carries a number: null is "nothing
 * recorded", zero is a recorded zero — different facts (product ruling
 * 2026-08-25), even though the engine stamps both as 0.
 */
export function hasRecordedFee(
  rows: ReadonlyArray<RecordedProductFee> | null | undefined,
): boolean {
  return (rows ?? []).some((row) => recordedFee(row) !== null);
}

/** The number a fee row records; null when it records nothing or a non-finite value. */
function recordedFee(row: RecordedProductFee): number | null {
  if (row.fees === null || row.fees === undefined) return null;
  const fee = Number(row.fees);
  return Number.isFinite(fee) ? fee : null;
}

/**
 * Values off an enriched record: its engine stamp plus, for an invoice, its
 * recorded fee rows. A record with no recorded fee has no value of its own —
 * the engine's 0 for it is the absence of data, not a price — so it reads as
 * unknown: an inherited allocation is priced from its source and anything
 * else renders "—" (QA 2026-08-25, the no-fee amendment case). A recorded
 * zero stays zero, as the tables print it.
 */
export function scopeValuesOf(
  record: Pick<ContractWithPricing, 'engineSpend' | 'contract'> | undefined,
  isInvoice: boolean,
): ScopeValues {
  const rows = record?.contract?.vendor_products_details;
  if (!record || !hasRecordedFee(rows)) return EMPTY_SCOPE_VALUES;
  return scopeValuesFromEngineSpend(record.engineSpend, isInvoice, rows);
}

export interface ContractScopeValues {
  values: ScopeValues;
  /** True when the record has no value of its own and `values` are its allocation source's. */
  valuesFromSource: boolean;
}

/**
 * A record whose allocation is inherited but which has no value of its own
 * (absent from the engine set) prices the inherited scopes from the source
 * contract; "—" only when neither record has a value.
 */
export function inheritScopeValues(
  own: ScopeValues,
  source: ScopeValues | undefined,
): ContractScopeValues {
  if (own.contract !== null || !source || source.contract === null) {
    return { values: own, valuesFromSource: false };
  }
  return { values: source, valuesFromSource: true };
}

/**
 * The same enrichment-and-engine pipeline the contracts and budget tables run,
 * restricted to the contract's relationship family (`familyOf`) — a stamp
 * depends only on its family, so the tab still agrees with the tables by
 * construction without paying for the whole org. The family carries the
 * allocation source too, so an inheriting record can be priced from it. Lazy
 * import keeps fixture tests off the contracts data layer.
 */
export async function getContractScopeValues(
  contractId: number,
  isInvoice: boolean,
  sourceContractId: number | null,
): Promise<ContractScopeValues> {
  const { getContractsList } = await import('@/lib/v2/contracts/service');
  const { contracts } = await getContractsList({
    status: 'all',
    productValues: true,
    familyOf: contractId,
  });
  const own = scopeValuesOf(
    contracts.find((ec) => ec.id === contractId),
    isInvoice,
  );
  const source =
    sourceContractId === null
      ? undefined
      : contracts.find((ec) => ec.id === sourceContractId);
  return inheritScopeValues(
    own,
    source && scopeValuesOf(source, isInvoiceType(source.contract?.type_id)),
  );
}
