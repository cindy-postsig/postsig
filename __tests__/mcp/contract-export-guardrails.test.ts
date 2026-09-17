import { describe, expect, it } from '@jest/globals';
import {
  toListRow,
  getContractInputSchema,
  DEFAULT_CONTRACT_SECTIONS,
} from '@/app/lib/mcp/tools/cpm/contracts';
import {
  getLegalTermsInputSchema,
  DEFAULT_LEGAL_SECTIONS,
} from '@/app/lib/mcp/tools/investor/companies';

function buildSummary() {
  return {
    id: 1,
    vendor: { id: 10, name: 'MSCI', domain: 'msci.com' },
    status: 'active',
    contractType: 'Master Services Agreement',
    contractTypeAbbreviation: 'MSA',
    orderNumber: null,
    termStart: '2025-10-01',
    termEnd: '2026-09-30',
    cancelByDate: '2026-07-01',
    uploadedAt: '2025-01-01',
    currency: 'USD',
    totalContractValueBase: 1_000_000,
    currentAnnualSpendBase: 652_250,
    projectedAnnualSpendBase: 704_430,
    projectedAnnualSpendDeltaBase: 52_180,
    annualIncrease: 0.08,
    discount: 0.1,
    priceEscalatorReason: 'both' as const,
    businessGroup: 'Research',
    businessSponsor: null,
    products: ['ESG Ratings'],
    assetClasses: ['ESG'],
    tags: [{ id: 1, name: 'critical' }],
    renewalType: 'Auto',
    renewalPeriod: 12,
    autoRenewal: true,
    willNotRenew: false,
    multiYear: false,
    docFullyExecuted: true,
    isSuperseded: false,
    isSuperseding: false,
    isLinkedChildInvoice: false,
  };
}

describe('toListRow', () => {
  it('strips the detailed financial figures from list/query rows', () => {
    const row = toListRow(buildSummary());
    expect(row).not.toHaveProperty('projectedAnnualSpendBase');
    expect(row).not.toHaveProperty('projectedAnnualSpendDeltaBase');
    expect(row).not.toHaveProperty('annualIncrease');
    expect(row).not.toHaveProperty('discount');
  });

  it('preserves the fields sorting and escalator filters depend on', () => {
    const row = toListRow(buildSummary());
    expect(row.currentAnnualSpendBase).toBe(652_250);
    expect(row.priceEscalatorReason).toBe('both');
    expect(row.id).toBe(1);
    expect(row.termEnd).toBe('2026-09-30');
    expect(row.vendor).toEqual({ id: 10, name: 'MSCI', domain: 'msci.com' });
  });
});

describe('get_contract include schema', () => {
  it('falls back to summary + dates when include is omitted', () => {
    const parsed = getContractInputSchema.parse({ id: 1 });
    // Mirrors the handler: const requested = input.include ?? DEFAULT_CONTRACT_SECTIONS
    const requested = parsed.include ?? DEFAULT_CONTRACT_SECTIONS;
    expect(requested).toEqual(['summary', 'dates']);
  });

  it('accepts up to 4 sections', () => {
    expect(() =>
      getContractInputSchema.parse({
        id: 1,
        include: ['summary', 'dates', 'renewal', 'commercial'],
      }),
    ).not.toThrow();
  });

  it('rejects more than 4 sections', () => {
    expect(() =>
      getContractInputSchema.parse({
        id: 1,
        include: ['summary', 'dates', 'renewal', 'commercial', 'legal'],
      }),
    ).toThrow();
  });
});

describe('get_company_legal_terms include schema', () => {
  it('falls back to the header/economic/other subset when include is omitted', () => {
    const parsed = getLegalTermsInputSchema.parse({ public_id: 'abc' });
    // Mirrors the handler: const requested = input.include ?? DEFAULT_LEGAL_SECTIONS
    const requested = parsed.include ?? DEFAULT_LEGAL_SECTIONS;
    expect(requested).toEqual(['header_status', 'economic_rights', 'other']);
  });

  it('accepts up to 3 sections', () => {
    expect(() =>
      getLegalTermsInputSchema.parse({
        public_id: 'abc',
        include: ['header_status', 'economic_rights', 'other'],
      }),
    ).not.toThrow();
  });

  it('rejects more than 3 sections', () => {
    expect(() =>
      getLegalTermsInputSchema.parse({
        public_id: 'abc',
        include: ['header_status', 'economic_rights', 'other', 'qsbs'],
      }),
    ).toThrow();
  });
});
