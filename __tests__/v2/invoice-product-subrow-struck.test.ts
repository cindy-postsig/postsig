/**
 * The invoice discrepancies report spreads a multi-product invoice into
 * product subrows (the "+" accordion). Struck products must carry that state
 * into the subrows so the product view renders the same strikethrough as the
 * contracts table. The regression: subrows were built without the flag, so
 * struck products rendered like live ones.
 *
 * The struck set is derived from the row's own `supersededProducts`, so these
 * cases drive it through the enriched products that build it. Invoices are
 * exempt from cancellation strikes (`isStruckProduct`), which leaves amendment
 * supersession as the only origin an invoice row can carry.
 */
import { buildInvoicesRow } from '@/lib/v2/reports/transforms/invoices';
import type { InvoiceProductSubRow } from '@/lib/v2/reports/transforms/invoices';
import type { EnrichedContract } from '@/lib/v2/contracts/service';
import type { ProductWithPricing } from '@/lib/v2/core/types';
import type { InvoiceDataContext, InvoiceData } from '@/lib/v2/reports/filters';
import type { MatchedInvoiceProduct } from '@/app/lib/definitions';
import { contractTypes } from '@/app/lib/constants';

const CONTRACT_ID = 42;

function product(productId: number, isSuperseded: boolean): ProductWithPricing {
  return {
    product_id: productId,
    name: `Product ${productId}`,
    fees: 1000,
    year: 1,
    sourceContractId: CONTRACT_ID,
    isSuperseded,
    isSuperseding: false,
    currentFee: 1000,
    currency: 'USD',
    currentFeeUSD: 1000,
    effectiveFeeUSD: 1000,
  };
}

function makeInvoice(products: ProductWithPricing[]): EnrichedContract {
  return {
    id: CONTRACT_ID,
    vendor_id: 1,
    vendor_name: 'Acme',
    contract: {
      id: CONTRACT_ID,
      status: 'active',
      status_id: 4,
      type_id: contractTypes.Invoice,
      currency: 'USD',
      term_start_date: [{ date: '2025-01-01' }],
      term_end_date: [{ date: '2025-12-31' }],
    },
    products,
    priceHistory: null,
    isLinkedChildInvoice: false,
  };
}

function matched(productId: number): MatchedInvoiceProduct {
  return {
    id: `report-${CONTRACT_ID}-product-${productId}`,
    product_id: productId,
    product_name: `Product ${productId}`,
    parent_fee: 1000,
    invoice_fee: 1000,
    expectedInvoiceAmount: 1000,
    adjustedParentAmount: 1000,
    adjustedInvoiceAmount: 1000,
    invoiceBillingFrequency: 'Annually',
    parentBillingFrequency: 'Annually',
    difference: 0,
    discrepancy: 0,
    frequencyAligned: true,
    frequencyMultiplier: 1,
    invoiceFreqMultiplier: 1,
    parentProduct: null,
    invoiceProduct: null,
  };
}

function invoiceContext(productIds: number[]): InvoiceDataContext {
  return new Map([
    [CONTRACT_ID, { matchedProducts: productIds.map(matched) } as InvoiceData],
  ]);
}

function unmatchedEntry(productId: number) {
  return {
    id: `report-${CONTRACT_ID}-unmatched-${productId}`,
    product_id: productId,
    product_name: `Product ${productId}`,
    invoice_fee: 500,
  };
}

function subRowsFor(
  products: ProductWithPricing[],
  matchedProductIds: number[],
): InvoiceProductSubRow[] {
  const row = buildInvoicesRow(
    makeInvoice(products),
    invoiceContext(matchedProductIds),
  );
  return (row.subRows ?? []) as unknown as InvoiceProductSubRow[];
}

describe('invoice product subrows — struck product state', () => {
  it('stamps subrows struck when their product is superseded on the row', () => {
    const subRows = subRowsFor(
      [product(10, true), product(20, false)],
      [10, 20],
    );

    const byProduct = new Map(
      subRows.map((sub) => [
        sub.product[0]?.vendor_products?.id,
        sub.isSuperseded,
      ]),
    );
    expect(byProduct.get(10)).toBe(true);
    expect(byProduct.get(20)).toBe(false);
  });

  it('stamps nothing struck when no product is superseded', () => {
    const subRows = subRowsFor(
      [product(10, false), product(20, false)],
      [10, 20],
    );

    expect(subRows.every((sub) => sub.isSuperseded === false)).toBe(true);
  });

  it('strips only the year suffix, so a dashed string product id still strikes', () => {
    const stringId = 'sku-eu-10' as unknown as number;
    const struck = { ...product(stringId, true), product_id: stringId };
    const subRows = subRowsFor([struck, product(2, false)], []);
    const row = buildInvoicesRow(
      makeInvoice([struck, product(2, false)]),
      new Map([
        [
          CONTRACT_ID,
          {
            matchedProducts: [
              { ...matched(2), product_id: stringId },
              matched(2),
            ],
          } as InvoiceData,
        ],
      ]),
    );
    const rows = (row.subRows ?? []) as unknown as InvoiceProductSubRow[];
    expect(rows[0].isSuperseded).toBe(true);
    expect(rows[1].isSuperseded).toBe(false);
    expect(subRows).toHaveLength(0);
  });

  it('stamps struck state on unmatched product subrows too', () => {
    const row = buildInvoicesRow(
      makeInvoice([product(1, false), product(2, true)]),
      new Map([
        [
          CONTRACT_ID,
          {
            matchedProducts: [matched(1)],
            unmatchedProducts: [unmatchedEntry(2)],
          } as InvoiceData,
        ],
      ]),
    );
    const rows = (row.subRows ?? []) as unknown as InvoiceProductSubRow[];
    expect(rows).toHaveLength(2);
    expect(rows[0].isSuperseded).toBe(false);
    expect(rows[1].isSuperseded).toBe(true);
  });

  it('does not confuse product 1 with product 10 (prefix vs id match)', () => {
    const subRows = subRowsFor(
      [product(1, true), product(20, false)],
      [10, 20],
    );

    expect(subRows.filter((sub) => sub.isSuperseded)).toHaveLength(0);
  });
});
