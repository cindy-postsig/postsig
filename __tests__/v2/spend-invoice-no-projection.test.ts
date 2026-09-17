import type { Contract } from '@/app/lib/budget/types';
import {
  resolveFeeSegments,
  lineageFor,
  EMPTY_LINEAGE,
} from '@/lib/v2/spend/resolver';

const ASOF = new Date('2026-07-01T00:00:00Z');
const HORIZON = new Date('2028-01-01T00:00:00Z');
const HORIZON_START = new Date(0);
const usd = { mode: 'preconverted-usd' } as const;

const CONTRACT_TYPE_SERVICE_ORDER = 2;
const CONTRACT_TYPE_INVOICE = 6;
const CONTRACT_TYPE_EA_INVOICE = 13;

function contractRow(spec: {
  id: number;
  typeId: number;
  termStart: string;
  termEnd: string;
  fees?: number;
}): Contract {
  return {
    id: spec.id,
    vendor_id: 10,
    type_id: spec.typeId,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: null,
    annual_increase_months: null,
    subscription_term: 6,
    renewal_period: null,
    renewal_type: null,
    billing_frequency: 'Annually',
    will_not_renew: false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: [{ date: spec.termEnd }],
    cancel_date: [],
    cancel_by_date: null,
    vendor_products_details: [
      {
        product_id: 100 + spec.id,
        year: 1,
        fees: spec.fees ?? 50000,
        vendor_products: { id: 100 + spec.id, name: `Product ${spec.id}` },
      },
    ],
    vendors: { name: 'Test Vendor' },
  } as unknown as Contract;
}

const resolve = (contract: Contract) =>
  resolveFeeSegments(contract, lineageFor(EMPTY_LINEAGE, contract.id), {
    asOf: ASOF,
    horizonStart: HORIZON_START,
    horizonEnd: HORIZON,
    currency: usd,
  });

describe('invoices do not project renewals', () => {
  // Berenberg's WM Datenservice shape: each half-year billed as its own
  // invoice. A 2024 H1 invoice must not still be generating obligations in
  // FY2026 alongside the real 2026 invoice.
  const spec = {
    id: 1,
    termStart: '2024-01-01',
    termEnd: '2024-06-30',
    fees: 312521,
  };

  it('records an invoice fee exactly once, on its own dates', () => {
    const segments = resolve(
      contractRow({ ...spec, typeId: CONTRACT_TYPE_INVOICE }),
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ from: '2024-01-01', fee: 312521 });
    expect(
      segments.filter((s) => s.source === 'renewal-projection'),
    ).toHaveLength(0);
  });

  it('still projects for a non-invoice contract of the same shape', () => {
    const segments = resolve(
      contractRow({ ...spec, typeId: CONTRACT_TYPE_SERVICE_ORDER }),
    );

    expect(
      segments.filter((s) => s.source === 'renewal-projection').length,
    ).toBeGreaterThan(0);
  });

  it('treats an Exchange Agreement invoice like a regular invoice (psk-1890)', () => {
    // EAINV must behave as its base type everywhere outside extraction — a
    // bare type_id === 6 check would let it project phantom renewals.
    const segments = resolve(
      contractRow({ ...spec, typeId: CONTRACT_TYPE_EA_INVOICE }),
    );

    expect(segments).toHaveLength(1);
    expect(
      segments.filter((s) => s.source === 'renewal-projection'),
    ).toHaveLength(0);
  });

  it('leaves an invoice with no recorded end date emitting no projections', () => {
    const openEnded = contractRow({
      id: 2,
      typeId: CONTRACT_TYPE_INVOICE,
      termStart: '2010-01-01',
      termEnd: '2010-12-31',
      fees: 178767,
    });

    expect(
      resolve(openEnded).filter((s) => s.source === 'renewal-projection'),
    ).toHaveLength(0);
  });
});
