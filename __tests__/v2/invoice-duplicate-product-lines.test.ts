import { enrichWithLineage } from '@/lib/v2/core/lineage';
import { enrichWithAmendments } from '@/lib/v2/core/amendments';
import { contractTypes } from '@/app/lib/constants';

const line = (fees: number, year = 1) => ({
  product_id: 10,
  fees,
  year,
  vendor_products: { id: 10, name: 'Bloomberg Anywhere' },
});

const contractRow = (typeId: number, details: unknown[]) => ({
  id: 1,
  vendor_id: 1,
  type_id: typeId,
  vendors: { name: 'Bloomberg' },
  vendor_products_details: details,
  term_start_date: [{ date: '2026-01-01' }],
});

describe('enrichWithLineage with repeated product lines', () => {
  it('sums both lines of an invoice into the product fee', () => {
    const [enriched] = enrichWithLineage(
      [contractRow(contractTypes.Invoice, [line(1106), line(595)])],
      [],
    );
    expect(enriched.products).toHaveLength(1);
    expect(enriched.products[0].fees).toBe(1701);
  });

  it('sums Exchange Agreement Invoice lines too', () => {
    const [enriched] = enrichWithLineage(
      [contractRow(contractTypes.EAINV, [line(100), line(25)])],
      [],
    );
    expect(enriched.products[0].fees).toBe(125);
  });

  // A multi-year contract records one row per year for the same product and
  // reads the first year's fee. Summing across years there would inflate it.
  it('leaves a multi-year contract reading its first year only', () => {
    const [enriched] = enrichWithLineage(
      [contractRow(contractTypes.SO, [line(1000, 1), line(1100, 2)])],
      [],
    );
    expect(enriched.products[0].fees).toBe(1000);
    expect(enriched.products[0].year).toBe(1);
  });

  // Same guard on an invoice: only the year details[0] reports is summed.
  it('sums only within the first year of an invoice', () => {
    const [enriched] = enrichWithLineage(
      [
        contractRow(contractTypes.Invoice, [
          line(1106, 1),
          line(595, 1),
          line(9999, 2),
        ]),
      ],
      [],
    );
    expect(enriched.products[0].fees).toBe(1701);
  });
});

/**
 * enrichWithAmendments carries its own copy of the same product grouping, and
 * it is the one the contract-detail and budget surfaces run through. It has to
 * sum a repeated invoice line exactly as enrichWithLineage does, or the two
 * pipelines disagree about what a contract is worth.
 */
describe('enrichWithAmendments with repeated product lines', () => {
  const enrich = (typeId: number, details: unknown[]) =>
    enrichWithAmendments([contractRow(typeId, details) as never], [], 1, {
      skipExchangeRates: true,
    });

  it('sums both lines of an invoice into the product fee', async () => {
    const [enriched] = await enrich(contractTypes.Invoice, [
      line(1106),
      line(595),
    ]);
    expect(enriched.products).toHaveLength(1);
    expect(enriched.products[0].fees).toBe(1701);
  });

  it('sums Exchange Agreement Invoice lines too', async () => {
    const [enriched] = await enrich(contractTypes.EAINV, [line(100), line(25)]);
    expect(enriched.products[0].fees).toBe(125);
  });

  // A multi-year contract records one row per year for the same product and
  // reads the first year's fee. Summing across years there would inflate it.
  it('leaves a multi-year contract reading its first year only', async () => {
    const [enriched] = await enrich(contractTypes.SO, [
      line(1000, 1),
      line(1100, 2),
    ]);
    expect(enriched.products[0].fees).toBe(1000);
    expect(enriched.products[0].year).toBe(1);
  });

  it('sums only within the first year of an invoice', async () => {
    const [enriched] = await enrich(contractTypes.Invoice, [
      line(1106, 1),
      line(595, 1),
      line(9999, 2),
    ]);
    expect(enriched.products[0].fees).toBe(1701);
  });

  it('leaves a single-line contract untouched', async () => {
    const [enriched] = await enrich(contractTypes.Invoice, [line(500)]);
    expect(enriched.products[0].fees).toBe(500);
  });
});
