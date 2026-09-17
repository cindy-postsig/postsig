/**
 * Product decision 2026-08-05 (contract 3120): an invoice recording no end
 * date and no term books its FULL amount in its start month — never the
 * silent 12-month default span. Deliberately invoice-only: open-ended
 * contracts (evergreen Service Orders/MSAs) rely on the 12-month default
 * plus assumed renewal for their annual run-rate.
 */
import type { Contract } from '@/app/lib/budget/types';
import { querySpend, queryCommitments } from '@/lib/v2/spend';
import { INFERENCE_REASONS, resolveFeeSegments } from '@/lib/v2/spend/resolver';

const ASOF = new Date('2026-08-01T00:00:00Z');
const HORIZON_START = new Date(0);
const usd = { mode: 'preconverted-usd' } as const;
const CONTRACT_TYPE_INVOICE = 6;
const CONTRACT_TYPE_EA_INVOICE = 13;
const CONTRACT_TYPE_SERVICE_ORDER = 2;

function row(spec: {
  id: number;
  typeId: number;
  termStart: string;
  termEnd?: string;
  subscriptionTerm?: number;
  fees?: number;
}): Contract {
  return {
    id: spec.id,
    vendor_id: 10,
    type_id: spec.typeId,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    execution_date: spec.termStart,
    annual_increase: null,
    annual_increase_months: null,
    subscription_term: spec.subscriptionTerm ?? null,
    renewal_period: null,
    renewal_type: null,
    billing_frequency: '',
    will_not_renew: false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: spec.termEnd ? [{ date: spec.termEnd }] : [],
    cancel_date: [],
    cancel_by_date: null,
    vendor_products_details: [
      {
        product_id: 100 + spec.id,
        year: 1,
        fees: spec.fees ?? 1200,
        vendor_products: { id: 100 + spec.id, name: `Product ${spec.id}` },
      },
    ],
    vendors: { name: 'Test Vendor' },
  } as unknown as Contract;
}

function monthly(contracts: Contract[]): Map<string, number> {
  const result = querySpend(contracts, {
    basis: 'amortized',
    source: 'expected',
    window: { from: '2026-01-01', to: '2027-01-01' },
    granularity: 'month',
    groupBy: 'contract',
    currency: usd,
    fiscalConfig: { startMonth: 1 },
    asOf: ASOF,
  });
  const byMonth = new Map<string, number>();
  for (const item of result.items) {
    byMonth.set(item.period, (byMonth.get(item.period) ?? 0) + item.value);
  }
  return byMonth;
}

describe('no-end-date invoices book single-month', () => {
  const invoice = () =>
    row({ id: 1, typeId: CONTRACT_TYPE_INVOICE, termStart: '2026-03-11' });

  it('amortized: the full amount lands in the start month, nothing after', () => {
    const byMonth = monthly([invoice()]);
    expect(byMonth.get('2026-03')).toBe(1200);
    expect(byMonth.get('2026-04')).toBeUndefined();
    expect(byMonth.get('2026-12')).toBeUndefined();
  });

  it('amortized at year granularity: the full amount in the start FY', () => {
    const result = querySpend([invoice()], {
      basis: 'amortized',
      source: 'expected',
      window: 'currentFY',
      granularity: 'year',
      groupBy: 'contract',
      currency: usd,
      fiscalConfig: { startMonth: 1 },
      asOf: ASOF,
    });
    expect(result.items.reduce((s, i) => s + i.value, 0)).toBe(1200);
  });

  it('actual and committed agree: one full-amount event at the start', () => {
    const actual = querySpend([invoice()], {
      basis: 'actual',
      source: 'expected',
      window: 'currentFY',
      granularity: 'month',
      groupBy: 'contract',
      currency: usd,
      fiscalConfig: { startMonth: 1 },
      asOf: ASOF,
    });
    const committed = queryCommitments([invoice()], {
      window: 'currentFY',
      granularity: 'month',
      groupBy: 'contract',
      valuation: 'annual',
      recognition: 'term-start',
      currency: usd,
      fiscalConfig: { startMonth: 1 },
      asOf: ASOF,
    });
    expect(actual.items).toEqual([
      expect.objectContaining({ period: '2026-03', value: 1200 }),
    ]);
    expect(committed.items).toEqual([
      expect.objectContaining({ period: '2026-03', value: 1200 }),
    ]);
  });

  it('treats an Exchange Agreement invoice the same (psk-1890)', () => {
    const byMonth = monthly([
      row({ id: 2, typeId: CONTRACT_TYPE_EA_INVOICE, termStart: '2026-03-11' }),
    ]);
    expect(byMonth.get('2026-03')).toBe(1200);
    expect(byMonth.get('2026-04')).toBeUndefined();
  });

  it('stamps the segment inferred with the single-month reason', () => {
    const segments = resolveFeeSegments(invoice(), undefined, {
      asOf: ASOF,
      horizonStart: HORIZON_START,
      horizonEnd: new Date('2027-01-01T00:00:00Z'),
      currency: usd,
    });
    expect(segments).toHaveLength(1);
    expect(segments[0].confidence).toBe('inferred');
    expect(segments[0].reason).toBe(INFERENCE_REASONS.invoiceSingleMonth);
    expect(segments[0].to).toBe('2026-04-11');
  });

  it('an inherited parent term beats the single-month rule', () => {
    // Term inheritance is parent-agnostic and runs first: a linked invoice
    // whose parent records a subscription_term spreads over it instead.
    const segments = resolveFeeSegments(
      invoice(),
      {
        cutoffByProduct: new Map(),
        amendsByProduct: new Map(),
        parentSubscriptionTerm: 6,
      },
      {
        asOf: ASOF,
        horizonStart: HORIZON_START,
        horizonEnd: new Date('2027-01-01T00:00:00Z'),
        currency: usd,
      },
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].reason).toBe(INFERENCE_REASONS.parentTermInherited);
    expect(segments[0].to).toBe('2026-09-11');
  });
});

describe('recorded data still wins over the single-month rule', () => {
  it('an invoice with a recorded end date amortizes across it', () => {
    const byMonth = monthly([
      row({
        id: 3,
        typeId: CONTRACT_TYPE_INVOICE,
        termStart: '2026-03-01',
        termEnd: '2026-08-31',
      }),
    ]);
    expect(byMonth.get('2026-03')).toBe(200);
    expect(byMonth.get('2026-08')).toBe(200);
    expect(byMonth.get('2026-09')).toBeUndefined();
  });

  it('an invoice with a subscription_term spreads over it', () => {
    const byMonth = monthly([
      row({
        id: 4,
        typeId: CONTRACT_TYPE_INVOICE,
        termStart: '2026-03-01',
        subscriptionTerm: 6,
      }),
    ]);
    expect(byMonth.get('2026-03')).toBe(200);
    expect(byMonth.get('2026-08')).toBe(200);
    expect(byMonth.get('2026-09')).toBeUndefined();
  });
});

describe('non-invoice contracts keep the 12-month default', () => {
  it('an open-ended service order still amortizes its annual run-rate', () => {
    // The blast-radius guard: evergreen contracts (no end date) must keep
    // contributing ~fee/12 per month, or org spend collapses to a single
    // historical month (e.g. a service order running since 2010).
    const byMonth = monthly([
      row({
        id: 5,
        typeId: CONTRACT_TYPE_SERVICE_ORDER,
        termStart: '2026-03-01',
      }),
    ]);
    expect(byMonth.get('2026-03')).toBe(100);
    expect(byMonth.get('2026-12')).toBe(100);
  });
});
