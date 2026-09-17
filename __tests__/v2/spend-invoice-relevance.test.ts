import type { Contract } from '@/app/lib/budget/types';
import { querySpend, queryCommitments, EMPTY_LINEAGE } from '@/lib/v2/spend';
import {
  invoiceActivityDate,
  isStaleInvoice,
  excludeStaleInvoices,
} from '@/lib/v2/spend/invoiceRelevance';
import { buildBudgetSummary } from '@/lib/v2/core/budget';
import type { ContractWithPricing } from '@/lib/v2/core/types';

const ASOF = new Date('2026-07-01T00:00:00Z');
const FY26_START = new Date('2026-01-01T00:00:00Z');
const usd = { mode: 'preconverted-usd' } as const;

const CONTRACT_TYPE_SERVICE_ORDER = 2;
const CONTRACT_TYPE_INVOICE = 6;
const CONTRACT_TYPE_EA_INVOICE = 13;

function contractRow(spec: {
  id: number;
  typeId: number;
  termStart: string;
  termEnd?: string;
  executionDate?: string;
  fees?: number;
}): Contract {
  return {
    id: spec.id,
    vendor_id: 10,
    type_id: spec.typeId,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    execution_date: spec.executionDate ?? null,
    annual_increase: null,
    annual_increase_months: null,
    subscription_term: null,
    renewal_period: null,
    renewal_type: null,
    billing_frequency: 'Annually',
    will_not_renew: false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: spec.termEnd ? [{ date: spec.termEnd }] : [],
    cancel_date: [],
    cancel_by_date: null,
    vendor_products_details: [
      {
        product_id: 100 + spec.id,
        year: 1,
        fees: spec.fees ?? 12000,
        vendor_products: { id: 100 + spec.id, name: `Product ${spec.id}` },
      },
    ],
    vendors: { name: 'Test Vendor' },
  } as unknown as Contract;
}

function amortizedTotal(
  contracts: Contract[],
  window: 'currentFY' | { fiscalYear: number } = 'currentFY',
): number {
  const result = querySpend(contracts, {
    basis: 'amortized',
    source: 'expected',
    window,
    granularity: 'year',
    groupBy: 'contract',
    currency: usd,
    fiscalConfig: { startMonth: 1 },
    asOf: ASOF,
  });
  return result.items.reduce((sum, item) => sum + item.value, 0);
}

describe('invoice activity date (later of invoice date / billing-period end)', () => {
  it('takes the invoice date when it is later (arrears billing)', () => {
    const arrears = contractRow({
      id: 1,
      typeId: CONTRACT_TYPE_INVOICE,
      termStart: '2025-07-01',
      termEnd: '2025-12-31',
      executionDate: '2026-01-10',
    });
    expect(invoiceActivityDate(arrears)).toBe('2026-01-10');
    expect(isStaleInvoice(arrears, FY26_START)).toBe(false);
  });

  it('takes the billing-period end when it is later (charged up front)', () => {
    const prepaid = contractRow({
      id: 2,
      typeId: CONTRACT_TYPE_INVOICE,
      termStart: '2026-01-01',
      termEnd: '2026-06-30',
      executionDate: '2025-12-15',
    });
    expect(invoiceActivityDate(prepaid)).toBe('2026-06-30');
    expect(isStaleInvoice(prepaid, FY26_START)).toBe(false);
  });

  it('takes the billing-period start when no end is recorded (prepaid)', () => {
    // Raised in December for a single May billing month. The resolver books a
    // recorded-end-less invoice as one month from its START, so the start is
    // the only date proving the fee lands inside FY26 — judging by the
    // execution date alone dated this invoice to FY25 and dropped it.
    const prepaidNoEnd = contractRow({
      id: 5,
      typeId: CONTRACT_TYPE_INVOICE,
      termStart: '2026-05-01',
      executionDate: '2025-12-15',
    });
    expect(invoiceActivityDate(prepaidNoEnd)).toBe('2026-05-01');
    expect(isStaleInvoice(prepaidNoEnd, FY26_START)).toBe(false);
  });

  it('counts a prepaid invoice in the window its billing period lands in', () => {
    const prepaidNoEnd = contractRow({
      id: 6,
      typeId: CONTRACT_TYPE_INVOICE,
      termStart: '2026-05-01',
      executionDate: '2025-12-15',
      fees: 4200,
    });
    expect(amortizedTotal([prepaidNoEnd])).toBe(4200);
  });

  it('uses the latest billing-period end when several are recorded', () => {
    const multiTerm = {
      type_id: CONTRACT_TYPE_INVOICE,
      execution_date: null,
      term_end_date: [{ date: '2026-06-30' }, { date: '2024-06-30' }],
    };
    expect(invoiceActivityDate(multiTerm)).toBe('2026-06-30');
    expect(isStaleInvoice(multiTerm, FY26_START)).toBe(false);
  });

  it('is stale only when every recorded date lies before the window', () => {
    const stale = contractRow({
      id: 3,
      typeId: CONTRACT_TYPE_INVOICE,
      termStart: '2025-01-01',
      termEnd: '2025-06-30',
      executionDate: '2025-07-15',
    });
    expect(isStaleInvoice(stale, FY26_START)).toBe(true);
  });

  it('treats an Exchange Agreement invoice like a regular invoice (psk-1890)', () => {
    const staleEA = contractRow({
      id: 31,
      typeId: CONTRACT_TYPE_EA_INVOICE,
      termStart: '2025-01-01',
      termEnd: '2025-06-30',
      executionDate: '2025-07-15',
    });
    expect(isStaleInvoice(staleEA, FY26_START)).toBe(true);
  });

  it('keeps an invoice whose activity lands exactly on the window start', () => {
    const boundary = {
      type_id: CONTRACT_TYPE_INVOICE,
      execution_date: '2026-01-01',
      term_end_date: [] as Array<{ date: string }>,
    };
    expect(isStaleInvoice(boundary, FY26_START)).toBe(false);
  });

  it('never marks a dateless invoice stale — no evidence to exclude on', () => {
    const dateless = { type_id: CONTRACT_TYPE_INVOICE };
    expect(invoiceActivityDate(dateless)).toBeNull();
    expect(isStaleInvoice(dateless, FY26_START)).toBe(false);
  });

  it('never applies to non-invoice contracts, however old their dates', () => {
    const oldServiceOrder = contractRow({
      id: 4,
      typeId: CONTRACT_TYPE_SERVICE_ORDER,
      termStart: '2020-01-01',
      termEnd: '2020-12-31',
      executionDate: '2020-01-01',
    });
    expect(isStaleInvoice(oldServiceOrder, FY26_START)).toBe(false);
  });
});

describe('querySpend drops stale invoices per window', () => {
  // No recorded end: the invoice books its full amount in its start month
  // (product decision 2026-08-05) — it cannot smear into the current year
  // any more, and the stale rule excludes it from FY26 regardless.
  const staleOpenEnded = contractRow({
    id: 10,
    typeId: CONTRACT_TYPE_INVOICE,
    termStart: '2025-10-01',
    executionDate: '2025-11-15',
  });

  it('excludes an invoice whose activity ended before the window', () => {
    expect(amortizedTotal([staleOpenEnded])).toBe(0);
  });

  it('keeps the same invoice when its invoice date reaches the window', () => {
    // A recorded billing period reaching into FY26 keeps the smear-shape the
    // relevance rule exists for; the single-month rule only covers invoices
    // with NO recorded end.
    const fresh = contractRow({
      id: 11,
      typeId: CONTRACT_TYPE_INVOICE,
      termStart: '2025-10-01',
      termEnd: '2026-09-30',
      executionDate: '2026-01-15',
    });
    expect(amortizedTotal([fresh])).toBeGreaterThan(0);
  });

  it('keeps an invoice whose billing period reaches the window', () => {
    const straddling = contractRow({
      id: 12,
      typeId: CONTRACT_TYPE_INVOICE,
      termStart: '2025-07-01',
      termEnd: '2026-06-30',
      executionDate: '2025-07-01',
    });
    expect(amortizedTotal([straddling])).toBeGreaterThan(0);
  });

  it('keeps stale invoices for historical windows covering their dates', () => {
    // The full amount books in October 2025 (no recorded end → single-month,
    // product decision 2026-08-05), so FY2025 carries all of it.
    expect(amortizedTotal([staleOpenEnded], { fiscalYear: 2025 })).toBe(12000);
  });

  it('leaves non-invoice contracts alone', () => {
    const serviceOrder = contractRow({
      id: 13,
      typeId: CONTRACT_TYPE_SERVICE_ORDER,
      termStart: '2025-10-01',
      executionDate: '2025-11-15',
    });
    expect(amortizedTotal([serviceOrder])).toBeGreaterThan(0);
  });
});

describe('event queries drop stale invoices per window', () => {
  function commitmentsTotal(
    contracts: Contract[],
    window: 'currentFY' | { fiscalYear: number } = 'currentFY',
  ): number {
    const result = queryCommitments(
      [...contracts],
      {
        window,
        granularity: 'year',
        groupBy: 'contract',
        valuation: 'annual',
        currency: usd,
        fiscalConfig: { startMonth: 1 },
        asOf: ASOF,
      },
      EMPTY_LINEAGE,
    );
    return result.items.reduce((sum, item) => sum + item.value, 0);
  }

  // Was pinned the other way: an invoice raised before the window was dropped
  // from it even when its billing period started inside. Because the fee is
  // recognized at its term start, that invoice then counted in NO fiscal year
  // — FY25 didn't claim it either (the event sits in FY26) — so the amount
  // disappeared from every window rather than moving to an earlier one.
  // Billing-period starts now count as activity, which lands it in exactly
  // one year.
  it('counts a prepaid invoice in the window its billing period starts in', () => {
    const raisedBeforeWindow = contractRow({
      id: 20,
      typeId: CONTRACT_TYPE_INVOICE,
      termStart: '2026-02-01',
      executionDate: '2025-12-15',
    });
    expect(commitmentsTotal([raisedBeforeWindow])).toBe(12000);
    expect(commitmentsTotal([raisedBeforeWindow], { fiscalYear: 2025 })).toBe(
      0,
    );
  });

  it('keeps an invoice whose activity reaches the window', () => {
    const fresh = contractRow({
      id: 21,
      typeId: CONTRACT_TYPE_INVOICE,
      termStart: '2026-02-01',
      termEnd: '2026-07-31',
      executionDate: '2026-02-01',
    });
    expect(commitmentsTotal([fresh])).toBe(12000);
  });
});

describe('budget summary totals honor the cutoff', () => {
  function enrichedRow(spec: {
    id: number;
    typeId: number;
    termEnd?: string;
    executionDate?: string;
    tcv: number;
    current: number;
    projected: number;
  }): ContractWithPricing {
    return {
      id: spec.id,
      vendor_id: 10,
      contract: {
        id: spec.id,
        status_id: 4,
        status: 'active',
        ai_extraction_status: 'completed',
        type_id: spec.typeId,
        vendor_id: 10,
        vendors: { name: 'Test Vendor' },
        execution_date: spec.executionDate ?? null,
        term_end_date: spec.termEnd ? [{ date: spec.termEnd }] : [],
      },
      products: [],
      priceHistory: {
        annualContractValueUSD: spec.tcv,
        totalContractValueUSD: spec.tcv,
      },
      engineSpend: {
        currentBase: spec.current,
        projectedBase: spec.projected,
      },
    } as unknown as ContractWithPricing;
  }

  const keeper = enrichedRow({
    id: 30,
    typeId: CONTRACT_TYPE_SERVICE_ORDER,
    termEnd: '2026-12-31',
    tcv: 100000,
    current: 40000,
    projected: 42000,
  });
  const staleInvoice = enrichedRow({
    id: 31,
    typeId: CONTRACT_TYPE_INVOICE,
    termEnd: '2025-06-30',
    executionDate: '2025-07-15',
    tcv: 60000,
    current: 5000,
    projected: 5000,
  });

  it('excludes stale invoices from tcv / current / projected with a cutoff', () => {
    const summary = buildBudgetSummary([keeper, staleInvoice], {
      staleInvoiceCutoff: FY26_START,
    });
    expect(summary.tcv).toBe(100000);
    expect(summary.currentSpend).toBe(40000);
    expect(summary.projectedSpend).toBe(42000);
    expect(summary.priceHistories).toHaveLength(1);
  });

  it('keeps them without a cutoff — the legacy default', () => {
    const summary = buildBudgetSummary([keeper, staleInvoice]);
    expect(summary.tcv).toBe(160000);
    expect(summary.currentSpend).toBe(45000);
    expect(summary.projectedSpend).toBe(47000);
  });

  it('still counts a stale invoice as a contract — only its spend is excluded', () => {
    const summary = buildBudgetSummary([keeper, staleInvoice], {
      staleInvoiceCutoff: FY26_START,
    });
    expect(summary.totalContracts).toBe(2);
  });

  it('excludeStaleInvoices filters enriched rows by their contract dates', () => {
    expect(excludeStaleInvoices([keeper, staleInvoice], FY26_START)).toEqual([
      keeper,
    ]);
  });
});
