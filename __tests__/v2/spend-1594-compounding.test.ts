import type { Contract } from '@/app/lib/budget/types';
import {
  resolveFeeSegments,
  lineageFor,
  EMPTY_LINEAGE,
} from '@/lib/v2/spend/resolver';

const ASOF = new Date('2026-07-01T00:00:00Z');
const HORIZON = new Date('2029-01-01T00:00:00Z');
const HORIZON_START = new Date(0);
const usd = { mode: 'preconverted-usd' } as const;

// Truvalue #112: a 12-month recorded term carrying a year-2 fee row. Under
// #1594 the year-2 row is not a committed second year — it is a projected
// renewal priced from its RECORDED fee, so it consumes a renewal index without
// being compounded.
const hintShape = {
  id: 112,
  vendor_id: 10,
  type_id: 2,
  status: 'active',
  status_id: 4,
  currency: 'usd',
  annual_increase: 10,
  annual_increase_months: null,
  subscription_term: null,
  renewal_period: null,
  renewal_type: null,
  billing_frequency: 'Annually',
  will_not_renew: false,
  term_start_date: [{ date: '2024-01-02' }],
  term_end_date: [{ date: '2025-01-01' }],
  cancel_date: [],
  cancel_by_date: null,
  vendor_products_details: [
    {
      product_id: 72,
      year: 1,
      fees: 10000,
      vendor_products: { id: 72, name: 'Platform' },
    },
    {
      product_id: 72,
      year: 2,
      fees: 5000,
      vendor_products: { id: 72, name: 'Platform' },
    },
  ],
  vendors: { name: 'Truvalue Labs, Inc.' },
} as unknown as Contract;

function ladder(contract: Contract): Array<[string, number]> {
  return resolveFeeSegments(contract, lineageFor(EMPTY_LINEAGE, contract.id), {
    asOf: ASOF,
    horizonStart: HORIZON_START,
    horizonEnd: HORIZON,
    currency: usd,
  })
    .sort((a, b) => a.from.localeCompare(b.from))
    .map((s) => [s.from.slice(0, 4), Math.round(s.fee)] as [string, number]);
}

describe('#1594 hint cycles do not inflate later compounding', () => {
  it('compounds from the hint fee, not from the initial term', () => {
    // 2024 recorded 10,000. 2025 is renewal 1, seeded from the RECORDED year-2
    // fee (5,000) — no increase, the recorded price is already stepped up.
    // 2026 is renewal 2 but only ONE year past the seed, so exactly one
    // increase: 5,000 x 1.1 = 5,500. Before the fix this read 6,655.
    expect(ladder(hintShape)).toEqual([
      ['2024', 10000],
      ['2025', 5000],
      ['2026', 5500],
      ['2027', 6655],
      ['2028', 8053],
    ]);
  });

  it('matches legacy, which never reclassifies the year-2 row', () => {
    // Legacy calls 2025 "initial term year 2" and 2026 "renewal 1", arriving at
    // the same ladder by a different route. Agreement here means the fix
    // REMOVES an engine/legacy divergence rather than creating one.
    const fees = ladder(hintShape).map(([, fee]) => fee);
    expect(fees).toEqual([10000, 5000, 5500, 6655, 8053]);
  });

  it('leaves a contract without the #1594 shape untouched', () => {
    const noHint = {
      ...hintShape,
      id: 999,
      vendor_products_details: [
        {
          product_id: 72,
          year: 1,
          fees: 10000,
          vendor_products: { id: 72, name: 'Platform' },
        },
      ],
    } as unknown as Contract;

    // maxYear === 1, so no hint cycles exist and hintCycles is 0: the first
    // renewal still takes its single increase off the recorded fee.
    const fees = ladder(noHint).map(([, fee]) => fee);
    expect(fees[0]).toBe(10000);
    expect(fees[1]).toBe(11000);
  });
});
