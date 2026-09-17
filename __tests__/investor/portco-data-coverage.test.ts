import {
  INV_DATA_COVERAGE_LABELS,
  hasInvTransactionData,
  invDataCoverageLabel,
  resolveInvDataCoverage,
} from '@/lib/v2/inv/data-coverage';
import { transformInvToPortfolioCompany } from '@/lib/v2/inv/transforms';
import type {
  InvCompany,
  InvCompanyValuation,
  InvInvestorStatusResult,
  InvTransaction,
} from '@/lib/v2/inv/types';

const company: InvCompany = {
  id: 1,
  publicId: 'company-1',
  organizationId: 'org-1',
  companyId: 100,
  status: 'active',
  sector: null,
  tags: null,
  notes: null,
  investmentThesis: null,
  contactPerson: null,
  contactEmail: null,
  externalId: null,
  metadata: {},
  createdAt: '2023-01-01',
  updatedAt: '2024-01-01',
  name: 'KpiCo',
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

const valuation = (
  overrides: Partial<InvCompanyValuation> = {},
): InvCompanyValuation => ({
  companyId: 1,
  globalCompanyId: 100,
  organizationId: 'org-1',
  companyName: 'KpiCo',
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
});

const investorStatus: InvInvestorStatusResult = {
  hasBoardSeat: false,
  isMajorInvestor: false,
  hasProRataRights: false,
  hasInformationRights: false,
};

const transaction = (id: number): InvTransaction => ({
  id,
  publicId: `tx-${id}`,
  companyId: 1,
  fundId: 7,
  securityId: 1,
  financingRoundId: null,
  organizationId: 'org-1',
  transactionType: 'purchase',
  transactionDate: '2023-06-15',
  settlementDate: null,
  units: 1000,
  amount: -100000,
  currency: 'USD',
  counterpartyName: null,
  signatory: null,
  notes: null,
  externalId: null,
  metadata: {},
});

describe('hasInvTransactionData', () => {
  it('is true when transactions are loaded', () => {
    expect(hasInvTransactionData({ transactionCount: 3, fundIds: null })).toBe(
      true,
    );
  });

  it('is true on the list view, where fundIds is the only signal', () => {
    expect(hasInvTransactionData({ transactionCount: 0, fundIds: [7] })).toBe(
      true,
    );
  });

  it('is false with neither transactions nor funds', () => {
    expect(hasInvTransactionData({ transactionCount: 0, fundIds: null })).toBe(
      false,
    );
  });

  it('treats an empty fundIds array as no transaction data', () => {
    expect(hasInvTransactionData({ transactionCount: 0, fundIds: [] })).toBe(
      false,
    );
  });
});

describe('resolveInvDataCoverage', () => {
  it('is transaction-backed whenever transaction data exists', () => {
    expect(
      resolveInvDataCoverage({ hasTransactionData: true, hasKpiData: false }),
    ).toBe('transactions');
  });

  it('is KPI-only when KPI data exists without transactions', () => {
    expect(
      resolveInvDataCoverage({ hasTransactionData: false, hasKpiData: true }),
    ).toBe('kpi_only');
  });

  it('is none for a portco with neither -- an unanswered reporting request is not KPI data', () => {
    expect(
      resolveInvDataCoverage({ hasTransactionData: false, hasKpiData: false }),
    ).toBe('none');
  });

  it('does not guess KPI data on surfaces that never ran the lookup', () => {
    expect(resolveInvDataCoverage({ hasTransactionData: false })).toBe('none');
  });

  it('labels each state', () => {
    expect(invDataCoverageLabel({ hasTransactionData: true })).toBe(
      INV_DATA_COVERAGE_LABELS.transactions,
    );
    expect(
      invDataCoverageLabel({ hasTransactionData: false, hasKpiData: true }),
    ).toBe(INV_DATA_COVERAGE_LABELS.kpi_only);
    expect(invDataCoverageLabel({ hasTransactionData: false })).toBe(
      INV_DATA_COVERAGE_LABELS.none,
    );
  });
});

describe('transformInvToPortfolioCompany data coverage', () => {
  it('marks a portco as having no transaction data when it has no funds', () => {
    const result = transformInvToPortfolioCompany(
      company,
      valuation(),
      [],
      [],
      investorStatus,
    );

    expect(result.hasTransactionData).toBe(false);
  });

  // aggregateCost and lastTransactionDate stay null here, as they do for a
  // fully-exited position that v_inv_position drops: fundIds alone must carry.
  it('marks a portco transaction-backed from the valuation fundIds', () => {
    const result = transformInvToPortfolioCompany(
      company,
      valuation({ fundIds: [7], fundNames: ['Fund I'] }),
      [],
      [],
      investorStatus,
    );

    expect(result.hasTransactionData).toBe(true);
  });

  it('marks a portco transaction-backed from loaded transactions', () => {
    const result = transformInvToPortfolioCompany(
      company,
      valuation(),
      [transaction(1)],
      [],
      investorStatus,
    );

    expect(result.hasTransactionData).toBe(true);
  });
});
