import { describe, expect, it } from '@jest/globals';
import {
  buildRemovedProductKeys,
  resolveRemovedProductIds,
  toChainContracts,
} from '@/lib/contracts/productLineageResolution';
import { contractTypes, isInvoiceType } from '@/app/lib/constants';

/**
 * The products table on an invoice's own detail page (`ProductTableRenderer`
 * via `ProductsLicensed`): a product cancelled by a later addendum renders
 * un-struck, because an invoice is never itself cancelled — only the agreement
 * commanding it is.
 *
 * The resolver deliberately stays type-agnostic: it strikes any chain contract
 * preceding the declaration, invoices included (proven below). So an invoice
 * viewed on its own detail page WOULD be struck without the guard in
 * `ProductsLicensed` — the un-struck rendering is a rule, not a side effect of
 * the invoice happening to be absent from the chain data.
 *
 * These tests pin both halves: the resolver still strikes the service order,
 * and the component-level guard is what spares the invoice.
 */

const CANCELLED_PRODUCT = 55;
const SO_ID = 101;
const INVOICE_ID = 103;
const ADDENDUM_ID = 200;
const INVOICE_TYPE = contractTypes.Invoice;
const SERVICE_ORDER_TYPE = contractTypes.SO;

const productRow = (id: number) => ({
  product_id: id,
  vendor_products: { id, name: `Product ${id}` },
});

/** SO and its invoice both carry product 55; a later addendum cancels it. */
const hierarchyProductsData = [
  {
    contractId: SO_ID,
    products: { '1': [productRow(CANCELLED_PRODUCT)] },
    contractData: { term_start_date: [{ date: '2024-01-01' }] },
  },
  {
    contractId: INVOICE_ID,
    products: { '1': [productRow(CANCELLED_PRODUCT)] },
    contractData: { term_start_date: [{ date: '2024-02-01' }] },
  },
  {
    contractId: ADDENDUM_ID,
    products: {},
    contractData: { term_start_date: [{ date: '2025-01-01' }] },
  },
];

const cancellationEvent = {
  contract_id: ADDENDUM_ID,
  product_id: CANCELLED_PRODUCT,
  action: 'cancel_product',
  status: 'confirmed',
};

const resolve = () =>
  resolveRemovedProductIds(
    [cancellationEvent] as never,
    toChainContracts(hierarchyProductsData as never),
  );

/**
 * `ProductsLicensed`'s memo, extracted: the invoice guard plus the key build.
 * Mirrors `components/contracts/ProductsLicensed.tsx:132-141`.
 */
const productsTableKeys = (
  contractId: number,
  typeId: number,
): Set<string> | undefined =>
  isInvoiceType(typeId)
    ? undefined
    : buildRemovedProductKeys(resolve().get(contractId), {
        '1': [productRow(CANCELLED_PRODUCT)],
      });

describe('invoice products table — cancelled products render un-struck', () => {
  it('builds no strike keys for the invoice being viewed', () => {
    expect(productsTableKeys(INVOICE_ID, INVOICE_TYPE)).toBeUndefined();
  });

  it('exempts Exchange Agreement Invoices too', () => {
    expect(productsTableKeys(INVOICE_ID, contractTypes.EAINV)).toBeUndefined();
  });

  it('would strike the invoice without the guard — the resolver is type-agnostic', () => {
    const removed = resolve();

    // Proves the guard is load-bearing: the resolver does put the invoice in
    // the map, so un-struck rendering depends on the guard, not on absence.
    expect(removed.get(INVOICE_ID)).toEqual(new Set([CANCELLED_PRODUCT]));
  });

  it('still strikes the service order the addendum actually cancelled', () => {
    expect(productsTableKeys(SO_ID, SERVICE_ORDER_TYPE)).toEqual(
      new Set([`${CANCELLED_PRODUCT}-1`]),
    );
  });
});
