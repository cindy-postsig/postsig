import {
  buildContractTableRow,
  buildContractTableRows,
} from '@/lib/v2/contracts/transforms';
import { contractTypes } from '@/app/lib/constants';
import { getFiscalYearInfo } from '@/app/lib/budget';
import { computeContractBudgetValues } from '@/lib/v2/core/budget';
import { addDays, format, subDays } from 'date-fns';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import type {
  ContractTableRow,
  ProductSubRow,
  VendorGroupRow,
} from '@/lib/v2/core/types';

interface ProductFixture {
  product_id: number;
  name: string;
  fees: number;
  currentFeeUSD: number;
  effectiveFeeUSD?: number;
  isSuperseded?: boolean;
  /** Cancelled by a confirmed lineage event (PSK-1830). */
  isCancelled?: boolean;
  /** Books once in its recorded year; absent from projected periods (psk-1492). */
  oneTimeOnly?: boolean;
}

interface ContractFixture {
  id: number;
  vendorId: number;
  vendorName: string;
  currency?: string;
  /** Contract type id; set to 6 to mark as an invoice. */
  typeId?: number;
  /** priceHistory.totalContractValue (multi-year, the lifetime contract value) */
  priceHistoryTcv: number;
  /** priceHistory.current via active period's fees */
  priceHistoryCurrent: number;
  /** priceHistory.projected via the next period's fees */
  priceHistoryProjected: number;
  products: ProductFixture[];
  isLinkedChildInvoice?: boolean;
  isFullySuperseded?: boolean;
  engineSpend?: ContractWithPricing['engineSpend'];
}

function makeContract(f: ContractFixture): ContractWithPricing {
  const currency = f.currency ?? 'USD';

  // Build minimal periods that extractBudgetFromPriceHistory can read:
  //  - one current/active period carrying the per-product current fees
  //  - one "next" period carrying the projected fees for annualDifference math
  // currentTermPeriods sum to priceHistoryTcv so result.current/projected come
  // from the active/next slots and totalContractValue from the sum.
  const periods = [
    {
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      fees: f.priceHistoryCurrent,
      feesUSD: f.priceHistoryCurrent,
      productFees: f.products.map((p) => ({
        productId: p.product_id,
        fees: p.fees,
        feesUSD: p.fees,
        isSuperseded: p.isSuperseded ?? false,
      })),
      termType: 'initial',
      termIndex: 0,
      yearWithinTerm: 1,
      isCurrentTerm: true,
      isActivePeriod: true,
      isCurrentFiscalYear: true,
      isNextFiscalYear: false,
      status: 'active',
      isRenewalPoint: true,
      renewalCount: 0,
    },
    {
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      fees: f.priceHistoryProjected,
      feesUSD: f.priceHistoryProjected,
      // Mirrors calculateProductFees: one-time products never appear in
      // periods beyond their recorded year (psk-1492).
      productFees: f.products
        .filter((p) => !p.oneTimeOnly)
        .map((p) => ({
          productId: p.product_id,
          fees: p.fees,
          feesUSD: p.fees,
          isSuperseded: p.isSuperseded ?? false,
        })),
      termType: 'initial',
      termIndex: 0,
      yearWithinTerm: 2,
      isCurrentTerm: true,
      isActivePeriod: false,
      isCurrentFiscalYear: false,
      isNextFiscalYear: true,
      status: 'projected',
      isRenewalPoint: false,
      renewalCount: 0,
    },
  ];

  // tcvFiller absorbs the residual so currentTermPeriods sum to priceHistoryTcv
  const tcvFiller =
    f.priceHistoryTcv - f.priceHistoryCurrent - f.priceHistoryProjected;
  if (tcvFiller > 0) {
    periods.push({
      startDate: '2027-01-01',
      endDate: '2027-12-31',
      fees: tcvFiller,
      feesUSD: tcvFiller,
      productFees: [],
      termType: 'initial',
      termIndex: 0,
      yearWithinTerm: 3,
      isCurrentTerm: true,
      isActivePeriod: false,
      isCurrentFiscalYear: false,
      isNextFiscalYear: false,
      status: 'projected',
      isRenewalPoint: false,
      renewalCount: 0,
    });
  }

  const priceHistory = {
    id: f.id,
    vendor: f.vendorName,
    vendor_id: f.vendorId,
    currency,
    initialTermStartDate: '2025-01-01',
    initialTermEndDate: '2025-12-31',
    currentTermStartDate: '2025-01-01',
    currentTermEndDate: '2025-12-31',
    cancelByDate: null,
    annualIncrease: null,
    annualIncreaseMonths: null,
    renewalPeriod: null,
    subscriptionTerm: 12,
    billingFrequency: null,
    renewalType: null,
    willNotRenew: false,
    contractStatus: 'active',
    periods,
    totalContractValue: f.priceHistoryTcv,
    annualContractValue: f.priceHistoryCurrent,
    totalContractValueUSD: f.priceHistoryTcv,
    annualContractValueUSD: f.priceHistoryCurrent,
    fiscalYearStart: 1,
    vendorProductDetails: f.products.map((p) => ({
      product_id: p.product_id,
      year: 1,
      fees: p.fees,
      vendor_products: { id: p.product_id, name: p.name },
    })),
  };

  return {
    id: f.id,
    vendor_id: f.vendorId,
    vendor_name: f.vendorName,
    isLinkedChildInvoice: f.isLinkedChildInvoice ?? false,
    isFullySuperseded: f.isFullySuperseded ?? false,
    contract: {
      id: f.id,
      status: 'active',
      status_id: 4,
      currency,
      type_id: f.typeId,
      contract_types: f.typeId ? { id: f.typeId, name: 'Invoice' } : undefined,
      term_start_date: [{ date: '2025-01-01' }],
      term_end_date: [{ date: '2025-12-31' }],
      cancel_date: [],
      vendor_products_details: f.products.map((p) => ({
        product_id: p.product_id,
        year: 1,
        fees: p.fees,
        vendor_products: { id: p.product_id, name: p.name },
      })),
    },
    products: f.products.map((p) => ({
      product_id: p.product_id,
      name: p.name,
      vendor_id: f.vendorId,
      vendor_name: f.vendorName,
      contract_id: f.id,
      sourceContractId: f.id,
      isSuperseded: p.isSuperseded ?? false,
      isCancelled: p.isCancelled ?? false,
      isSuperseding: false,
      one_time_only: p.oneTimeOnly ?? false,
      currentFee: p.currentFeeUSD,
      currency,
      currentFeeUSD: p.currentFeeUSD,
      effectiveFeeUSD: p.effectiveFeeUSD ?? p.currentFeeUSD,
    })),
    priceHistory,
    ...(f.engineSpend ? { engineSpend: f.engineSpend } : {}),
  } as unknown as ContractWithPricing;
}

describe('buildContractTableRow — engine stamps drive the row (2026-08-04 flip)', () => {
  const stamped = () =>
    makeContract({
      id: 2948,
      vendorId: 219,
      vendorName: 'Euronext N.V.',
      currency: 'EUR',
      priceHistoryTcv: 999_999,
      priceHistoryCurrent: 111_111,
      priceHistoryProjected: 222_222,
      products: [
        { product_id: 1, name: 'Feed', fees: 199_929, currentFeeUSD: 230_172 },
      ],
      engineSpend: {
        currentBase: 230_172.21,
        projectedBase: 230_172.21,
        currentNative: 199_929,
        projectedNative: 209_925.45,
      },
    });

  it('shows native engine values, not the legacy price-history reads', () => {
    const row = buildContractTableRow(stamped());
    expect(row.currentBudget).toBe(199_929);
    expect(row.projectedBudget).toBe(209_925.45);
    expect(row.convertedCurrentBudget).toBe(230_172.21);
    expect(row.convertedProjectedBudget).toBe(230_172.21);
    // (209,925.45 − 199,929) / 199,929 = 5.0% — computed from the native pair.
    expect(row.annualDifference).toBe(5);
    expect(row.effectiveCurrentBudgetUSD).toBe(230_172.21);
  });

  it('keeps engine values on a multi-product parent instead of subrow sums', () => {
    const contract = makeContract({
      id: 3047,
      vendorId: 922,
      vendorName: 'ICE Data Indices, LLC',
      priceHistoryTcv: 163_132,
      priceHistoryCurrent: 56_044,
      priceHistoryProjected: 56_044,
      products: [
        { product_id: 1, name: 'A', fees: 40_000, currentFeeUSD: 40_000 },
        { product_id: 2, name: 'B', fees: 16_044, currentFeeUSD: 16_044 },
      ],
      // Deliberately different from the subrow fee sum (56,044) so the old
      // overwrite-with-sums behavior cannot masquerade as a pass.
      engineSpend: {
        currentBase: 61_044,
        projectedBase: 61_044,
        currentNative: 61_044,
        projectedNative: 61_044,
      },
    });
    const rows = buildContractTableRows([contract]) as ContractTableRow[];
    expect(rows[0].currentBudget).toBe(61_044);
    expect(rows[0].projectedBudget).toBe(61_044);
    expect(rows[0].subRows?.length).toBe(2);
  });

  it('blanks projected and annual difference for invoice rows', () => {
    const invoice = makeContract({
      id: 3000,
      vendorId: 100,
      vendorName: 'FactSet UK Limited',
      typeId: 6,
      priceHistoryTcv: 88_243,
      priceHistoryCurrent: 88_243,
      priceHistoryProjected: 88_243,
      products: [
        {
          product_id: 1,
          name: 'LSE Data',
          fees: 88_243,
          currentFeeUSD: 88_243,
        },
      ],
      engineSpend: {
        currentBase: 88_243,
        projectedBase: 0,
        currentNative: 88_243,
        projectedNative: 0,
      },
    });
    const row = buildContractTableRow(invoice);
    expect(row.currentBudget).toBe(88_243);
    expect(row.projectedBudget).toBeNull();
    expect(row.convertedProjectedBudget).toBeNull();
    expect(row.annualDifference).toBeNull();
    expect(row.effectiveProjectedBudgetUSD).toBeUndefined();
  });

  it('surfaces the recorded amount for a prior-period invoice the window zeroes', () => {
    const oldInvoice = makeContract({
      id: 3100,
      vendorId: 102,
      vendorName: 'WM Datenservice',
      typeId: contractTypes.Invoice,
      priceHistoryTcv: 4_200,
      priceHistoryCurrent: 0,
      priceHistoryProjected: 0,
      products: [
        { product_id: 1, name: 'Feed', fees: 4_200, currentFeeUSD: 4_200 },
      ],
      engineSpend: {
        currentBase: 0,
        projectedBase: 0,
        currentNative: 0,
        projectedNative: 0,
        recordedNative: 4_200,
        recordedBase: 4_200,
      },
    });
    const row = buildContractTableRow(oldInvoice);

    // currentBudget stays window-truthful; the register column reads recorded.
    expect(row.currentBudget).toBe(0);
    expect(row.recordedAmount).toBe(4_200);
    expect(row.recordedAmountUSD).toBe(4_200);
  });

  it('leaves the recorded amount null on non-invoice rows', () => {
    const row = buildContractTableRow(stamped());
    expect(row.recordedAmount).toBeNull();
    expect(row.recordedAmountUSD).toBeNull();
  });

  it('blanks projected for Exchange Agreement invoices too (psk-1890)', () => {
    const eaInvoice = makeContract({
      id: 3200,
      vendorId: 101,
      vendorName: 'Deutsche Börse AG',
      typeId: 13,
      priceHistoryTcv: 12_000,
      priceHistoryCurrent: 12_000,
      priceHistoryProjected: 12_000,
      products: [
        { product_id: 1, name: 'Feed', fees: 12_000, currentFeeUSD: 12_000 },
      ],
      engineSpend: {
        currentBase: 12_000,
        projectedBase: 0,
        currentNative: 12_000,
        projectedNative: 0,
      },
    });
    const row = buildContractTableRow(eaInvoice);
    expect(row.projectedBudget).toBeNull();
    expect(row.annualDifference).toBeNull();
  });

  it('falls back to legacy price-history reads when unstamped (archived view)', () => {
    const legacy = makeContract({
      id: 7,
      vendorId: 10,
      vendorName: 'Legacy Vendor',
      priceHistoryTcv: 30_000,
      priceHistoryCurrent: 10_000,
      priceHistoryProjected: 11_000,
      products: [
        { product_id: 1, name: 'P', fees: 10_000, currentFeeUSD: 10_000 },
      ],
    });
    const row = buildContractTableRow(legacy);
    expect(row.currentBudget).toBe(10_000);
    expect(row.projectedBudget).toBe(11_000);
  });
});

describe('buildContractTableRow — multi-product TCV', () => {
  // Regression for the v2 migration bug (PR #1142, transforms.ts:306).
  // Multi-product contract row used to overwrite totalContractValue with
  // summedCurrentBudget (1yr fee), losing the actual lifetime TCV.

  it('multi-product contract row preserves priceHistory totalContractValue', () => {
    const contract = makeContract({
      id: 1504,
      vendorId: 605,
      vendorName: 'Gartner, Inc.',
      priceHistoryTcv: 376370,
      priceHistoryCurrent: 184500,
      priceHistoryProjected: 191870,
      products: [
        {
          product_id: 2637,
          name: 'Gartner Invest Leader',
          fees: 36900,
          currentFeeUSD: 36900,
        },
        {
          product_id: 2638,
          name: 'Gartner Invest Team Cross Sector Member',
          fees: 147600,
          currentFeeUSD: 147600,
        },
      ],
    });

    const [row] = buildContractTableRows([contract]) as ContractTableRow[];

    // TCV must be the multi-year lifetime value, not the 1yr current sum
    expect(row.totalContractValue).toBe(376370);
    expect(row.convertedTotalContractValue).toBe(376370);
    expect(row.effectiveTotalContractValueUSD).toBe(376370);

    // currentBudget legitimately sums product subrows (1yr semantics)
    expect(row.currentBudget).toBe(184500);
  });

  it('single-product contract row TCV is unaffected by the multi-product branch', () => {
    const contract = makeContract({
      id: 9001,
      vendorId: 1,
      vendorName: 'SoloVendor',
      priceHistoryTcv: 250000,
      priceHistoryCurrent: 100000,
      priceHistoryProjected: 100000,
      products: [
        {
          product_id: 1,
          name: 'OnlyProduct',
          fees: 100000,
          currentFeeUSD: 100000,
        },
      ],
    });

    const row = buildContractTableRow(contract);

    expect(row.totalContractValue).toBe(250000);
    expect(row.currentBudget).toBe(100000);
  });
});

describe('buildContractTableRow — lineage-event cancellations', () => {
  const twoProducts = (secondOverrides: Partial<ProductFixture> = {}) => [
    { product_id: 10, name: 'Kept', fees: 600, currentFeeUSD: 600 },
    {
      product_id: 11,
      name: 'Cancelled',
      fees: 1200,
      currentFeeUSD: 0,
      isCancelled: true,
      ...secondOverrides,
    },
  ];

  const makeCancellationContract = (
    products: ProductFixture[],
  ): ContractWithPricing =>
    makeContract({
      id: 7001,
      vendorId: 1,
      vendorName: 'CancelVendor',
      priceHistoryTcv: 1800,
      priceHistoryCurrent: 600,
      priceHistoryProjected: 600,
      products,
    });

  it('marks cancelled products struck the same way superseded ones are', () => {
    const row = buildContractTableRow(makeCancellationContract(twoProducts()));

    expect(row.supersededProducts).toEqual(['11-1']);
    expect(row.isFullySuperseded).toBe(false);
  });

  it('strikes the product subrow of a cancelled product', () => {
    const [row] = buildContractTableRows([
      makeCancellationContract(twoProducts()),
    ]) as ContractTableRow[];

    const subRows = (row as { subRows?: Array<Record<string, unknown>> })
      .subRows;
    const cancelledSub = subRows?.find(
      (s) => (s.vendor_products as { id: number }).id === 11,
    );
    const keptSub = subRows?.find(
      (s) => (s.vendor_products as { id: number }).id === 10,
    );

    expect(cancelledSub?.isSuperseded).toBe(true);
    expect(keptSub?.isSuperseded).toBe(false);
  });

  it('fully strikes a row whose products are all cancelled', () => {
    const row = buildContractTableRow(
      makeCancellationContract([
        {
          product_id: 10,
          name: 'Gone A',
          fees: 600,
          currentFeeUSD: 0,
          isCancelled: true,
        },
        {
          product_id: 11,
          name: 'Gone B',
          fees: 1200,
          currentFeeUSD: 0,
          isCancelled: true,
        },
      ]),
    );

    expect(row.isFullySuperseded).toBe(true);
  });

  it('leaves untouched products unstruck when nothing is cancelled', () => {
    const row = buildContractTableRow(
      makeCancellationContract(twoProducts({ isCancelled: false })),
    );

    expect(row.supersededProducts).toEqual([]);
    expect(row.isFullySuperseded).toBe(false);
  });
});

/**
 * An invoice is never itself cancelled — only the service order or agreement
 * commanding it is. Billing that already happened on the invoice's own dates
 * stays valid, so a later cancellation must neither strike its products nor
 * drop them from its totals. Amendment supersession is a different concept
 * sharing the same field, and still strikes on invoices.
 */
describe('buildContractTableRow — invoices exempt from cancellation strikes', () => {
  const INVOICE = 6;
  const EAINV = contractTypes.EAINV;
  const SERVICE_ORDER = 1;

  const makeTyped = (
    typeId: number | undefined,
    products: ProductFixture[],
  ): ContractWithPricing =>
    makeContract({
      id: 7101,
      vendorId: 1,
      vendorName: 'CancelVendor',
      typeId,
      priceHistoryTcv: 1800,
      priceHistoryCurrent: 1800,
      priceHistoryProjected: 1800,
      products,
    });

  const cancelledPair = (): ProductFixture[] => [
    { product_id: 10, name: 'Kept', fees: 600, currentFeeUSD: 600 },
    {
      product_id: 11,
      name: 'Billed then cancelled',
      fees: 1200,
      currentFeeUSD: 1200,
      isCancelled: true,
    },
  ];

  it('does not strike a cancelled product on an invoice', () => {
    const row = buildContractTableRow(makeTyped(INVOICE, cancelledPair()));

    expect(row.supersededProducts).toEqual([]);
    expect(row.isFullySuperseded).toBe(false);
  });

  it('exempts Exchange Agreement Invoices too (not just type 6)', () => {
    const row = buildContractTableRow(makeTyped(EAINV, cancelledPair()));

    expect(row.supersededProducts).toEqual([]);
  });

  it('still strikes the same cancelled product on a service order', () => {
    const row = buildContractTableRow(
      makeTyped(SERVICE_ORDER, cancelledPair()),
    );

    expect(row.supersededProducts).toEqual(['11-1']);
  });

  it('still strikes an amendment-superseded product on an invoice', () => {
    const row = buildContractTableRow(
      makeTyped(INVOICE, [
        { product_id: 10, name: 'Kept', fees: 600, currentFeeUSD: 600 },
        {
          product_id: 11,
          name: 'Superseded by amendment',
          fees: 1200,
          currentFeeUSD: 0,
          isSuperseded: true,
        },
      ]),
    );

    expect(row.supersededProducts).toEqual(['11-1']);
  });

  it('leaves an all-cancelled invoice not fully struck', () => {
    const row = buildContractTableRow(
      makeTyped(INVOICE, [
        {
          product_id: 10,
          name: 'Gone A',
          fees: 600,
          currentFeeUSD: 600,
          isCancelled: true,
        },
        {
          product_id: 11,
          name: 'Gone B',
          fees: 1200,
          currentFeeUSD: 1200,
          isCancelled: true,
        },
      ]),
    );

    expect(row.isFullySuperseded).toBe(false);
  });

  it('does not strike the product subrow of a cancelled invoice product', () => {
    const [row] = buildContractTableRows([
      makeTyped(INVOICE, cancelledPair()),
    ]) as ContractTableRow[];

    const subRows = (row as { subRows?: Array<Record<string, unknown>> })
      .subRows;
    const cancelledSub = subRows?.find(
      (s) => (s.vendor_products as { id: number }).id === 11,
    );

    expect(cancelledSub?.isSuperseded).toBe(false);
  });

  // T3: the summing loop skips struck subrows, so the same flag that drives
  // the strikethrough drives the money. A billed product must count toward
  // the invoice it was billed on.
  it('counts a billed-then-cancelled product in the invoice total', () => {
    const [row] = buildContractTableRows([
      makeTyped(INVOICE, cancelledPair()),
    ]) as ContractTableRow[];

    expect(row.currentBudget).toBe(1800);
  });

  it('still excludes a cancelled product from a service order total', () => {
    const [row] = buildContractTableRows([
      makeTyped(SERVICE_ORDER, cancelledPair()),
    ]) as ContractTableRow[];

    expect(row.currentBudget).toBe(600);
  });
});

describe('groupContractsByVendor — WYSIWYS invariant', () => {
  // Vendor parent must equal sum of visible (non-superseded, non-linked-child)
  // contract subrows for every metric. Caught the Gartner symptom where
  // parent.tcv (376370) disagreed with subrow.tcv (184500).

  it('vendor parent equals sum of contract subrows for current, projected, tcv', () => {
    const contracts = [
      makeContract({
        id: 1504,
        vendorId: 605,
        vendorName: 'Gartner, Inc.',
        priceHistoryTcv: 376370,
        priceHistoryCurrent: 184500,
        priceHistoryProjected: 191870,
        products: [
          {
            product_id: 2637,
            name: 'Leader',
            fees: 36900,
            currentFeeUSD: 36900,
          },
          {
            product_id: 2638,
            name: 'Cross Sector',
            fees: 147600,
            currentFeeUSD: 147600,
          },
        ],
      }),
      makeContract({
        id: 1500,
        vendorId: 605,
        vendorName: 'Gartner, Inc.',
        priceHistoryTcv: 50000,
        priceHistoryCurrent: 25000,
        priceHistoryProjected: 25000,
        products: [
          {
            product_id: 9999,
            name: 'Other',
            fees: 25000,
            currentFeeUSD: 25000,
          },
        ],
      }),
    ];

    const rows = buildContractTableRows(contracts, { groupByVendor: true });
    expect(rows).toHaveLength(1); // one vendor group
    const group = rows[0] as VendorGroupRow;
    expect(group.isGroup).toBe(true);

    expect(group.convertedTotalContractValue).toBe(376370 + 50000);
    expect(group.convertedCurrentBudget).toBe(184500 + 25000);
    expect(group.convertedProjectedBudget).toBe(191870 + 25000);

    // sanity: parent is literally a sum of children
    const children = group.subRows ?? [];
    const sumTcv = children.reduce(
      (s, c) => s + (c.convertedTotalContractValue ?? 0),
      0,
    );
    expect(group.convertedTotalContractValue).toBe(sumTcv);
  });

  it('vendor parent excludes fully-superseded contracts and linked child invoices from the sum', () => {
    const contracts = [
      makeContract({
        id: 1,
        vendorId: 100,
        vendorName: 'Mixed Vendor',
        priceHistoryTcv: 100000,
        priceHistoryCurrent: 50000,
        priceHistoryProjected: 50000,
        products: [
          { product_id: 1, name: 'P1', fees: 50000, currentFeeUSD: 50000 },
        ],
      }),
      makeContract({
        id: 2,
        vendorId: 100,
        vendorName: 'Mixed Vendor',
        priceHistoryTcv: 999999,
        priceHistoryCurrent: 999999,
        priceHistoryProjected: 999999,
        isFullySuperseded: true,
        products: [
          {
            product_id: 2,
            name: 'P2',
            fees: 999999,
            currentFeeUSD: 999999,
            isSuperseded: true,
          },
        ],
      }),
      makeContract({
        id: 3,
        vendorId: 100,
        vendorName: 'Mixed Vendor',
        priceHistoryTcv: 12345,
        priceHistoryCurrent: 12345,
        priceHistoryProjected: 12345,
        isLinkedChildInvoice: true,
        products: [
          { product_id: 3, name: 'P3', fees: 12345, currentFeeUSD: 12345 },
        ],
      }),
    ];

    const rows = buildContractTableRows(contracts, { groupByVendor: true });
    const group = rows[0] as VendorGroupRow;

    // Only contract #1 should contribute
    expect(group.convertedTotalContractValue).toBe(100000);
    expect(group.convertedCurrentBudget).toBe(50000);
    expect(group.convertedProjectedBudget).toBe(50000);
  });

  it('vendor parent INCLUDES linked child invoices when all rows are invoices (typeId=6)', () => {
    // The /contracts/invoices view: there's no parent contract row in the
    // table to double-count against, so linked children must count or the
    // vendor parent will undercount versus the visible subrows.
    const contracts = [
      makeContract({
        id: 1,
        vendorId: 200,
        vendorName: 'AcmeCorp',
        typeId: 6,
        priceHistoryTcv: 1000,
        priceHistoryCurrent: 1000,
        priceHistoryProjected: 1000,
        products: [
          { product_id: 1, name: 'Inv1', fees: 1000, currentFeeUSD: 1000 },
        ],
      }),
      makeContract({
        id: 2,
        vendorId: 200,
        vendorName: 'AcmeCorp',
        typeId: 6,
        isLinkedChildInvoice: true,
        priceHistoryTcv: 500,
        priceHistoryCurrent: 500,
        priceHistoryProjected: 500,
        products: [
          { product_id: 2, name: 'Inv2', fees: 500, currentFeeUSD: 500 },
        ],
      }),
      makeContract({
        id: 3,
        vendorId: 200,
        vendorName: 'AcmeCorp',
        typeId: 6,
        isLinkedChildInvoice: true,
        priceHistoryTcv: 300,
        priceHistoryCurrent: 300,
        priceHistoryProjected: 300,
        products: [
          { product_id: 3, name: 'Inv3', fees: 300, currentFeeUSD: 300 },
        ],
      }),
    ];

    const rows = buildContractTableRows(contracts, { groupByVendor: true });
    const group = rows[0] as VendorGroupRow;

    // All three invoices count, including the two linked children. Projected
    // is 0: an invoice records a billing that already happened, so nothing
    // carries forward (decision #11) — row cells show blank, group sums 0.
    expect(group.convertedTotalContractValue).toBe(1800);
    expect(group.convertedCurrentBudget).toBe(1800);
    expect(group.convertedProjectedBudget).toBe(0);
  });

  it('vendor parent aggregates recorded amounts for invoice-only groups', () => {
    // Two prior-period invoices of one vendor (the WM Datenservice shape):
    // the current window correctly zeroes both, but the collapsed vendor row
    // must show the recorded sum its children display — a $0 parent over
    // non-zero children is the exact symptom recordedAmount exists to fix.
    const staleInvoice = (id: number, fee: number) =>
      makeContract({
        id,
        vendorId: 300,
        vendorName: 'WM Datenservice',
        typeId: contractTypes.Invoice,
        priceHistoryTcv: fee,
        priceHistoryCurrent: 0,
        priceHistoryProjected: 0,
        products: [
          { product_id: id, name: `Inv${id}`, fees: fee, currentFeeUSD: fee },
        ],
        engineSpend: {
          currentBase: 0,
          projectedBase: 0,
          currentNative: 0,
          projectedNative: 0,
          recordedNative: fee,
          recordedBase: fee,
        },
      });

    const rows = buildContractTableRows(
      [staleInvoice(1, 4200), staleInvoice(2, 3800)],
      { groupByVendor: true },
    );
    const group = rows[0] as VendorGroupRow;

    expect(group.isGroup).toBe(true);
    expect(group.recordedAmount).toBe(8000);
    expect(group.recordedAmountUSD).toBe(8000);
    // The windowed sum stays truthful — only the register column widens.
    expect(group.convertedCurrentBudget).toBe(0);
  });

  it('leaves the vendor parent recorded amount null for non-invoice groups', () => {
    const serviceOrder = (id: number) =>
      makeContract({
        id,
        vendorId: 301,
        vendorName: 'Acme',
        priceHistoryTcv: 1000,
        priceHistoryCurrent: 1000,
        priceHistoryProjected: 1000,
        products: [
          { product_id: id, name: `P${id}`, fees: 1000, currentFeeUSD: 1000 },
        ],
      });

    const rows = buildContractTableRows([serviceOrder(1), serviceOrder(2)], {
      groupByVendor: true,
    });
    const group = rows[0] as VendorGroupRow;

    expect(group.isGroup).toBe(true);
    expect(group.recordedAmount).toBeNull();
  });
});

describe('buildContractTableRow — orderNumber from metadata.lineage', () => {
  it('carries the extracted order number onto the row', () => {
    const contract = makeContract({
      id: 635,
      vendorId: 38,
      vendorName: 'Acme',
      priceHistoryTcv: 100,
      priceHistoryCurrent: 100,
      priceHistoryProjected: 100,
      products: [{ product_id: 1, name: 'P1', fees: 100, currentFeeUSD: 100 }],
    });
    contract.contract.metadata = {
      lineage: { order_number: '00768208' },
    };

    const row = buildContractTableRow(contract);

    expect(row.orderNumber).toBe('00768208');
  });

  it('is null when metadata has no lineage order number', () => {
    const contract = makeContract({
      id: 636,
      vendorId: 38,
      vendorName: 'Acme',
      priceHistoryTcv: 100,
      priceHistoryCurrent: 100,
      priceHistoryProjected: 100,
      products: [{ product_id: 1, name: 'P1', fees: 100, currentFeeUSD: 100 }],
    });

    const row = buildContractTableRow(contract);

    expect(row.orderNumber).toBeNull();
  });
});

describe('buildContractTableRow — inherited cancel-by date', () => {
  const inherited = {
    date: '2026-04-01',
    noticeDays: 90,
    sourceContractId: 10,
  };

  const serviceOrder = () =>
    makeContract({
      id: 20,
      vendorId: 38,
      vendorName: 'Acme',
      priceHistoryTcv: 100,
      priceHistoryCurrent: 100,
      priceHistoryProjected: 100,
      products: [{ product_id: 1, name: 'P1', fees: 100, currentFeeUSD: 100 }],
    });

  it('falls back to the date inherited from the MSA parent', () => {
    const contract = serviceOrder();
    contract.inheritedCancelByDate = inherited;

    const row = buildContractTableRow(contract);

    expect(row.cancelByDate).toBe('2026-04-01');
    expect(row.cancelByDateInherited).toEqual(inherited);
  });

  it("prefers the contract's own cancel date over an inherited one", () => {
    const contract = serviceOrder();
    contract.contract.cancel_date = [{ date: '2026-05-15' }];
    contract.inheritedCancelByDate = inherited;

    const row = buildContractTableRow(contract);

    expect(row.cancelByDate).toBe('2026-05-15');
  });

  it('leaves both null when nothing is inherited', () => {
    const row = buildContractTableRow(serviceOrder());

    expect(row.cancelByDate).toBeNull();
    expect(row.cancelByDateInherited).toBeNull();
  });
});

describe('buildContractTableRow — engine cycle dates (fiscal-year selector)', () => {
  // The fixture records 2025 term arrays; the stamped cycle is FY2022's
  // resolver-generated term — the row must show the point-in-time dates, not
  // the recorded ones.
  const historical = () =>
    makeContract({
      id: 30,
      vendorId: 40,
      vendorName: 'Time Machine Inc',
      priceHistoryTcv: 100,
      priceHistoryCurrent: 100,
      priceHistoryProjected: 100,
      products: [{ product_id: 1, name: 'P1', fees: 100, currentFeeUSD: 100 }],
      engineSpend: {
        currentBase: 5_000,
        projectedBase: 5_000,
        currentNative: 5_000,
        projectedNative: 5_000,
        cycle: {
          termStart: '2022-04-19',
          termEnd: '2023-04-18',
          cancelBy: '2023-02-17',
        },
        activeInWindow: true,
      },
    });

  it('prefers the stamped cycle over the recorded term arrays', () => {
    const row = buildContractTableRow(historical());

    expect(row.termStartDate).toBe('2022-04-19');
    expect(row.termEndDate).toBe('2023-04-18');
    expect(row.cancelByDate).toBe('2023-02-17');
  });

  it('shows no cancel-by for a cycle without an offset, even with a recorded cancel date', () => {
    // A recorded cancel_date belongs to the CURRENT recorded term; against a
    // historical cycle only the dynamic offset derivation is truthful.
    const contract = historical();
    contract.contract.cancel_date = [{ date: '2025-11-01' }];
    contract.engineSpend = {
      ...contract.engineSpend!,
      cycle: {
        termStart: '2022-04-19',
        termEnd: '2023-04-18',
        cancelBy: null,
      },
    };

    const row = buildContractTableRow(contract);

    expect(row.termStartDate).toBe('2022-04-19');
    expect(row.cancelByDate).toBeNull();
  });

  it('keeps recorded reads when stamps carry no cycle (default views)', () => {
    const contract = historical();
    contract.engineSpend = {
      currentBase: 5_000,
      projectedBase: 5_000,
      currentNative: 5_000,
      projectedNative: 5_000,
    };

    const row = buildContractTableRow(contract);

    expect(row.termStartDate).toBe('2025-01-01');
    expect(row.termEndDate).toBe('2025-12-31');
    expect(row.cancelByDate).toBeNull();
  });
});

describe('buildProductSubRows — engine product stamps (QA 2026-08-04)', () => {
  const base = {
    vendorId: 1,
    vendorName: 'Vendor',
    priceHistoryTcv: 110,
    priceHistoryCurrent: 110,
    priceHistoryProjected: 110,
  };
  const products = [
    { product_id: 1, name: 'Seats', fees: 60, currentFeeUSD: 60 },
    { product_id: 2, name: 'Feed', fees: 50, currentFeeUSD: 50 },
  ];
  const engineSpend = {
    currentBase: 90,
    projectedBase: 95,
    currentNative: 90,
    projectedNative: 95,
    products: {
      1: { currentNative: 40, projectedNative: 42 },
      2: { currentNative: 50, projectedNative: 53 },
    },
  };

  function subRowsOf(contract: ContractWithPricing): ProductSubRow[] {
    const rows = buildContractTableRows([contract]);
    const subRows = (rows[0] as ContractTableRow).subRows ?? [];
    return subRows.filter(
      (r): r is ProductSubRow => 'isProductRow' in r && r.isProductRow === true,
    );
  }

  it("sub-rows read the stamped per-product values, not today's fee", () => {
    const subRows = subRowsOf(
      makeContract({ ...base, id: 1, products, engineSpend }),
    );
    expect(subRows).toHaveLength(2);
    const seats = subRows.find((r) => r.vendor_products.id === 1);
    expect(seats?.fees).toBe(40);
    expect(seats?.currentBudget).toBe(40);
    expect(seats?.compoundedFees).toBe(42);
    expect(seats?.projectedBudget).toBe(42);
  });

  it('a product absent from the stamps shows zero, not its recorded fee', () => {
    const partial = {
      ...engineSpend,
      products: { 1: { currentNative: 40, projectedNative: 42 } },
    };
    const subRows = subRowsOf(
      makeContract({ ...base, id: 2, products, engineSpend: partial }),
    );
    const feed = subRows.find((r) => r.vendor_products.id === 2);
    expect(feed?.fees).toBe(0);
    expect(feed?.projectedBudget).toBe(0);
  });

  it('a superseded product without engine values keeps its recorded fee for the struck-through display', () => {
    const withSuperseded = [
      products[0],
      { ...products[1], isSuperseded: true },
    ];
    const partial = {
      ...engineSpend,
      products: { 1: { currentNative: 40, projectedNative: 42 } },
    };
    const subRows = subRowsOf(
      makeContract({
        ...base,
        id: 3,
        products: withSuperseded,
        engineSpend: partial,
      }),
    );
    const feed = subRows.find((r) => r.vendor_products.id === 2);
    expect(feed?.isSuperseded).toBe(true);
    expect(feed?.fees).toBe(50);
  });

  it('collapses per-year product entries to one row per product', () => {
    // Multi-year deals record a products entry per year; the engine answers
    // per product per window, so duplicated entries must not duplicate rows.
    const perYear = [
      products[0],
      { ...products[0], fees: 66, currentFeeUSD: 66 },
      products[1],
    ];
    const subRows = subRowsOf(
      makeContract({ ...base, id: 5, products: perYear, engineSpend }),
    );
    expect(subRows).toHaveLength(2);
    expect(subRows.filter((r) => r.vendor_products.id === 1)).toHaveLength(1);
  });

  it('falls back to the recorded schedule when stamps lack products (contracts page)', () => {
    const { products: _products, ...withoutProducts } = engineSpend;
    const subRows = subRowsOf(
      makeContract({ ...base, id: 4, products, engineSpend: withoutProducts }),
    );
    const seats = subRows.find((r) => r.vendor_products.id === 1);
    expect(seats?.fees).toBe(60);
  });
});

describe('buildProductSubRows — one-time products (psk-1492 QA follow-up)', () => {
  function subRowsOf(contract: ContractWithPricing): ProductSubRow[] {
    const rows = buildContractTableRows([contract]);
    const subRows = (rows[0] as ContractTableRow).subRows ?? [];
    return subRows.filter(
      (r): r is ProductSubRow => 'isProductRow' in r && r.isProductRow === true,
    );
  }

  it('a one-time product shows zero projected on the legacy fallback path, not its own fee', () => {
    const subRows = subRowsOf(
      makeContract({
        id: 7,
        vendorId: 1,
        vendorName: 'Vendor',
        priceHistoryTcv: 3000,
        priceHistoryCurrent: 3000,
        priceHistoryProjected: 2000,
        products: [
          {
            product_id: 1,
            name: 'Setup',
            fees: 1000,
            currentFeeUSD: 1000,
            oneTimeOnly: true,
          },
          { product_id: 2, name: 'License', fees: 2000, currentFeeUSD: 2000 },
        ],
      }),
    );

    const setup = subRows.find((r) => r.vendor_products.id === 1);
    expect(setup?.currentBudget).toBe(1000);
    expect(setup?.projectedBudget).toBe(0);
    expect(setup?.compoundedFees).toBe(0);

    const license = subRows.find((r) => r.vendor_products.id === 2);
    expect(license?.projectedBudget).toBe(2000);
  });

  it('computeContractBudgetValues excludes one-time products from the multi-product projected sum', () => {
    const contract = makeContract({
      id: 8,
      vendorId: 1,
      vendorName: 'Vendor',
      priceHistoryTcv: 3000,
      priceHistoryCurrent: 3000,
      priceHistoryProjected: 2000,
      products: [
        {
          product_id: 1,
          name: 'Setup',
          fees: 1000,
          currentFeeUSD: 1000,
          oneTimeOnly: true,
        },
        { product_id: 2, name: 'License', fees: 2000, currentFeeUSD: 2000 },
      ],
    });

    expect(computeContractBudgetValues(contract)).toEqual({
      currentUSD: 3000,
      projectedUSD: 2000,
      tcvUSD: 3000,
    });
  });
});

describe('buildContractTableRow — willNotRenewNextYear', () => {
  const nextFiscalYearStart = getFiscalYearInfo(1).nextFiscalYearStart;
  const endsBeforeNextFy = format(
    subDays(nextFiscalYearStart, 1),
    'yyyy-MM-dd',
  );
  const endsAfterNextFy = format(addDays(nextFiscalYearStart, 1), 'yyyy-MM-dd');

  function rowFor(willNotRenew: boolean, termEnd: string | null) {
    const contract = makeContract({
      id: 900,
      vendorId: 1,
      vendorName: 'Acme',
      priceHistoryTcv: 100,
      priceHistoryCurrent: 100,
      priceHistoryProjected: 100,
      products: [{ product_id: 1, name: 'P1', fees: 100, currentFeeUSD: 100 }],
    });
    contract.contract.will_not_renew = willNotRenew;
    contract.contract.term_end_date = termEnd ? [{ date: termEnd }] : [];

    return buildContractTableRow(contract);
  }

  it('flags a term ending before the next fiscal year starts', () => {
    expect(rowFor(true, endsBeforeNextFy).willNotRenewNextYear).toBe(true);
  });

  it('leaves a term ending after the next fiscal year starts unflagged', () => {
    expect(rowFor(true, endsAfterNextFy).willNotRenewNextYear).toBe(false);
  });

  it('leaves a renewing contract unflagged', () => {
    expect(rowFor(false, endsBeforeNextFy).willNotRenewNextYear).toBe(false);
  });

  it('leaves a contract with no end date unflagged', () => {
    expect(rowFor(true, null).willNotRenewNextYear).toBe(false);
  });
});
