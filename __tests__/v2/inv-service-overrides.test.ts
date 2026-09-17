// __tests__/v2/inv-service-overrides.test.ts
//
// Wiring tests: the inv service functions merge active value overrides
// BEFORE mapping/metric computation and surface the lineage metadata on
// their results. The merge math itself is covered in
// inv-overrides-merge-valuation.test.ts.

import {
  getInvCapTableSnapshot,
  getInvCompany,
  getInvCompanyValuation,
  getInvLegalTerms,
  getInvPortfolioCompany,
  getInvTransactions,
} from '@/lib/v2/inv/service';
import type { ValueOverrideRow } from '@/lib/v2/inv/overrides/applyOverrides';
import { getActiveValueOverrides } from '@/lib/v2/inv/overrides/fetchOverrides';
import { getUserMetadata } from '@/data/users';
import { createClient as createServerClient } from '@/utils/supabase/server';

jest.mock('@/data/users', () => ({ getUserMetadata: jest.fn() }));
jest.mock('@/lib/v2/inv/overrides/fetchOverrides', () => ({
  getActiveValueOverrides: jest.fn(),
}));
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/supabase/service_server', () => ({
  createClient: jest.fn(),
}));
jest.mock('@/app/lib/mcp/context', () => ({ getMcpContext: jest.fn() }));
jest.mock('@/lib/v2/companies/enrichment', () => ({
  fetchCompanyEnrichment: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/utils/pino', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const mockGetUserMetadata = getUserMetadata as jest.Mock;
const mockGetActiveValueOverrides = getActiveValueOverrides as jest.Mock;
const mockServerClient = createServerClient as jest.Mock;

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

function ok(data: unknown): QueryResult {
  return { data, error: null };
}

type Builder = Record<string, jest.Mock> & {
  then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => void;
};

function makeBuilder(result: QueryResult): Builder {
  const chainMethods = ['select', 'eq', 'is', 'in', 'order', 'limit', 'not'];
  const builder = {} as Builder;
  for (const method of chainMethods) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.single = jest.fn().mockResolvedValue(result);
  builder.maybeSingle = jest.fn().mockResolvedValue(result);
  builder.then = (resolve, reject) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

/** Supabase client mock dispatching queued results per table. */
function makeClient(queues: Record<string, QueryResult[]>) {
  const from = jest.fn((table: string) => {
    const queue = queues[table];
    if (!queue || queue.length === 0) {
      throw new Error('Unexpected query on ' + table);
    }
    return makeBuilder(queue.shift()!);
  });
  return { from };
}

let overrideId = 0;
function makeOverride(partial: Partial<ValueOverrideRow>): ValueOverrideRow {
  overrideId += 1;
  return {
    id: `ov-${overrideId}`,
    organization_id: 'org-1',
    entity_type: 'inv_transaction',
    entity_id: 1,
    field_key: 'amount',
    original_value: null,
    override_value: 0,
    reason: 'correction',
    created_by: 'user-1',
    created_at: '2026-06-01T00:00:00Z',
    reverted_at: null,
    reverted_by: null,
    ...partial,
  };
}

/** An inv_round_terms row with every status flag off unless overridden. */
function roundTermsRow(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    financing_round_id: 500,
    organization_id: 'org-1',
    effective_date: '2025-01-01',
    superseded_date: null,
    option_pool_percent: null,
    pre_money_fd_shares: null,
    post_money_fd_shares: null,
    major_investor_threshold_amount: null,
    major_investor_threshold_shares: null,
    major_investor_threshold_ownership_pct: null,
    named_major_investors: null,
    pro_rata_rights_all: false,
    pro_rata_rights_major: false,
    standard_pro_rata_formulation: false,
    qsbs_rep_made: false,
    qsbs_covenant_given: false,
    pay_to_play: false,
    drag_along: false,
    rofr_cosale: false,
    investors_subject_to_rofr: false,
    redemption_rights: false,
    registration_rights_preferred: false,
    do_insurance: false,
    founder_vesting_applied: false,
    employee_vesting_protocol: false,
    milestone_closings: false,
    subsequent_closing_window_days: null,
    required_closing_payments: false,
    issuer_pays_investor_counsel: false,
    investor_counsel_fee_cap: null,
    raw_terms: {},
    ...overrides,
  };
}

function viewRow(companyId: number) {
  return {
    company_id: companyId,
    global_company_id: 70,
    organization_id: 'org-1',
    company_name: 'Acme',
    company_domain: null,
    sector: null,
    industry: null,
    headquarters: null,
    status: 'active',
    my_fmv: 1_000_000,
    multiple: 1,
    aggregate_cost: 1_000_000,
    realized_proceeds: 250_000,
    ownership_pct: 0.1,
    my_fd_pct: 0.1,
    my_units: 200_000,
    post_money_valuation: 10_000_000,
    current_price_unit: 5,
    fully_diluted_total: 2_000_000,
    total_equity_financing: null,
    last_transaction_date: '2025-06-01',
    snapshot_date: '2025-05-01',
  };
}

const SNAPSHOT_FOR_OVERRIDES = {
  id: 10,
  implied_valuation: 10_000_000,
  share_price: 5,
  our_fd_ownership_percent: 0.1,
  our_total_shares: 200_000,
};

function positionTxRow(
  id: number,
  transactionDate: string,
  units: number,
  amount: number,
) {
  return {
    id,
    fund_id: 1,
    security_id: 1,
    currency: 'USD',
    transaction_type: 'purchase',
    transaction_date: transactionDate,
    units,
    amount,
  };
}

const RAW_TX_ROW = {
  id: 21,
  public_id: 'tx-21',
  company_id: 9104,
  fund_id: null,
  security_id: null,
  financing_round_id: null,
  organization_id: 'org-1',
  transaction_type: 'purchase',
  transaction_date: '2024-01-15',
  settlement_date: null,
  units: 100,
  amount: -400_000,
  currency: 'USD',
  counterparty_name: null,
  signatory: null,
  notes: null,
  external_id: null,
  metadata: {},
  inv_financing_round: null,
  inv_fund: null,
  inv_security: null,
};

function capTableSnapshotRow(id: number, companyId: number) {
  return {
    id,
    company_id: companyId,
    organization_id: 'org-1',
    snapshot_date: '2025-05-01',
    snapshot_type_id: null,
    financing_round_id: null,
    fully_diluted_total: 2_000_000,
    total_outstanding: null,
    implied_valuation: 10_000_000,
    share_price: 5,
    common_authorized: null,
    common_outstanding: null,
    preferred_authorized: null,
    preferred_outstanding: null,
    option_pool_authorized: null,
    option_pool_outstanding: null,
    option_pool_available: null,
    option_pool_fd_percent: null,
    our_total_shares: 200_000,
    our_common_shares: null,
    our_preferred_shares: null,
    our_preferred_pct: null,
    our_ownership_percent: null,
    our_fd_ownership_percent: 0.1,
    our_voting_pct: null,
    cap_table_detail: null,
    inv_financing_round: null,
    inv_snapshot_types: null,
  };
}

const SNAPSHOT_DATES = [{ snapshot_date: '2025-05-01' }];

function companyRow(id: number) {
  return {
    id,
    public_id: `pub-${id}`,
    organization_id: 'org-1',
    company_id: 70,
    status: 'active',
    sector: null,
    tags: null,
    notes: null,
    investment_thesis: null,
    contact_person: null,
    contact_email: null,
    external_id: null,
    metadata: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    name_override: null,
    inv_companies: {
      name: 'Acme',
      domain: null,
      industry: null,
      headquarters: null,
      description: null,
      founded_year: null,
      legal_name: null,
      legal_jurisdiction: null,
      entity_type: null,
    },
    stage: null,
    entry_stage: null,
  };
}

// NOTE: each test uses a distinct companyId AND organizationId — the service
// functions and the override→company mapping are wrapped in React cache()
// and would otherwise return memoized results across tests.
describe('inv service value-override wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-1' });
    mockGetActiveValueOverrides.mockResolvedValue([]);
  });

  it('getInvCompanyValuation recomputes view metrics under a snapshot override', async () => {
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-9101' });
    const client = makeClient({
      v_inv_company_valuation: [ok(viewRow(9101))],
      // first hit maps override entity ids → affected companies, second
      // fetches the snapshot for the recompute
      inv_cap_table_snapshot: [
        ok([{ company_id: 9101 }]),
        ok(SNAPSHOT_FOR_OVERRIDES),
      ],
    });
    mockServerClient.mockResolvedValue(client);
    const override = makeOverride({
      entity_type: 'inv_cap_table_snapshot',
      entity_id: 10,
      field_key: 'implied_valuation',
      override_value: 20_000_000,
    });
    mockGetActiveValueOverrides.mockResolvedValue([override]);

    const { valuation, overridden } = await getInvCompanyValuation(9101);

    expect(valuation.postMoneyValuation).toBe(20_000_000);
    expect(valuation.myFmv).toBe(2_000_000);
    expect(valuation.multiple).toBe(2);
    expect(valuation.aggregateCost).toBe(1_000_000);
    expect(overridden.fields.postMoneyValuation?.overrideValue).toBe(
      20_000_000,
    );
    expect(new Set(overridden.recomputed)).toEqual(
      new Set(['myFmv', 'multiple']),
    );
    // no transaction overrides in the org → no transaction query
    expect(client.from).not.toHaveBeenCalledWith('inv_transaction');
  });

  it('getInvCompanyValuation recomputes aggregates under a transaction override', async () => {
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-9102' });
    const transactions = [
      positionTxRow(1, '2024-01-15', 100_000, -400_000),
      positionTxRow(2, '2025-03-01', 100_000, -600_000),
    ];
    const client = makeClient({
      v_inv_company_valuation: [ok(viewRow(9102))],
      inv_transaction: [ok([{ company_id: 9102 }]), ok(transactions)],
    });
    mockServerClient.mockResolvedValue(client);
    const override = makeOverride({
      entity_id: 2,
      field_key: 'amount',
      override_value: -800_000,
    });
    mockGetActiveValueOverrides.mockResolvedValue([override]);

    const { valuation, overridden } = await getInvCompanyValuation(9102);

    expect(valuation.aggregateCost).toBe(1_200_000);
    expect(valuation.multiple).toBeCloseTo(1_000_000 / 1_200_000, 12);
    expect(overridden.recomputed).toContain('aggregateCost');
    expect(client.from).not.toHaveBeenCalledWith('inv_cap_table_snapshot');
  });

  it('getInvCompanyValuation skips per-company fetches for unaffected companies', async () => {
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-9107' });
    const client = makeClient({
      v_inv_company_valuation: [ok(viewRow(9107))],
      // the override maps to a different company — only the mapping query
      // runs; a second inv_transaction query would throw on the empty queue
      inv_transaction: [ok([{ company_id: 8888 }])],
    });
    mockServerClient.mockResolvedValue(client);
    const override = makeOverride({
      entity_id: 2,
      field_key: 'amount',
      override_value: -800_000,
    });
    mockGetActiveValueOverrides.mockResolvedValue([override]);

    const { valuation, overridden } = await getInvCompanyValuation(9107);

    expect(valuation.aggregateCost).toBe(1_000_000);
    expect(valuation.multiple).toBe(1);
    expect(overridden.fields).toEqual({});
    expect(overridden.recomputed).toEqual([]);
    expect(client.from).toHaveBeenCalledTimes(2);
  });

  it('getInvCompanyValuation falls back to the per-company fetch when the mapping query fails', async () => {
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-9108' });
    const transactions = [
      positionTxRow(1, '2024-01-15', 100_000, -400_000),
      positionTxRow(2, '2025-03-01', 100_000, -600_000),
    ];
    const client = makeClient({
      v_inv_company_valuation: [ok(viewRow(9108))],
      inv_transaction: [
        { data: null, error: { message: 'mapping failed' } },
        ok(transactions),
      ],
    });
    mockServerClient.mockResolvedValue(client);
    const override = makeOverride({
      entity_id: 2,
      field_key: 'amount',
      override_value: -800_000,
    });
    mockGetActiveValueOverrides.mockResolvedValue([override]);

    const { valuation, overridden } = await getInvCompanyValuation(9108);

    expect(valuation.aggregateCost).toBe(1_200_000);
    expect(overridden.recomputed).toContain('aggregateCost');
  });

  it('getInvCompanyValuation chunks the override→company mapping for large orgs', async () => {
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-9109' });
    const transactions = [
      positionTxRow(1, '2024-01-15', 100_000, -400_000),
      positionTxRow(2, '2025-03-01', 100_000, -600_000),
    ];
    const client = makeClient({
      v_inv_company_valuation: [ok(viewRow(9109))],
      // 201 override entity ids → two mapping chunks (200 + 1), whose results
      // must be unioned, then the per-company transactions fetch
      inv_transaction: [
        ok([{ company_id: 8888 }]),
        ok([{ company_id: 9109 }]),
        ok(transactions),
      ],
    });
    mockServerClient.mockResolvedValue(client);
    const overrides = Array.from({ length: 201 }, (_, i) =>
      makeOverride({
        entity_id: i + 1,
        field_key: 'amount',
        override_value: i + 1 === 2 ? -800_000 : -400_000,
      }),
    );
    mockGetActiveValueOverrides.mockResolvedValue(overrides);

    const { valuation } = await getInvCompanyValuation(9109);

    // the affected company came from the SECOND chunk → union, not first-wins
    expect(valuation.aggregateCost).toBe(1_200_000);
    const inCallSizes = client.from.mock.results
      .map((r) => r.value as Builder)
      .flatMap((b) => b.in.mock.calls as [string, number[]][])
      .map(([, ids]) => ids.length);
    expect(inCallSizes).toEqual([200, 1]);
  });

  it('getInvCompanyValuation skips override queries when the org has none', async () => {
    const client = makeClient({
      v_inv_company_valuation: [ok(viewRow(9103))],
    });
    mockServerClient.mockResolvedValue(client);

    const { valuation, overridden } = await getInvCompanyValuation(9103);

    expect(valuation.myFmv).toBe(1_000_000);
    expect(valuation.multiple).toBe(1);
    expect(overridden.fields).toEqual({});
    expect(overridden.recomputed).toEqual([]);
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it('getInvTransactions applies overrides to raw rows before mapping', async () => {
    const client = makeClient({
      inv_transaction: [ok([RAW_TX_ROW])],
    });
    mockServerClient.mockResolvedValue(client);
    const override = makeOverride({
      entity_id: 21,
      field_key: 'amount',
      override_value: -500_000,
    });
    mockGetActiveValueOverrides.mockResolvedValue([override]);

    const { transactions, overridden } = await getInvTransactions(9104);

    expect(transactions[0].amount).toBe(-500_000);
    expect(transactions[0].units).toBe(100);
    expect(overridden[21].amount.overrideValue).toBe(-500_000);
    expect(overridden[21].amount.reason).toBe('correction');
  });

  it('getInvCapTableSnapshot merges overrides before mapping with lineage', async () => {
    const client = makeClient({
      inv_cap_table_snapshot: [
        ok(SNAPSHOT_DATES),
        ok(capTableSnapshotRow(31, 9105)),
      ],
    });
    mockServerClient.mockResolvedValue(client);
    const override = makeOverride({
      entity_type: 'inv_cap_table_snapshot',
      entity_id: 31,
      field_key: 'implied_valuation',
      override_value: 20_000_000,
    });
    mockGetActiveValueOverrides.mockResolvedValue([override]);

    const result = await getInvCapTableSnapshot(9105);

    expect(result.snapshot.impliedValuation).toBe(20_000_000);
    expect(result.snapshot.sharePrice).toBe(5);
    expect(result.availableDates).toEqual(['2025-05-01']);
    expect(result.overridden.implied_valuation.overrideValue).toBe(20_000_000);
  });

  it('getInvCapTableSnapshot returns empty lineage without overrides', async () => {
    const client = makeClient({
      inv_cap_table_snapshot: [
        ok(SNAPSHOT_DATES),
        ok(capTableSnapshotRow(32, 9106)),
      ],
    });
    mockServerClient.mockResolvedValue(client);

    const result = await getInvCapTableSnapshot(9106);

    expect(result.snapshot.impliedValuation).toBe(10_000_000);
    expect(result.overridden).toEqual({});
  });

  // (company_id, snapshot_date) is not unique — a company can hold two
  // snapshots on the same date. The row an edit is written against
  // (overrides.latestSnapshotId) and the row the merge reads must be the same
  // one, or the override is stored and then never displayed.
  it('getInvPortfolioCompany aims edits at the same snapshot the merge reads when two snapshots tie on date', async () => {
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-9115' });
    // Ascending id order, reproducing the DB scan order under
    // idx_inv_cap_snapshot_date when snapshot_date ties.
    const tied = [capTableSnapshotRow(41, 9115), capTableSnapshotRow(42, 9115)];
    const client = makeClient({
      inv_company: [ok(companyRow(9115))],
      v_inv_company_valuation: [ok(viewRow(9115))],
      inv_transaction: [ok([])],
      inv_board_seat: [ok([]), ok([])],
      inv_fund: [ok([])],
      inv_financing_round: [ok([]), ok([]), ok([])],
      inv_information_rights: [ok(null), ok(null)],
      inv_round_terms: [ok([]), ok([])],
      inv_security: [ok([]), ok([])],
      inv_equity_plan_snapshot: [ok([])],
      inv_co_investor: [ok([])],
      v_inv_co_investor_network: [ok([])],
    });
    // Three concurrent branches read inv_cap_table_snapshot and their
    // interleaving isn't fixed, so dispatch on the terminal instead of a
    // queue: the two list reads (override→company mapping,
    // getInvAllCapTableSnapshots) get both tied rows, and the merge's
    // single-row fetch gets the one a real `snapshot_date DESC, id DESC`
    // would return.
    const snapshotBuilders = {
      list: ok(tied),
      single: ok({ ...SNAPSHOT_FOR_OVERRIDES, id: 42 }),
    };
    const baseFrom = client.from;
    client.from = jest.fn((table: string) => {
      if (table !== 'inv_cap_table_snapshot') return baseFrom(table);
      const builder = makeBuilder(snapshotBuilders.list);
      builder.maybeSingle = jest
        .fn()
        .mockResolvedValue(snapshotBuilders.single);
      return builder;
    });
    mockServerClient.mockResolvedValue(client);
    mockGetActiveValueOverrides.mockResolvedValue([
      makeOverride({
        entity_type: 'inv_cap_table_snapshot',
        entity_id: 42,
        field_key: 'implied_valuation',
        override_value: 20_000_000,
      }),
      makeOverride({
        entity_type: 'inv_company',
        entity_id: 9115,
        field_key: 'industry',
        original_value: null,
        override_value: 'Robotics',
        created_at: '2026-06-02T00:00:00Z',
      }),
    ]);

    const result = await getInvPortfolioCompany('pub-9115');

    // The write target: the highest-id row among those tied on the newest date.
    expect(result.overrides.latestSnapshotId).toBe(42);
    // ...and the same row the merge read, so the edit actually displays.
    expect(result.company.postMoneyValuation).toBe(20_000_000);
    expect(
      result.overrides.valuation.fields.postMoneyValuation?.overrideValue,
    ).toBe(20_000_000);
    expect(result.company.industry).toBe('Robotics');
    expect(result.overrides.companyDetails.industry?.overrideValue).toBe(
      'Robotics',
    );
    expect(result.overrides.companyDetails.industry?.createdAt).toBe(
      '2026-06-02T00:00:00Z',
    );
  });

  it('getInvCompany applies every Company Details override onto its mapped property', async () => {
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-9120' });
    const client = makeClient({ inv_company: [ok(companyRow(9120))] });
    mockServerClient.mockResolvedValue(client);
    const overrides = [
      ['industry', 'Robotics'],
      ['domain', 'acme.com'],
      ['sector', 'Industrials'],
      ['headquarters', 'Austin, TX'],
      ['founded_year', 2015],
      ['entity_type', 'Delaware C-Corp'],
      ['legal_jurisdiction', 'Delaware'],
    ] as const;
    mockGetActiveValueOverrides.mockResolvedValue(
      overrides.map(([field_key, override_value]) =>
        makeOverride({
          entity_type: 'inv_company',
          entity_id: 9120,
          field_key,
          override_value,
        }),
      ),
    );

    const { company } = await getInvCompany('pub-9120');

    expect(company.industry).toBe('Robotics');
    expect(company.domain).toBe('acme.com');
    expect(company.sector).toBe('Industrials');
    expect(company.headquarters).toBe('Austin, TX');
    expect(company.foundedYear).toBe(2015);
    expect(company.entityType).toBe('Delaware C-Corp');
    expect(company.legalJurisdiction).toBe('Delaware');
  });

  it('getInvPortfolioCompany surfaces company metadata overrides on the page shape', async () => {
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-9121' });
    const client = makeClient({
      inv_company: [ok(companyRow(9121))],
      v_inv_company_valuation: [ok(viewRow(9121))],
      inv_cap_table_snapshot: [ok(SNAPSHOT_DATES), ok([])],
      inv_transaction: [ok([])],
      inv_board_seat: [ok([]), ok([])],
      inv_fund: [ok([])],
      inv_financing_round: [ok([]), ok([]), ok([])],
      inv_information_rights: [ok(null), ok(null)],
      inv_round_terms: [ok([]), ok([])],
      inv_security: [ok([]), ok([])],
      inv_equity_plan_snapshot: [ok([])],
      inv_co_investor: [ok([])],
      v_inv_co_investor_network: [ok([])],
    });
    mockServerClient.mockResolvedValue(client);
    mockGetActiveValueOverrides.mockResolvedValue([
      makeOverride({
        entity_type: 'inv_company',
        entity_id: 9121,
        field_key: 'founded_year',
        override_value: 2015,
      }),
      makeOverride({
        entity_type: 'inv_company',
        entity_id: 9121,
        field_key: 'entity_type',
        override_value: 'Delaware C-Corp',
      }),
      makeOverride({
        entity_type: 'inv_company',
        entity_id: 9121,
        field_key: 'legal_jurisdiction',
        override_value: 'Delaware',
      }),
      makeOverride({
        entity_type: 'inv_company',
        entity_id: 9121,
        field_key: 'sector',
        override_value: 'Industrials',
      }),
      makeOverride({
        entity_type: 'inv_company',
        entity_id: 9121,
        field_key: 'headquarters',
        override_value: 'Austin, TX',
      }),
    ]);

    const result = await getInvPortfolioCompany('pub-9121');

    expect(result.company.foundedYear).toBe(2015);
    expect(result.company.entityType).toBe('Delaware C-Corp');
    expect(result.company.corporateJurisdiction).toBe('Delaware');
    expect(result.company.sector).toBe('Industrials');
    expect(result.company.headquarters).toBe('Austin, TX');
    expect(result.company.industry).toBe('');
    // Lineage for the badge + revert affordance, keyed by field_key.
    expect(Object.keys(result.overrides.companyDetails).sort()).toEqual([
      'entity_type',
      'founded_year',
      'headquarters',
      'legal_jurisdiction',
      'sector',
    ]);
    expect(result.overrides.companyDetails.founded_year?.overrideValue).toBe(
      2015,
    );
  });

  /** Queue a getInvLegalTerms call for a company with one round-terms row. */
  function legalTermsClient(rows: unknown[]) {
    return makeClient({
      inv_information_rights: [ok(null)],
      inv_financing_round: [ok([{ id: 500, name: 'Series A' }])],
      inv_round_terms: [ok(rows)],
      inv_security: [ok([])],
    });
  }

  function infoRightsRow(id: number, overrides: Record<string, unknown> = {}) {
    return {
      id,
      company_id: 9200,
      organization_id: 'org-1',
      financing_round_id: 500,
      effective_date: '2025-01-01',
      expiration_date: null,
      is_major_investor: false,
      major_investor_threshold: null,
      info_rights_for_major: false,
      info_rights_for_all: false,
      inspection_rights: false,
      cap_table_access: false,
      monthly_balance_sheet: false,
      monthly_income_cash_flows: false,
      monthly_stockholders_equity: false,
      monthly_cap_table: false,
      monthly_timing_days: null,
      audited_monthly: false,
      quarterly_balance_sheet: false,
      quarterly_income_cash_flows: false,
      quarterly_stockholders_equity: false,
      quarterly_cap_table: false,
      quarterly_timing_days: null,
      audited_quarterly: false,
      year_end_balance_sheet: false,
      year_end_income_cash_flows: false,
      year_end_stockholders_equity: false,
      year_end_cap_table: false,
      year_end_budget_business_plan: false,
      year_end_timing_days: null,
      audited_year_end: false,
      reporting_contact_name: null,
      reporting_contact_email: null,
      notes: null,
      metadata: null,
      ...overrides,
    };
  }

  function securityTermsRow(
    id: number,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      security_id: 800,
      organization_id: 'org-1',
      effective_date: '2025-01-01',
      superseded_date: null,
      original_issue_price: null,
      authorized_shares: null,
      issued_shares: null,
      outstanding_shares: null,
      par_value: null,
      conversion_price: null,
      conversion_ratio: null,
      anti_dilution_type: 'none',
      aggregate_liq_pref: null,
      liquidation_multiplier: null,
      liquidation_seniority: null,
      participation_type: null,
      participation_cap: null,
      dividend_rate: null,
      dividend_cumulative: false,
      dividend_accruing: false,
      dividend_seniority: null,
      valuation_cap: null,
      discount_rate: null,
      interest_rate: null,
      interest_type: null,
      maturity_date: null,
      qualified_financing_threshold: null,
      ...overrides,
    };
  }

  /** Queue a getInvLegalTerms call with all three source rows present. */
  function fullLegalTermsClient({
    infoRights,
    securityTerms,
  }: {
    infoRights: unknown;
    securityTerms: unknown;
  }) {
    return makeClient({
      inv_information_rights: [ok(infoRights)],
      inv_financing_round: [ok([{ id: 500, name: 'Series A' }])],
      inv_round_terms: [ok([roundTermsRow(750)])],
      inv_security: [ok([{ id: 800 }])],
      inv_security_terms: [ok(securityTerms)],
    });
  }

  it('getInvLegalTerms applies overrides to roundTerms and allRoundTerms', async () => {
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-9107' });
    mockServerClient.mockResolvedValue(
      legalTermsClient([
        roundTermsRow(700, { drag_along: false }),
        roundTermsRow(701, { drag_along: false }),
      ]),
    );
    mockGetActiveValueOverrides.mockResolvedValue([
      makeOverride({
        entity_type: 'inv_round_terms',
        entity_id: 700,
        field_key: 'drag_along',
        original_value: false,
        override_value: true,
      }),
      makeOverride({
        entity_type: 'inv_round_terms',
        entity_id: 701,
        field_key: 'pay_to_play',
        original_value: false,
        override_value: true,
      }),
    ]);

    const result = await getInvLegalTerms(9107);

    expect(result.roundTerms?.dragAlong).toBe(true);
    // Per-round rows merge too, so legalTermsByRound stays consistent.
    expect(result.allRoundTerms.map((t) => t.dragAlong)).toEqual([true, false]);
    expect(result.allRoundTerms.map((t) => t.payToPlay)).toEqual([false, true]);
  });

  it('getInvLegalTerms exposes lineage for the latest round-terms row', async () => {
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-9108' });
    mockServerClient.mockResolvedValue(
      legalTermsClient([roundTermsRow(710, { drag_along: false })]),
    );
    mockGetActiveValueOverrides.mockResolvedValue([
      makeOverride({
        entity_type: 'inv_round_terms',
        entity_id: 710,
        field_key: 'drag_along',
        original_value: false,
        override_value: true,
        reason: 'Confirmed in side letter',
      }),
    ]);

    const { legalTermsEdit } = await getInvLegalTerms(9108);

    expect(legalTermsEdit.roundTermsId).toBe(710);
    expect(Object.keys(legalTermsEdit.overridden.roundTerms)).toEqual([
      'drag_along',
    ]);
    expect(legalTermsEdit.overridden.roundTerms.drag_along?.overrideValue).toBe(
      true,
    );
    expect(legalTermsEdit.overridden.roundTerms.drag_along?.reason).toBe(
      'Confirmed in side letter',
    );
  });

  it('getInvLegalTerms keeps the Legal Terms tab and Investor Status in step', async () => {
    // pro_rata_rights_major is rendered by both surfaces; a single merge means
    // they can never disagree about its post-override value.
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-9109' });
    mockServerClient.mockResolvedValue(
      legalTermsClient([roundTermsRow(720, { pro_rata_rights_major: false })]),
    );
    mockGetActiveValueOverrides.mockResolvedValue([
      makeOverride({
        entity_type: 'inv_round_terms',
        entity_id: 720,
        field_key: 'pro_rata_rights_major',
        original_value: false,
        override_value: true,
      }),
    ]);

    const result = await getInvLegalTerms(9109);

    expect(result.roundTerms?.proRataRightsMajor).toBe(true);
    expect(result.investorStatusEdit.values.proRataRightsMajor).toBe(true);
    expect(result.investorStatusEdit.roundTermsId).toBe(720);
    expect(
      result.investorStatusEdit.overridden.pro_rata_rights_major,
    ).toBeDefined();
  });

  it('getInvLegalTerms returns empty lineage without overrides', async () => {
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-9110' });
    mockServerClient.mockResolvedValue(
      legalTermsClient([roundTermsRow(730, { drag_along: false })]),
    );

    const result = await getInvLegalTerms(9110);

    expect(result.roundTerms?.dragAlong).toBe(false);
    expect(result.legalTermsEdit).toEqual({
      roundTermsId: 730,
      informationRightsId: null,
      securityTermsId: null,
      values: {
        antiDilutionType: null,
        liquidationSeniority: null,
        dividendRate: null,
        dividendSeniority: null,
      },
      overridden: { roundTerms: {}, informationRights: {}, securityTerms: {} },
    });
  });

  // Regression: the informationRights result object used to be mapped from the
  // raw row rather than the merged one, so an info-rights edit wrote a row that
  // the Legal Terms grid never read.
  it('getInvLegalTerms applies overrides to the information-rights grid', async () => {
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-9111' });
    mockServerClient.mockResolvedValue(
      fullLegalTermsClient({
        infoRights: infoRightsRow(760, { audited_quarterly: false }),
        securityTerms: securityTermsRow(770),
      }),
    );
    mockGetActiveValueOverrides.mockResolvedValue([
      makeOverride({
        entity_type: 'inv_information_rights',
        entity_id: 760,
        field_key: 'audited_quarterly',
        original_value: false,
        override_value: true,
      }),
    ]);

    const result = await getInvLegalTerms(9111);

    expect(result.informationRights?.auditedQuarterly).toBe(true);
    expect(result.legalTermsEdit.informationRightsId).toBe(760);
    expect(
      result.legalTermsEdit.overridden.informationRights.audited_quarterly
        ?.overrideValue,
    ).toBe(true);
  });

  // Regression: inv_security_terms was never passed through applyOverrides.
  it('getInvLegalTerms applies overrides to security terms', async () => {
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-9112' });
    mockServerClient.mockResolvedValue(
      fullLegalTermsClient({
        infoRights: infoRightsRow(761),
        securityTerms: securityTermsRow(771, {
          anti_dilution_type: 'none',
          dividend_seniority: null,
        }),
      }),
    );
    mockGetActiveValueOverrides.mockResolvedValue([
      makeOverride({
        entity_type: 'inv_security_terms',
        entity_id: 771,
        field_key: 'anti_dilution_type',
        original_value: 'none',
        override_value: 'full_ratchet',
      }),
      makeOverride({
        entity_type: 'inv_security_terms',
        entity_id: 771,
        field_key: 'dividend_seniority',
        original_value: null,
        override_value: 2,
      }),
    ]);

    const result = await getInvLegalTerms(9112);

    expect(result.securityTerms?.antiDilutionType).toBe('full_ratchet');
    expect(result.securityTerms?.dividendSeniority).toBe(2);
    // The raw stored values the edit popup seeds from.
    expect(result.legalTermsEdit.securityTermsId).toBe(771);
    expect(result.legalTermsEdit.values.antiDilutionType).toBe('full_ratchet');
    expect(result.legalTermsEdit.values.dividendSeniority).toBe(2);
  });

  it('getInvLegalTerms keeps each table’s lineage in its own group', async () => {
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-9113' });
    mockServerClient.mockResolvedValue(
      fullLegalTermsClient({
        infoRights: infoRightsRow(762),
        securityTerms: securityTermsRow(772),
      }),
    );
    mockGetActiveValueOverrides.mockResolvedValue([
      makeOverride({
        entity_type: 'inv_round_terms',
        entity_id: 750,
        field_key: 'qsbs_rep_made',
        original_value: false,
        override_value: true,
      }),
      makeOverride({
        entity_type: 'inv_information_rights',
        entity_id: 762,
        field_key: 'monthly_cap_table',
        original_value: false,
        override_value: true,
      }),
      makeOverride({
        entity_type: 'inv_security_terms',
        entity_id: 772,
        field_key: 'dividend_accruing',
        original_value: false,
        override_value: true,
      }),
    ]);

    const { legalTermsEdit } = await getInvLegalTerms(9113);

    expect(Object.keys(legalTermsEdit.overridden.roundTerms)).toEqual([
      'qsbs_rep_made',
    ]);
    expect(Object.keys(legalTermsEdit.overridden.informationRights)).toEqual([
      'monthly_cap_table',
    ]);
    expect(Object.keys(legalTermsEdit.overridden.securityTerms)).toEqual([
      'dividend_accruing',
    ]);
  });

  // A stored value that fails its registry rule is dropped by applyOverrides on
  // read — so a numeric rank saved as a string would silently vanish.
  it('getInvLegalTerms drops a seniority override stored as a string', async () => {
    mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-9114' });
    mockServerClient.mockResolvedValue(
      fullLegalTermsClient({
        infoRights: infoRightsRow(763),
        securityTerms: securityTermsRow(773, { dividend_seniority: 1 }),
      }),
    );
    mockGetActiveValueOverrides.mockResolvedValue([
      makeOverride({
        entity_type: 'inv_security_terms',
        entity_id: 773,
        field_key: 'dividend_seniority',
        original_value: 1,
        override_value: '2',
      }),
    ]);

    const result = await getInvLegalTerms(9114);

    expect(result.securityTerms?.dividendSeniority).toBe(1);
    expect(Object.keys(result.legalTermsEdit.overridden.securityTerms)).toEqual(
      [],
    );
  });
});
