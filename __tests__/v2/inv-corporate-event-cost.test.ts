import { computePortfolioMetrics } from '@/lib/v2/inv/metrics';
import { transformInvToPortfolioCompany } from '@/lib/v2/inv/transforms';
import type {
  InvCompany,
  InvCompanyValuation,
  InvInvestorStatusResult,
} from '@/lib/v2/inv/types';

/**
 * The valuation view applies corporate events to aggregate_cost before the
 * TypeScript layer sees it. These tests pin that the transform and the
 * portfolio rollup take cost from the view as reported and never re-derive it
 * from the ma_* columns, so a predecessor excluded by the view counts once.
 */

function makeCompany(id: number, name: string): InvCompany {
  return {
    id,
    publicId: `company-${id}`,
    organizationId: 'org-1',
    companyId: 100 + id,
    status: 'active',
    sector: null,
    tags: [],
    notes: null,
    investmentThesis: null,
    contactPerson: null,
    contactEmail: null,
    externalId: null,
    metadata: {},
    createdAt: '2023-01-01',
    updatedAt: '2024-01-01',
    name,
    nameOverride: null,
    domain: null,
    industry: null,
    headquarters: null,
    description: null,
    foundedYear: null,
    legalName: null,
    legalJurisdiction: null,
    entityType: null,
    stageCode: null,
    stageDisplayName: null,
    entryStageCode: null,
    entryStageDisplayName: null,
  };
}

function makeValuation(
  companyId: number,
  overrides: Partial<InvCompanyValuation>,
): InvCompanyValuation {
  return {
    companyId,
    globalCompanyId: 100 + companyId,
    organizationId: 'org-1',
    companyName: null,
    companyDomain: null,
    sector: null,
    industry: null,
    headquarters: null,
    status: 'active',
    myFmv: null,
    multiple: null,
    aggregateCost: null,
    realizedProceeds: null,
    ownershipPct: null,
    myFdPct: null,
    myUnits: null,
    postMoneyValuation: null,
    currentPriceUnit: null,
    fullyDilutedTotal: null,
    totalEquityFinancing: null,
    lastTransactionDate: null,
    snapshotDate: null,
    entryDate: null,
    entryAmount: null,
    entryStageCode: null,
    entryStageDisplayName: null,
    currentStageCode: null,
    currentStageDisplayName: null,
    fundIds: null,
    fundNames: null,
    fundShortNames: null,
    primaryFundName: null,
    primaryFundShortName: null,
    maExcludedShare: null,
    maCarriedCost: null,
    maEventDate: null,
    ...overrides,
  };
}

const investorStatus: InvInvestorStatusResult = {
  hasBoardSeat: false,
  isMajorInvestor: false,
  hasProRataRights: false,
  hasInformationRights: false,
};

function toPortfolioCompany(
  company: InvCompany,
  valuation: InvCompanyValuation,
) {
  return transformInvToPortfolioCompany(
    company,
    valuation,
    [],
    [],
    investorStatus,
  );
}

describe('corporate events and company cost', () => {
  it('reports zero cost and no MOIC for a predecessor the view excluded', () => {
    const predecessor = toPortfolioCompany(
      makeCompany(1, 'Predecessor'),
      makeValuation(1, {
        aggregateCost: 0,
        myFmv: 0,
        maExcludedShare: 1,
        maEventDate: '2025-05-16',
      }),
    );

    expect(predecessor.investmentStatus).toBe('Active');
    expect(predecessor.myAggregateCost).toBe(0);
    expect(predecessor.moic).toBeNull();
    expect(predecessor.multiple).toBe(0);
  });

  it('keeps a partially excluded predecessor at the cost the view reports', () => {
    const parent = toPortfolioCompany(
      makeCompany(2, 'Parent'),
      makeValuation(2, {
        aggregateCost: 60,
        myFmv: 90,
        maExcludedShare: 0.4,
      }),
    );

    expect(parent.myAggregateCost).toBe(60);
    expect(parent.moic).toBeCloseTo(1.5);
  });

  it('takes a successor cost that includes carried cost as reported', () => {
    const successor = toPortfolioCompany(
      makeCompany(3, 'Successor'),
      makeValuation(3, {
        aggregateCost: 150,
        myFmv: 300,
        maCarriedCost: 100,
      }),
    );

    expect(successor.myAggregateCost).toBe(150);
    expect(successor.moic).toBeCloseTo(2);
  });

  it('counts the merged position once in the portfolio rollup', () => {
    const predecessor = toPortfolioCompany(
      makeCompany(1, 'Predecessor'),
      makeValuation(1, { aggregateCost: 0, myFmv: 0, maExcludedShare: 1 }),
    );
    const successor = toPortfolioCompany(
      makeCompany(2, 'Successor'),
      makeValuation(2, { aggregateCost: 100, myFmv: 140 }),
    );
    const untouched = toPortfolioCompany(
      makeCompany(3, 'Other'),
      makeValuation(3, { aggregateCost: 50, myFmv: 50 }),
    );

    const metrics = computePortfolioMetrics(
      [predecessor, successor, untouched],
      [],
      new Date('2026-01-01'),
    );

    expect(metrics.totalInvested).toBe(150);
    expect(metrics.totalFMV).toBe(190);
    expect(metrics.tvpi).toBeCloseTo(190 / 150);
    expect(metrics.companyCount).toBe(3);
  });
});
