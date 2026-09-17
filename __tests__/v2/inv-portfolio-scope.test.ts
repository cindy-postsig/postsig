// __tests__/v2/inv-portfolio-scope.test.ts
//
// getScopedPortfolioInvCompanies decides which portcos every investor list
// surface can see. The published-document gate hid KPI-only portcos, whose
// documents never leave READY_FOR_EXTRACTION because the KPI review flow
// records completion on its own tables instead of stamping status_id.

import {
  getInvPortfolioCompanies,
  getScopedPortfolioInvCompanies,
} from '@/lib/v2/inv/service';
import { resolveInvDataCoverage } from '@/lib/v2/inv/data-coverage';
import { getActiveValueOverrides } from '@/lib/v2/inv/overrides/fetchOverrides';
import { getUserMetadata } from '@/data/users';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { MODULE_DOCUMENT_STATUS_IDS } from '@/constants/moduleDocumentStatuses';

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
  info: jest.fn(),
}));

const mockGetUserMetadata = getUserMetadata as jest.Mock;
const mockGetActiveValueOverrides = getActiveValueOverrides as jest.Mock;
const mockServerClient = createServerClient as jest.Mock;

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

type Builder = Record<string, jest.Mock> & {
  then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => void;
};

/**
 * A table's rows, or a function of the query's `eq` filters when one fixture
 * has to answer differently per company (the per-company valuation reads).
 */
type TableResult =
  | QueryResult
  | ((filters: Record<string, unknown>) => QueryResult);

/** Mirrors PostgREST's `max_rows`: no response carries more rows than this. */
const MAX_ROWS = 1000;

function makeBuilder(result: TableResult): Builder {
  const filters: Record<string, unknown> = {};
  let rangeFrom = 0;
  // Row arrays are capped the way the server caps them, so a caller that reads
  // a single unpaged page only ever sees the first `MAX_ROWS` rows.
  const resolve = () => {
    const page = typeof result === 'function' ? result(filters) : result;
    if (!Array.isArray(page.data)) {
      return page;
    }
    return {
      ...page,
      data: page.data.slice(rangeFrom, rangeFrom + MAX_ROWS),
    };
  };
  const chainMethods = [
    'select',
    'eq',
    'is',
    'in',
    'order',
    'limit',
    'not',
    'range',
  ];
  const builder = {} as Builder;
  for (const method of chainMethods) {
    builder[method] = jest.fn((column: unknown, value: unknown) => {
      if (method === 'eq' && typeof column === 'string') {
        filters[column] = value;
      }
      if (method === 'range' && typeof column === 'number') {
        rangeFrom = column;
      }
      return builder;
    });
  }
  builder.single = jest.fn(() => Promise.resolve(resolve()));
  builder.maybeSingle = jest.fn(() => Promise.resolve(resolve()));
  builder.then = (resolve_, reject) =>
    Promise.resolve(resolve()).then(resolve_, reject);
  return builder;
}

/**
 * Per-table result map. Unlike the queue-based mock in
 * inv-service-overrides.test.ts, the reporting lookups are conditional — they
 * only run when the published gate would drop something — so results are keyed
 * by table and a missing table means "no rows" rather than a failure.
 */
function makeClient(results: Record<string, TableResult>) {
  const calls: string[] = [];
  const from = jest.fn((table: string) => {
    calls.push(table);
    return makeBuilder(results[table] ?? { data: [], error: null });
  });
  return { client: { from }, calls };
}

function companyRow(id: number, name: string) {
  return {
    id,
    public_id: `pub-${id}`,
    organization_id: 'org-1',
    company_id: id * 100,
    status: 'active',
    sector: null,
    tags: null,
    notes: null,
    investment_thesis: null,
    contact_person: null,
    contact_email: null,
    external_id: null,
    metadata: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    name_override: null,
    inv_companies: {
      name,
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

// One company per inclusion path, so a single run covers the whole predicate.
const PUBLISHED_DOC = 1;
const KPI_ONLY = 2;
const UNPUBLISHED_ONLY = 3;
const NO_DOCS = 4;
const PACK_ONLY = 5;

const ALL_COMPANIES = [
  companyRow(PUBLISHED_DOC, 'Published Co'),
  companyRow(KPI_ONLY, 'KPI Only Co'),
  companyRow(UNPUBLISHED_ONLY, 'In Flight Co'),
  companyRow(NO_DOCS, 'Aumni Import Co'),
  companyRow(PACK_ONLY, 'Reporting Pack Co'),
];

const DOC_ROWS = [
  {
    company_id: PUBLISHED_DOC,
    status_id: MODULE_DOCUMENT_STATUS_IDS.PUBLISHED,
  },
  {
    company_id: KPI_ONLY,
    status_id: MODULE_DOCUMENT_STATUS_IDS.READY_FOR_EXTRACTION,
  },
  {
    company_id: UNPUBLISHED_ONLY,
    status_id: MODULE_DOCUMENT_STATUS_IDS.UPLOADED,
  },
  {
    company_id: PACK_ONLY,
    status_id: MODULE_DOCUMENT_STATUS_IDS.PROCESSING,
  },
];

function scopeFixture(over: Record<string, TableResult> = {}) {
  return makeClient({
    inv_company: { data: ALL_COMPANIES, error: null },
    module_documents: { data: DOC_ROWS, error: null },
    inv_kpi_value: { data: [{ company_id: KPI_ONLY }], error: null },
    inv_reporting_submission: {
      data: [{ company_id: PACK_ONLY }],
      error: null,
    },
    ...over,
  });
}

async function scopedIds(over?: Record<string, TableResult>) {
  const { client, calls } = scopeFixture(over);
  mockServerClient.mockResolvedValue(client);
  const companies = await getScopedPortfolioInvCompanies();
  return { ids: companies.map((c) => c.id).sort((a, b) => a - b), calls };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUserMetadata.mockResolvedValue({
    userId: 'user-1',
    organizationId: 'org-1',
  });
  mockGetActiveValueOverrides.mockResolvedValue([]);
});

describe('getScopedPortfolioInvCompanies', () => {
  it('includes published-doc, KPI-backed, reporting-pack and doc-less portcos', async () => {
    const { ids } = await scopedIds();

    expect(ids).toEqual([PUBLISHED_DOC, KPI_ONLY, NO_DOCS, PACK_ONLY]);
  });

  it('still hides a portco whose only documents are unpublished with no reporting data', async () => {
    const { ids } = await scopedIds();

    expect(ids).not.toContain(UNPUBLISHED_ONLY);
  });

  it('skips the reporting lookups when every doc-bearing portco is published', async () => {
    const { ids, calls } = await scopedIds({
      module_documents: {
        data: [
          {
            company_id: PUBLISHED_DOC,
            status_id: MODULE_DOCUMENT_STATUS_IDS.PUBLISHED,
          },
        ],
        error: null,
      },
    });

    expect(calls).not.toContain('inv_kpi_value');
    expect(calls).not.toContain('inv_reporting_submission');
    // Everything else has no documents at all, so the zero-doc exemption holds.
    expect(ids).toEqual([
      PUBLISHED_DOC,
      KPI_ONLY,
      UNPUBLISHED_ONLY,
      NO_DOCS,
      PACK_ONLY,
    ]);
  });

  it('falls back to the published-only rule when the reporting lookup fails', async () => {
    const { ids } = await scopedIds({
      inv_kpi_value: { data: null, error: { message: 'boom' } },
      inv_reporting_submission: { data: null, error: { message: 'boom' } },
    });

    expect(ids).toEqual([PUBLISHED_DOC, NO_DOCS]);
  });

  it('returns nothing when the document census itself fails', async () => {
    const { ids } = await scopedIds({
      module_documents: { data: null, error: { message: 'boom' } },
    });

    expect(ids).toEqual([]);
  });

  it('reads every page of the KPI lookup', async () => {
    // `inv_kpi_value` carries a row per kpi x period x company, so a portco's
    // only evidence can sit past the first page.
    const { ids } = await scopedIds({
      inv_kpi_value: {
        data: [
          ...Array.from({ length: MAX_ROWS }, () => ({
            company_id: KPI_ONLY,
          })),
          { company_id: UNPUBLISHED_ONLY },
        ],
        error: null,
      },
    });

    expect(ids).toContain(UNPUBLISHED_ONLY);
  });

  it('reads every page of the document census', async () => {
    // The published document lands on page two; page one only shows this portco
    // holding an unpublished upload.
    const { ids } = await scopedIds({
      module_documents: {
        data: [
          {
            company_id: PUBLISHED_DOC,
            status_id: MODULE_DOCUMENT_STATUS_IDS.UPLOADED,
          },
          ...Array.from({ length: MAX_ROWS - 1 }, () => ({
            company_id: PACK_ONLY,
            status_id: MODULE_DOCUMENT_STATUS_IDS.PROCESSING,
          })),
          {
            company_id: PUBLISHED_DOC,
            status_id: MODULE_DOCUMENT_STATUS_IDS.PUBLISHED,
          },
        ],
        error: null,
      },
    });

    expect(ids).toContain(PUBLISHED_DOC);
  });
});

/**
 * The Data Coverage column reads "KPI Only" off `hasKpiData`, so that flag has
 * to reflect real KPI values — a portco that was merely sent a reporting
 * request has none, and must not be labelled KPI-only.
 */
describe('getInvPortfolioCompanies data coverage', () => {
  const TRANSACTION_BACKED = PUBLISHED_DOC;
  const REQUEST_SENT = NO_DOCS;

  async function coverageByCompanyId(over: Record<string, TableResult> = {}) {
    const { client } = makeClient({
      inv_company: { data: ALL_COMPANIES, error: null },
      module_documents: { data: DOC_ROWS, error: null },
      inv_kpi_value: { data: [{ company_id: KPI_ONLY }], error: null },
      inv_reporting_submission: {
        data: [{ company_id: PACK_ONLY }],
        error: null,
      },
      // Only the transaction-backed portco has funds, i.e. inv_transaction rows.
      v_inv_company_valuation: (filters) => ({
        data: {
          company_id: filters.company_id,
          fund_ids: filters.company_id === TRANSACTION_BACKED ? [7] : null,
        },
        error: null,
      }),
      ...over,
    });
    mockServerClient.mockResolvedValue(client);

    const { companies } = await getInvPortfolioCompanies();
    return new Map(
      companies.map((c) => [c.entityId, resolveInvDataCoverage(c)]),
    );
  }

  it('reports KPI-only only for portcos that actually have KPI data', async () => {
    const coverage = await coverageByCompanyId();

    expect(coverage.get(KPI_ONLY)).toBe('kpi_only');
    expect(coverage.get(PACK_ONLY)).toBe('kpi_only');
  });

  it('reports no data for a portco with no transactions and no KPI data', async () => {
    const coverage = await coverageByCompanyId();

    expect(coverage.get(REQUEST_SENT)).toBe('none');
  });

  it('reports transaction data without consulting KPI evidence', async () => {
    const coverage = await coverageByCompanyId();

    expect(coverage.get(TRANSACTION_BACKED)).toBe('transactions');
  });
});
