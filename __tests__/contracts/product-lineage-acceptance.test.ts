import { describe, expect, it } from '@jest/globals';
import {
  resolveRemovedProductIds,
  toChainContracts,
  type HierarchyProductsEntry,
  type ProductLineageEventInput,
} from '@/lib/contracts/productLineageResolution';

/**
 * PSK-1830 Task 3.1 — acceptance pin for the cancel-and-replace chain.
 *
 * `hierarchy-lineage-events-wiring.test.ts` already pins the projection seam
 * against the id shapes and unusable rows; `product-lineage-resolution.test.ts`
 * pins the ordering and precedence rules. What neither covers is a full chain
 * with the awkward shapes stacked together, which is what this suite adds:
 * two contracts sharing a term start date, a contract dated after the
 * declaration, an addendum whose schedule spans multiple yearly buckets, and
 * the same product id repeated within one contract via both id fallbacks.
 *
 * The chain is modelled on the Berenberg MSA + addenda case
 * (`vendor_products_details` joined to `contracts.term_start_date`):
 *
 *   10  Service Order  2019-01-01  product 9
 *   11  Service Order  2019-01-01  product 9
 *   13  Service Order  2021-01-01  product 11
 *   14  Addendum       2023-01-01  products 13,14,15,16,17   <- declares replace_all_prior
 *   16  Service Order  2025-01-01  product 12
 *
 * Contract 14 replacing the whole schedule must strike 10, 11 and 13, leave its
 * own products live, and must NOT reach forward to 16.
 */

const DECLARING_CONTRACT = 14;

const dated = (date: string) => ({ term_start_date: [{ date }] });

const joined = (id: number) => ({ vendor_products: { id } });

/**
 * Built per test rather than shared: the resolver is pure today, but the
 * sibling suite already mutates a returned set in place, and a shared literal
 * would leak that across `it` blocks. Matches `berenbergChain()` / `chain()`.
 */
const chain = (): HierarchyProductsEntry[] => [
  {
    contractId: 10,
    contractData: dated('2019-01-01'),
    // Product 9 twice: once via the joined vendor_products row, once via the
    // detail row's own product_id — both id fallbacks on one contract.
    products: { '1': [joined(9), { product_id: 9 }] },
  },
  {
    contractId: 11,
    contractData: dated('2019-01-01'),
    products: { '1': [joined(9), { product_id: 9 }] },
  },
  {
    contractId: 13,
    contractData: dated('2021-01-01'),
    products: { '1': [joined(11)] },
  },
  {
    contractId: DECLARING_CONTRACT,
    contractData: dated('2023-01-01'),
    products: {
      '1': [joined(13), joined(14), joined(15)],
      '2': [joined(16), joined(17)],
    },
  },
  {
    contractId: 16,
    contractData: dated('2025-01-01'),
    products: { '1': [joined(12)] },
  },
];

const confirmedBlanket: ProductLineageEventInput = {
  contract_id: DECLARING_CONTRACT,
  product_id: null,
  action: 'replace_all_prior',
  status: 'confirmed',
};

const cancelProductNine: ProductLineageEventInput = {
  contract_id: DECLARING_CONTRACT,
  product_id: 9,
  action: 'cancel_product',
  status: 'confirmed',
};

const resolve = (events: ProductLineageEventInput[]) =>
  resolveRemovedProductIds(events, toChainContracts(chain()));

describe('PSK-1830 acceptance: confirmed replace_all_prior over a real chain', () => {
  it('projects the hierarchy rows onto the resolver input', () => {
    // Asserted whole rather than spot-checked, so this agrees with the wiring
    // suite instead of passing while the projection drifts: both id fallbacks
    // resolve to product 9, and the addendum's yearly buckets flatten in order.
    expect(toChainContracts(chain())).toEqual([
      {
        contractId: 10,
        termStartDate: [{ date: '2019-01-01' }],
        productIds: [9, 9],
      },
      {
        contractId: 11,
        termStartDate: [{ date: '2019-01-01' }],
        productIds: [9, 9],
      },
      {
        contractId: 13,
        termStartDate: [{ date: '2021-01-01' }],
        productIds: [11],
      },
      {
        contractId: DECLARING_CONTRACT,
        termStartDate: [{ date: '2023-01-01' }],
        productIds: [13, 14, 15, 16, 17],
      },
      {
        contractId: 16,
        termStartDate: [{ date: '2025-01-01' }],
        productIds: [12],
      },
    ]);
  });

  it('strikes every earlier chain contract, including the dated sibling', () => {
    const removed = resolve([confirmedBlanket]);

    expect(removed.get(10)).toEqual(new Set([9]));
    expect(removed.get(11)).toEqual(new Set([9]));
    expect(removed.get(13)).toEqual(new Set([11]));
  });

  it('leaves the declaring contract and later contracts untouched', () => {
    const removed = resolve([confirmedBlanket]);

    // Add 3 keeps its own schedule — it is the surviving one.
    expect(removed.has(DECLARING_CONTRACT)).toBe(false);
    // 2025 order post-dates the declaration; a replacement never reaches forward.
    expect(removed.has(16)).toBe(false);
  });

  it('spares a contract sharing the declaring contract’s date', () => {
    // Precedence is strict: a date alone cannot order two same-dated contracts,
    // so the conservative answer is to leave the co-dated one live rather than
    // strike a product the addendum may not have replaced.
    const coDated: HierarchyProductsEntry = {
      contractId: 99,
      contractData: dated('2023-01-01'),
      products: { '1': [joined(12)] },
    };

    const removed = resolveRemovedProductIds(
      [confirmedBlanket],
      toChainContracts([...chain(), coDated]),
    );

    expect(removed.has(99)).toBe(false);
    // The genuinely earlier contracts are still struck.
    expect(removed.get(13)).toEqual(new Set([11]));
  });

  it('is inert until ops confirms the event', () => {
    expect(resolve([{ ...confirmedBlanket, status: 'pending' }]).size).toBe(0);
    expect(resolve([{ ...confirmedBlanket, status: 'rejected' }]).size).toBe(0);
  });

  it('strikes a single product across the chain for cancel_product', () => {
    const removed = resolve([cancelProductNine]);

    // Product 9 is licensed by both 10 and 11; neither escapes.
    expect(removed.get(10)).toEqual(new Set([9]));
    expect(removed.get(11)).toEqual(new Set([9]));
    // Contract 13 never licensed product 9, so it is not in the map at all.
    expect(removed.has(13)).toBe(false);
  });
});
