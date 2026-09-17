import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { generatePriceHistory } from '@/app/lib/budget/priceHistoryCalculator';
import {
  buildSpendByBusinessSponsor,
  buildSpendByBusinessGroup,
  transformToTopVendorsBySpend,
  transformToPriceChanges,
} from '@/lib/v2/reports/monthly-report/transforms';
import {
  buildMonthlyValuesByContract,
  type MonthlyValues,
} from '@/lib/v2/reports/monthly-report/engine';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import type { RawContractOwnerRow } from '@/lib/v2/owners';

// The engine's legacy USD policy: fixtures carry pre-converted USD stamps.
const USD_POLICY = { mode: 'preconverted-usd' } as const;

// Pins the monthly report's transform output over the SAME raw-row fixtures
// the pre-port golden used, now through the engine path. The reviewed
// regeneration diff at the port (leading-gap fill, cents-preserving splits,
// decision-#13 grouping) is the port's review artifact.
// Regenerate deliberately with UPDATE_GOLDENS=1; never hand-edit the JSON.
const GOLDEN_PATH = path.join(
  __dirname,
  '__goldens__',
  'monthly-report-goldens.json',
);

// Same frozen clock as spend-goldens: 2026-07-15 → current month 2026-07,
// next month 2026-08, fiscal year 2026 (January start).
const CLOCK = new Date(2026, 6, 15);

interface FixtureSpec {
  id: number;
  vendor: string;
  termStart: string;
  termEnd: string;
  fees: number;
  billingFrequency: string;
  subscriptionTerm?: number;
  annualIncrease?: number;
  willNotRenew?: boolean;
  sponsors?: string[];
  groups?: string[];
}

// The contract_owners embed rows the populate run leaves behind (psk-1975):
// the free-text sponsors become labels, the legacy scalar and ACL group names
// become org_unit rows, one node per distinct name.
const UNIT_IDS = new Map<string, number>();
function ownerRows(spec: FixtureSpec): RawContractOwnerRow[] {
  const blank = {
    user_id: null,
    org_employee_id: null,
    label: null,
    org_unit_id: null,
    users: null,
    org_employees: null,
    org_units: null,
  };
  let rowId = 0;
  return [
    ...(spec.sponsors ?? []).map((label) => ({
      ...blank,
      id: ++rowId,
      role: 'sponsor',
      label,
    })),
    ...(spec.groups ?? []).map((name) => {
      const unitId = UNIT_IDS.get(name) ?? UNIT_IDS.size + 1;
      UNIT_IDS.set(name, unitId);
      return {
        ...blank,
        id: ++rowId,
        role: 'group',
        org_unit_id: unitId,
        org_units: { name, level: 'business_group', parent_id: null },
      };
    }),
  ];
}

function makeEnriched(spec: FixtureSpec): ContractWithPricing {
  const raw = {
    id: spec.id,
    vendor_id: spec.id * 10,
    type_id: 2,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: spec.annualIncrease ?? null,
    annual_increase_months: null,
    subscription_term: spec.subscriptionTerm ?? 12,
    renewal_period: null,
    renewal_type: 'Auto',
    billing_frequency: spec.billingFrequency,
    will_not_renew: spec.willNotRenew ?? false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: [{ date: spec.termEnd }],
    cancel_date: [],
    cancel_by_date: null,
    contract_owners: ownerRows(spec),
    contract_tags: [],
    vendor_products_details: [
      {
        id: spec.id * 1000,
        product_id: spec.id * 100,
        contract_id: spec.id,
        year: 1,
        fees: spec.fees,
        vendor_products: { id: spec.id * 100, name: `${spec.vendor} Product` },
      },
    ],
    vendors: { name: spec.vendor },
  };

  const priceHistory = generatePriceHistory(raw as never, 1, 'minimal', {});
  return {
    id: spec.id,
    vendor_id: raw.vendor_id,
    vendor_name: spec.vendor,
    vendor_domain: undefined,
    contract: raw,
    products: [
      {
        product_id: spec.id * 100,
        name: `${spec.vendor} Product`,
        isSuperseded: false,
        isSuperseding: false,
        sourceContractId: spec.id,
        year: 1,
        fees: spec.fees,
        currentFee: spec.fees,
        currentFeeUSD: spec.fees,
        effectiveFeeUSD: spec.fees,
        currency: 'USD',
      },
    ],
    priceHistory,
    isLinkedChildInvoice: false,
  } as unknown as ContractWithPricing;
}

// Shapes chosen for the diffs the port will surface:
// - multiSponsor: even split (naive float division today, cents-preserving after)
// - scalarGroup: owner group carried over from the legacy scalar
// - aclGroup: owner group carried over from the Owner-tab ACL row
// - novStart: FY-straddling auto-renewer (minimal-mode leading-gap shape)
// - renewalIncrease: Aug-1 renewal at +20% → a Jul→Aug price change row
// - willNotRenew: ends Jul 31, no renewal → Aug 0, negative change
const FIXTURES: FixtureSpec[] = [
  {
    id: 1,
    vendor: 'MultiSponsor Corp',
    termStart: '2026-01-01',
    termEnd: '2026-12-31',
    fees: 12000,
    billingFrequency: 'Quarterly',
    sponsors: ['Alice', 'Bob'],
  },
  {
    id: 2,
    vendor: 'ScalarGroup Inc',
    termStart: '2026-01-01',
    termEnd: '2026-12-31',
    fees: 24000,
    billingFrequency: 'Annually',
    groups: ['Research'],
  },
  {
    id: 3,
    vendor: 'AclGroup Ltd',
    termStart: '2026-03-01',
    termEnd: '2027-02-28',
    fees: 36000,
    billingFrequency: 'Monthly',
    groups: ['Trading'],
  },
  {
    id: 4,
    vendor: 'NovStart LLC',
    termStart: '2025-11-01',
    termEnd: '2026-10-31',
    fees: 50000,
    billingFrequency: 'Annually',
    sponsors: ['Carol'],
  },
  {
    id: 5,
    vendor: 'RenewalIncrease Co',
    termStart: '2025-08-01',
    termEnd: '2026-07-31',
    fees: 10000,
    billingFrequency: 'Quarterly',
    annualIncrease: 20,
  },
  {
    id: 6,
    vendor: 'WillNotRenew GmbH',
    termStart: '2025-08-01',
    termEnd: '2026-07-31',
    fees: 6000,
    billingFrequency: 'Monthly',
    willNotRenew: true,
  },
];

describe('monthly-report goldens (pre-port pin)', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: CLOCK });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('matches the pinned transform outputs', () => {
    const enriched = FIXTURES.map(makeEnriched);
    const engineValues = buildMonthlyValuesByContract(
      enriched,
      [],
      { startMonth: 1 },
      CLOCK,
      { currency: USD_POLICY },
    );

    // The third parameter differs by transform — `asOf` for the ones that date
    // a change, `nativeValues` for the ones that denominate a row — so each
    // capture states its own call rather than sharing one loose signature.
    const both = <T>(call: (values: Map<number, MonthlyValues>) => T) => ({
      amortized: call(engineValues.amortized),
      actual: call(engineValues.actual),
    });

    const capture = JSON.parse(
      JSON.stringify({
        sponsor: both((v) => buildSpendByBusinessSponsor(enriched, v)),
        // Spend by Business Group reads owner rows now (psk-1975): the
        // fixtures' legacy ACL/scalar groups are the owner groups the
        // populate run creates from them, so identical bytes prove the
        // cutover reproduces the report.
        group: both((v) => buildSpendByBusinessGroup(enriched, v, [])),
        topVendors: both((v) => transformToTopVendorsBySpend(enriched, v)),
        priceChanges: both((v) => transformToPriceChanges(enriched, v, CLOCK)),
      }),
    );

    if (process.env.UPDATE_GOLDENS) {
      writeFileSync(GOLDEN_PATH, JSON.stringify(capture, null, 2) + '\n');
    }
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
    expect(capture).toEqual(golden);
  });
});
