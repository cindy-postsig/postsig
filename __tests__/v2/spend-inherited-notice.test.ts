import type { Contract } from '@/app/lib/budget/types';
import {
  buildParentNoticeDays,
  buildSpendLineageFromEnriched,
  queryCommitments,
  commitmentHorizonEnd,
  EMPTY_LINEAGE,
} from '@/lib/v2/spend';

const ASOF = new Date('2026-07-01T00:00:00Z');
const CONTRACT_TYPE_MSA = 1;
const CONTRACT_TYPE_SERVICE_ORDER = 2;

function contractRow(spec: {
  id: number;
  typeId: number;
  termStart: string;
  termEnd: string;
  cancelByDays?: number | null;
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
    subscription_term: 12,
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
        fees: spec.fees ?? 50000,
        vendor_products: { id: 100 + spec.id, name: `Product ${spec.id}` },
      },
    ],
    vendors: { name: 'Test Vendor' },
  } as unknown as Contract;
}

function enrich(contract: Contract) {
  return {
    id: contract.id as number,
    contract,
    products: [],
    isLinkedChildInvoice: false,
  };
}

const msa = contractRow({
  id: 1,
  typeId: CONTRACT_TYPE_MSA,
  termStart: '2024-01-01',
  termEnd: '2030-12-31',
  cancelByDays: 60,
});
const serviceOrder = contractRow({
  id: 2,
  typeId: CONTRACT_TYPE_SERVICE_ORDER,
  termStart: '2026-01-01',
  termEnd: '2026-12-31',
  cancelByDays: null,
});
const rels = [{ parent_contract_id: 1, child_contract_id: 2 }];

describe('buildParentNoticeDays', () => {
  it('carries the MSA notice period to a service order with none of its own', () => {
    const map = buildParentNoticeDays(
      [enrich(msa), enrich(serviceOrder)],
      rels,
    );
    expect(map.get(2)).toBe(60);
  });

  it('does not override a service order that records its own notice period', () => {
    const withOwn = contractRow({
      id: 2,
      typeId: CONTRACT_TYPE_SERVICE_ORDER,
      termStart: '2026-01-01',
      termEnd: '2026-12-31',
      cancelByDays: 30,
    });
    const map = buildParentNoticeDays([enrich(msa), enrich(withOwn)], rels);
    expect(map.has(2)).toBe(false);
  });

  it('ignores a parent that is not an MSA', () => {
    const nonMsaParent = contractRow({
      id: 1,
      typeId: CONTRACT_TYPE_SERVICE_ORDER,
      termStart: '2024-01-01',
      termEnd: '2030-12-31',
      cancelByDays: 60,
    });
    const map = buildParentNoticeDays(
      [enrich(nonMsaParent), enrich(serviceOrder)],
      rels,
    );
    expect(map.has(2)).toBe(false);
  });

  // The relationship fetch issues no ORDER BY, so two MSAs granting different
  // notice periods must not resolve differently from one request to the next.
  it('resolves the same notice period whatever order the edges arrive in', () => {
    const otherMsa = contractRow({
      id: 3,
      typeId: CONTRACT_TYPE_MSA,
      termStart: '2024-01-01',
      termEnd: '2030-12-31',
      cancelByDays: 90,
    });
    const enriched = [enrich(msa), enrich(otherMsa), enrich(serviceOrder)];
    const edges = [
      { parent_contract_id: 1, child_contract_id: 2 },
      { parent_contract_id: 3, child_contract_id: 2 },
    ];

    const forward = buildParentNoticeDays(enriched, edges);
    const reversed = buildParentNoticeDays(enriched, [...edges].reverse());

    expect(forward.get(2)).toBe(60);
    expect(reversed.get(2)).toBe(forward.get(2));
  });
});

describe('commitment recognition with an inherited notice period', () => {
  const query = {
    window: 'currentFY' as const,
    granularity: 'month' as const,
    groupBy: 'contract' as const,
    currency: { mode: 'preconverted-usd' } as const,
    fiscalConfig: { startMonth: 1 },
    asOf: ASOF,
  };

  it('recognizes the renewal 60 days before term end, not at term start', () => {
    const lineage = buildSpendLineageFromEnriched(
      [enrich(msa), enrich(serviceOrder)],
      rels,
    );
    const withInheritance = queryCommitments([serviceOrder], query, lineage);
    const withoutInheritance = queryCommitments(
      [serviceOrder],
      query,
      EMPTY_LINEAGE,
    );

    const renewalPeriod = (result: typeof withInheritance) =>
      result.items.find((item) => item.kind === 'renewal')?.period;

    // Term rolls 2027-01-01; recognition lands 61 days earlier, in November.
    expect(renewalPeriod(withInheritance)).toBe('2026-11');
    // Without the inherited period there is no decision window, so the event
    // sits on the new term's start — 2027-01-01, outside FY2026 entirely.
    expect(renewalPeriod(withoutInheritance)).toBeUndefined();
  });

  it('pads the projection horizon by the inherited notice period', () => {
    const lineage = buildSpendLineageFromEnriched(
      [enrich(msa), enrich(serviceOrder)],
      rels,
    );
    const windowEnd = new Date('2027-01-01T00:00:00Z');

    expect(
      commitmentHorizonEnd(serviceOrder, windowEnd, lineage).toISOString(),
    ).toBe('2027-03-03T00:00:00.000Z');
    expect(commitmentHorizonEnd(serviceOrder, windowEnd).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });
});
