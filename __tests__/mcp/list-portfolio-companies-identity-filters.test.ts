import { describe, expect, it } from '@jest/globals';
import {
  matchesIdentityFilters,
  buildFieldCoverage,
  type ListPortfolioCompaniesInput,
} from '@/app/lib/mcp/tools/investor/companies';
import type { InvCompany } from '@/lib/v2/inv';

function buildInput(
  overrides: Partial<ListPortfolioCompaniesInput> = {},
): ListPortfolioCompaniesInput {
  return {
    limit: 50,
    ...overrides,
  } as ListPortfolioCompaniesInput;
}

function buildCompany(overrides: Partial<InvCompany> = {}): InvCompany {
  return {
    id: 1,
    publicId: 'pub-1',
    organizationId: 'org-1',
    companyId: 1,
    status: 'active',
    sector: null,
    tags: null,
    notes: null,
    investmentThesis: null,
    contactPerson: null,
    contactEmail: null,
    externalId: null,
    metadata: {},
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    name: 'Acme Inc',
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
    ...overrides,
  };
}

describe('matchesIdentityFilters', () => {
  it('matches everything when no identity filters are set', () => {
    expect(matchesIdentityFilters(buildCompany(), buildInput())).toBe(true);
    expect(matchesIdentityFilters(undefined, buildInput())).toBe(true);
  });

  it('matches industry as a case-insensitive substring', () => {
    const company = buildCompany({ industry: 'FinTech Software' });
    expect(
      matchesIdentityFilters(company, buildInput({ industry: 'fintech' })),
    ).toBe(true);
    expect(
      matchesIdentityFilters(company, buildInput({ industry: 'biotech' })),
    ).toBe(false);
  });

  it('matches domain and headquarters as case-insensitive substrings', () => {
    const company = buildCompany({
      domain: 'Acme.com',
      headquarters: 'San Francisco, CA',
    });
    expect(
      matchesIdentityFilters(company, buildInput({ domain: 'acme' })),
    ).toBe(true);
    expect(
      matchesIdentityFilters(company, buildInput({ domain: 'other' })),
    ).toBe(false);
    expect(
      matchesIdentityFilters(
        company,
        buildInput({ headquarters: 'san francisco' }),
      ),
    ).toBe(true);
  });

  it('matches sector as a case-insensitive substring', () => {
    const company = buildCompany({ sector: 'Enterprise SaaS' });
    expect(
      matchesIdentityFilters(company, buildInput({ sector: 'saas' })),
    ).toBe(true);
    expect(
      matchesIdentityFilters(company, buildInput({ sector: 'hardware' })),
    ).toBe(false);
  });

  it('matches founded_year exactly', () => {
    const company = buildCompany({ foundedYear: 2019 });
    expect(
      matchesIdentityFilters(company, buildInput({ founded_year: 2019 })),
    ).toBe(true);
    expect(
      matchesIdentityFilters(company, buildInput({ founded_year: 2020 })),
    ).toBe(false);
  });

  it('matches entity_type as a case-insensitive exact match', () => {
    const company = buildCompany({ entityType: 'Corporation' });
    expect(
      matchesIdentityFilters(
        company,
        buildInput({ entity_type: 'corporation' }),
      ),
    ).toBe(true);
    expect(
      matchesIdentityFilters(company, buildInput({ entity_type: 'llc' })),
    ).toBe(false);
    // Not a substring match — "Corp" alone must not match "Corporation".
    expect(
      matchesIdentityFilters(company, buildInput({ entity_type: 'Corp' })),
    ).toBe(false);
  });

  it('does not match an unpopulated field against an active filter', () => {
    const company = buildCompany({ industry: null });
    expect(
      matchesIdentityFilters(company, buildInput({ industry: 'fintech' })),
    ).toBe(false);
  });

  it('does not match a company missing from the identity map when a filter is active', () => {
    expect(
      matchesIdentityFilters(undefined, buildInput({ industry: 'fintech' })),
    ).toBe(false);
  });

  it('requires every active filter to match (AND semantics)', () => {
    const company = buildCompany({ industry: 'Fintech', sector: 'Payments' });
    expect(
      matchesIdentityFilters(
        company,
        buildInput({ industry: 'fintech', sector: 'payments' }),
      ),
    ).toBe(true);
    expect(
      matchesIdentityFilters(
        company,
        buildInput({ industry: 'fintech', sector: 'hardware' }),
      ),
    ).toBe(false);
  });
});

describe('buildFieldCoverage', () => {
  it('returns nothing when no identity filter is active', () => {
    const candidates = [buildCompany(), buildCompany({ industry: 'Fintech' })];
    expect(buildFieldCoverage(buildInput(), candidates)).toEqual({});
  });

  it('reports populated/total counts only for the fields actually filtered on', () => {
    const candidates = [
      buildCompany({ industry: 'Fintech' }),
      buildCompany({ industry: null }),
      buildCompany({ industry: 'Biotech' }),
    ];
    const coverage = buildFieldCoverage(
      buildInput({ industry: 'fintech' }),
      candidates,
    );
    expect(coverage).toEqual({
      industry: { populatedCount: 2, totalCount: 3 },
    });
  });

  it('computes coverage independently per active field, including founded_year/entity_type key mapping', () => {
    const candidates = [
      buildCompany({ foundedYear: 2019, entityType: 'Corporation' }),
      buildCompany({ foundedYear: null, entityType: null }),
    ];
    const coverage = buildFieldCoverage(
      buildInput({ founded_year: 2019, entity_type: 'Corporation' }),
      candidates,
    );
    expect(coverage).toEqual({
      founded_year: { populatedCount: 1, totalCount: 2 },
      entity_type: { populatedCount: 1, totalCount: 2 },
    });
  });

  it('reports zero populated when every candidate is missing the field', () => {
    const candidates = [
      buildCompany({ sector: null }),
      buildCompany({ sector: null }),
    ];
    const coverage = buildFieldCoverage(
      buildInput({ sector: 'saas' }),
      candidates,
    );
    expect(coverage).toEqual({
      sector: { populatedCount: 0, totalCount: 2 },
    });
  });
});
