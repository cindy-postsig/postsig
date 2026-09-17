import type { Contract } from '@/app/lib/budget/types';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import {
  buildEngineSpendByContract,
  enrichWithEngineSpend,
  type CurrencyPolicy,
  type EngineSpendValues,
} from '@/lib/v2/spend';
import {
  getUSDValue,
  computeContractBudgetValues,
  calculateBudgetTotals,
} from '@/lib/v2/core/budget';
import { contractTypes } from '@/app/lib/constants';

const USD: CurrencyPolicy = { mode: 'preconverted-usd' };
const ASOF = new Date('2026-07-01T00:00:00Z');
const FISCAL = { startMonth: 1 };

function makeContract(spec: {
  id: number;
  termStart: string;
  termEnd: string;
  fees: number;
  subscriptionTerm?: number;
  annualIncrease?: number;
  cancelByDays?: number;
  extra?: Record<string, unknown>;
}): Contract {
  return {
    id: spec.id,
    vendor_id: 10,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: spec.annualIncrease ?? null,
    annual_increase_months: null,
    subscription_term: spec.subscriptionTerm ?? 12,
    renewal_period: 12,
    renewal_type: 'Auto',
    billing_frequency: 'Annually',
    will_not_renew: false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: [{ date: spec.termEnd }],
    cancel_date: [],
    cancel_by_date: spec.cancelByDays ?? null,
    vendor_products_details: [
      {
        product_id: 100 + spec.id,
        year: 1,
        fees: spec.fees,
        vendor_products: { id: 100 + spec.id, name: `Product ${spec.id}` },
      },
    ],
    vendors: { name: 'Test Vendor' },
    ...spec.extra,
  } as unknown as Contract;
}

function enriched(
  contract: Contract,
  priceHistory: any = null,
): ContractWithPricing {
  return {
    id: contract.id as number,
    vendor_id: 10,
    vendor_name: 'Test Vendor',
    contract,
    products: [],
    priceHistory,
    isLinkedChildInvoice: false,
  };
}

describe('buildEngineSpendByContract', () => {
  it('reports FY-windowed committed spend per contract, not the active cycle fee', () => {
    // Cycle runs Nov 2025 -> Nov 2026, so the ACTIVE cycle at asOf started in
    // FY2025. Committed FY2026 must therefore pick up the Nov 2026 RENEWAL at
    // its increased price — the 10% increase is what distinguishes the engine's
    // window semantics from legacy's "fee of the active cycle" (100_000).
    const nov = makeContract({
      id: 1,
      termStart: '2025-11-01',
      termEnd: '2026-10-31',
      fees: 100000,
      annualIncrease: 10,
    });
    const values = buildEngineSpendByContract(
      [enriched(nov)],
      [],
      FISCAL,
      ASOF,
      { currency: USD },
    );

    expect(values.get(1)?.currentBase).toBe(110000);
  });

  it('gives every contract an entry even when it contributes nothing in window', () => {
    const past = makeContract({
      id: 2,
      termStart: '2019-01-01',
      termEnd: '2019-12-31',
      fees: 5000,
    });
    const values = buildEngineSpendByContract(
      [enriched(past)],
      [],
      FISCAL,
      ASOF,
      { currency: USD },
    );

    expect(values.has(2)).toBe(true);
  });

  it('keeps an offset renewal in the FY its term starts — cancel-by must not shift it', () => {
    // Jan-2026 cycle, 90-day cancel-by: under term-start recognition (product
    // decision 2026-08-04) the 2027 renewal books in FY2027 even though its
    // decision deadline falls on 2026-10-02 — each FY carries exactly one
    // year-slice. A cancel-by regression would read FY2026 = 10000.
    const offset = makeContract({
      id: 7,
      termStart: '2026-01-01',
      termEnd: '2026-12-31',
      fees: 5000,
      cancelByDays: 90,
    });
    const values = buildEngineSpendByContract(
      [enriched(offset)],
      [],
      FISCAL,
      ASOF,
      { currency: USD },
    );

    expect(values.get(7)?.currentBase).toBe(5000);
    expect(values.get(7)?.projectedBase).toBe(5000);
  });

  it('separates current and next fiscal year windows', () => {
    // The increase makes the two windows differ, so a swapped window fails.
    const jan = makeContract({
      id: 3,
      termStart: '2026-01-01',
      termEnd: '2026-12-31',
      fees: 60000,
      annualIncrease: 10,
    });
    const values = buildEngineSpendByContract(
      [enriched(jan)],
      [],
      FISCAL,
      ASOF,
      { currency: USD },
    );

    expect(values.get(3)?.currentBase).toBe(60000);
    expect(values.get(3)?.projectedBase).toBe(66000);
  });
});

describe('recorded invoice amount (window-independent)', () => {
  function invoice(
    id: number,
    termStart: string,
    termEnd: string,
    fees: number,
  ) {
    return enriched(
      makeContract({
        id,
        termStart,
        termEnd,
        fees,
        subscriptionTerm: 1,
        extra: { type_id: contractTypes.Invoice, renewal_type: 'One-Time' },
      }),
    );
  }

  it('reports a prior-period invoice at its full amount while the window stays zero', () => {
    const values = buildEngineSpendByContract(
      [invoice(40, '2025-06-01', '2025-06-30', 4200)],
      [],
      FISCAL,
      ASOF,
      { currency: USD },
    );

    // The window reading is correct and must not move — budget totals depend
    // on it — but the register needs the amount the invoice actually records.
    expect(values.get(40)?.currentNative).toBe(0);
    expect(values.get(40)?.recordedNative).toBe(4200);
    expect(values.get(40)?.recordedBase).toBe(4200);
  });

  it('reads identically on both stamps for an invoice inside the window', () => {
    const values = buildEngineSpendByContract(
      [invoice(41, '2026-03-01', '2026-03-31', 900)],
      [],
      FISCAL,
      ASOF,
      { currency: USD },
    );

    expect(values.get(41)?.currentNative).toBe(900);
    expect(values.get(41)?.recordedNative).toBe(900);
  });

  it('records invoices dated far outside any plausible window', () => {
    // The all-time window spans the engine's full representable range, so
    // even badly-dated documents (a 1965 archive import, a year-2205 typo)
    // keep their recorded amount instead of being zeroed by the bounds.
    const values = buildEngineSpendByContract(
      [
        invoice(43, '1965-06-01', '1965-06-30', 700),
        invoice(44, '2205-03-01', '2205-03-31', 1100),
      ],
      [],
      FISCAL,
      ASOF,
      { currency: USD },
    );

    expect(values.get(43)?.recordedNative).toBe(700);
    expect(values.get(43)?.recordedBase).toBe(700);
    expect(values.get(44)?.recordedNative).toBe(1100);
    expect(values.get(44)?.recordedBase).toBe(1100);
  });

  it('records at the window endpoints: first representable day in, last day out', () => {
    // Lower endpoint is inclusive — a year-1 date records. The upper endpoint
    // is the engine's edge: windows are half-open and no 4-digit ISO date
    // exists after 9999-12-31 to serve as an exclusive bound, so a billing
    // period STARTING on that one final day cannot be recorded. Pinned here
    // as a known limitation rather than discovered as a surprise.
    const values = buildEngineSpendByContract(
      [
        invoice(45, '0001-01-01', '0001-01-31', 500),
        invoice(46, '9999-12-01', '9999-12-30', 600),
        invoice(47, '9999-12-31', '9999-12-31', 900),
      ],
      [],
      FISCAL,
      ASOF,
      { currency: USD },
    );

    expect(values.get(45)?.recordedNative).toBe(500);
    expect(values.get(45)?.recordedBase).toBe(500);
    expect(values.get(46)?.recordedNative).toBe(600);
    expect(values.get(46)?.recordedBase).toBe(600);
    expect(values.get(47)?.recordedNative).toBe(0);
    expect(values.get(47)?.recordedBase).toBe(0);
  });

  it('leaves non-invoice contracts unstamped — their spend is window-relative', () => {
    const values = buildEngineSpendByContract(
      [
        enriched(
          makeContract({
            id: 42,
            termStart: '2019-01-01',
            termEnd: '2019-12-31',
            fees: 5000,
          }),
        ),
      ],
      [],
      FISCAL,
      ASOF,
      { currency: USD },
    );

    expect(values.get(42)?.recordedNative).toBeUndefined();
    expect(values.get(42)?.recordedBase).toBeUndefined();
  });
});

describe('enrichWithEngineSpend', () => {
  it('stamps engineSpend onto each contract without mutating the input', () => {
    const input = [
      enriched(
        makeContract({
          id: 4,
          termStart: '2026-01-01',
          termEnd: '2026-12-31',
          fees: 12000,
        }),
      ),
    ];
    const out = enrichWithEngineSpend(input, [], 1, ASOF, { currency: USD });

    expect(out[0].engineSpend).toEqual({
      currentBase: 12000,
      projectedBase: 12000,
      currentNative: 12000,
      projectedNative: 12000,
    });
    expect(input[0].engineSpend).toBeUndefined();
  });
});

describe('budget primitives prefer engine values', () => {
  const legacyPriceHistory = {
    periods: [
      {
        isCurrentTerm: true,
        isActivePeriod: true,
        termIndex: 0,
        yearWithinTerm: 0,
        fees: 999,
        feesUSD: 999,
        productFees: [],
      },
    ],
    vendorProductDetails: [],
    totalContractValueUSD: 4242,
  };

  const row = {
    ...enriched(
      makeContract({
        id: 5,
        termStart: '2026-01-01',
        termEnd: '2026-12-31',
        fees: 7000,
      }),
      legacyPriceHistory,
    ),
    engineSpend: {
      currentBase: 7000,
      projectedBase: 8000,
      currentNative: 7000,
      projectedNative: 8000,
    },
  };

  it('getUSDValue returns engine current/projected over the cached price history', () => {
    expect(getUSDValue(row, 'currentBudget')).toBe(7000);
    expect(getUSDValue(row, 'projectedBudget')).toBe(8000);
  });

  it('getUSDValue still reads TCV from the legacy price history', () => {
    expect(getUSDValue(row, 'totalContractValue')).toBe(4242);
  });

  it('falls back to legacy reads when engineSpend is absent', () => {
    const legacyOnly = enriched(
      makeContract({
        id: 6,
        termStart: '2026-01-01',
        termEnd: '2026-12-31',
        fees: 7000,
      }),
      legacyPriceHistory,
    );

    expect(getUSDValue(legacyOnly, 'currentBudget')).toBe(999);
  });

  it('computeContractBudgetValues uses engine spend but legacy TCV', () => {
    expect(computeContractBudgetValues(row)).toEqual({
      currentUSD: 7000,
      projectedUSD: 8000,
      tcvUSD: 4242,
    });
  });

  it('calculateBudgetTotals sums the engine values', () => {
    const totals = calculateBudgetTotals([row, row]);
    expect(totals.currentTotal).toBe(14000);
    expect(totals.projectedTotal).toBe(16000);
  });
});

describe('window-parameterized stamps (fiscal-year selector)', () => {
  // 10%/yr increase makes every FY distinguishable: 2024 = 10000,
  // 2025 = 11000, 2026 = 12100 — a windows-ignored regression would stamp
  // the asOf-2026 values instead of the selected pair.
  const escalating = makeContract({
    id: 20,
    termStart: '2024-01-01',
    termEnd: '2024-12-31',
    fees: 10000,
    annualIncrease: 10,
  });

  it('stamps the selected historical FY pair, not currentFY/nextFY', () => {
    const values = buildEngineSpendByContract(
      [enriched(escalating)],
      [],
      FISCAL,
      ASOF,
      {
        currency: USD,
        windows: {
          current: { fiscalYear: 2024 },
          projected: { fiscalYear: 2025 },
        },
      },
    );

    expect(values.get(20)?.currentBase).toBe(10000);
    expect(values.get(20)?.projectedBase).toBe(11000);
  });

  it('enrichWithEngineSpend forwards windows and cycle facts', () => {
    const out = enrichWithEngineSpend([enriched(escalating)], [], 1, ASOF, {
      currency: USD,
      windows: {
        current: { fiscalYear: 2025 },
        projected: { fiscalYear: 2026 },
      },
      cycleDates: true,
    });

    expect(out[0].engineSpend?.currentBase).toBe(11000);
    expect(out[0].engineSpend?.projectedBase).toBe(12100);
    expect(out[0].engineSpend?.activeInWindow).toBe(true);
    expect(out[0].engineSpend?.cycle?.termStart).toBe('2025-01-01');
  });
});

describe('cycle facts (point-in-time dates for the selected window)', () => {
  const cycleValues = (
    contract: Contract,
    fiscalYear: number,
  ): EngineSpendValues | undefined =>
    buildEngineSpendByContract([enriched(contract)], [], FISCAL, ASOF, {
      currency: USD,
      windows: {
        current: { fiscalYear },
        projected: { fiscalYear: fiscalYear + 1 },
      },
      cycleDates: true,
    }).get(contract.id as number);

  it('generates gap-year cycle dates the term arrays never recorded', () => {
    // 2019 start, annual auto-renew: the FY2022 cycle (2022-04-19 ->
    // 2023-04-18) exists only as a resolver projection. Cancel-by derives
    // from the day offset against THAT cycle's end.
    const gapYears = makeContract({
      id: 21,
      termStart: '2019-04-19',
      termEnd: '2020-04-18',
      fees: 5000,
      cancelByDays: 60,
    });

    const values = cycleValues(gapYears, 2022);
    expect(values?.activeInWindow).toBe(true);
    expect(values?.cycle).toEqual({
      termStart: '2022-04-19',
      termEnd: '2023-04-18',
      cancelBy: '2023-02-17',
    });
  });

  it('omits cancelBy when no offset exists', () => {
    const noOffset = makeContract({
      id: 22,
      termStart: '2019-04-19',
      termEnd: '2020-04-18',
      fees: 5000,
    });

    expect(cycleValues(noOffset, 2022)?.cycle?.cancelBy).toBeNull();
  });

  it('marks a contract inactive before its first term', () => {
    const later = makeContract({
      id: 23,
      termStart: '2019-04-19',
      termEnd: '2020-04-18',
      fees: 5000,
    });

    const values = cycleValues(later, 2018);
    expect(values?.activeInWindow).toBe(false);
    expect(values?.cycle).toBeNull();
    expect(values?.currentBase).toBe(0);
  });

  it('keeps a multi-year tail FY active with the whole recorded term, at the in-force value', () => {
    // 36-month One-Time deal 2024-07 -> 2027-06: no year-slice STARTS in
    // FY2027, but the deal covers half of it — the row stays visible (it was
    // active that year) showing the RECORDED term dates, not the engine's
    // internal 12-month slices. A window nothing starts in falls back to the
    // slice in force at its start rather than reading 0 on a running deal.
    const oneTime = makeContract({
      id: 24,
      termStart: '2024-07-01',
      termEnd: '2027-06-30',
      fees: 30000,
      subscriptionTerm: 36,
      extra: { renewal_type: 'One-Time', renewal_period: null },
    });

    const values = cycleValues(oneTime, 2027);
    expect(values?.activeInWindow).toBe(true);
    expect(values?.cycle?.termStart).toBe('2024-07-01');
    expect(values?.cycle?.termEnd).toBe('2027-06-30');
    expect(values?.currentBase).toBe(30000);
  });

  it('excludes a stale invoice even when its defaulted span overlaps the window', () => {
    // No-end-date invoice: the resolver defaults a 12-month span that reaches
    // into FY2026, but its activity date (execution) predates the window —
    // decision #14 keeps it out of historical rows exactly like the queries.
    const staleInvoice = makeContract({
      id: 25,
      termStart: '2025-10-01',
      termEnd: '',
      fees: 9000,
      extra: {
        type_id: 6,
        execution_date: '2025-10-01',
        term_end_date: [],
      },
    });

    const values = cycleValues(staleInvoice, 2026);
    expect(values?.activeInWindow).toBe(false);
    expect(values?.cycle).toBeNull();
  });

  it('does not stamp cycle facts unless asked', () => {
    const plain = makeContract({
      id: 26,
      termStart: '2026-01-01',
      termEnd: '2026-12-31',
      fees: 1000,
    });
    const values = buildEngineSpendByContract(
      [enriched(plain)],
      [],
      FISCAL,
      ASOF,
      { currency: USD },
    );

    expect(values.get(26)).not.toHaveProperty('cycle');
    expect(values.get(26)).not.toHaveProperty('activeInWindow');
  });
});

describe('per-product stamps (productValues, QA 2026-08-04)', () => {
  const twoProducts = (termStart: string, termEnd: string) =>
    makeContract({
      id: 12,
      termStart,
      termEnd,
      fees: 0,
      extra: {
        vendor_products_details: [
          {
            product_id: 501,
            year: 1,
            fees: 30000,
            vendor_products: { id: 501, name: 'Seat licences' },
          },
          {
            product_id: 502,
            year: 1,
            fees: 70000,
            vendor_products: { id: 502, name: 'Data feed' },
          },
        ],
      },
    });

  it('stamps per-product native values that sum to the contract total', () => {
    const values = buildEngineSpendByContract(
      [enriched(twoProducts('2026-01-01', '2026-12-31'))],
      [],
      FISCAL,
      ASOF,
      { currency: USD, productValues: true },
    );
    const stamp = values.get(12);
    expect(stamp?.products?.[501]?.currentNative).toBe(30000);
    expect(stamp?.products?.[502]?.currentNative).toBe(70000);
    const sum = Object.values(stamp?.products ?? {}).reduce(
      (total, product) => total + product.currentNative,
      0,
    );
    expect(sum).toBe(stamp?.currentNative);
  });

  it('books each product in the FY its term starts, like the parent row', () => {
    // June start: committed books the FULL per-product value in FY2026, not
    // a prorated share — the same term-start recognition as the contract
    // stamp.
    const values = buildEngineSpendByContract(
      [enriched(twoProducts('2026-06-01', '2027-05-31'))],
      [],
      FISCAL,
      ASOF,
      { currency: USD, productValues: true },
    );
    expect(values.get(12)?.products?.[501]?.currentNative).toBe(30000);
    expect(values.get(12)?.products?.[502]?.currentNative).toBe(70000);
  });

  it('does not stamp products unless asked', () => {
    const values = buildEngineSpendByContract(
      [enriched(twoProducts('2026-01-01', '2026-12-31'))],
      [],
      FISCAL,
      ASOF,
      { currency: USD },
    );
    expect(values.get(12)?.products).toBeUndefined();
  });
});
