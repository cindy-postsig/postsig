/**
 * Report runner: the CSV export's contract-id narrowing.
 *
 * The export runs the same pipeline as the on-screen report and passes the ids
 * of the rows the user selected. Narrowing therefore has to land between the
 * base filters and the report's own filter, and must never reach the lineage
 * input (`allContracts`) the enrich steps read.
 */
import { parse } from 'csv-parse/sync';
import { getReportData } from '@/lib/v2/reports/pipeline/runner';
import { exportReportCSV } from '@/app/lib/actions/export-report';
import { reportPipelines } from '@/lib/v2/reports/definitions';
import { getContractsList } from '@/lib/v2/contracts/service';
import type { EnrichedContract } from '@/lib/v2/contracts/service';
import type { PipelineOptions } from '@/lib/v2/reports/pipeline/types';

jest.mock('@/lib/v2/contracts/service', () => ({
  getContractsList: jest.fn(),
}));

jest.mock('@/data/users', () => ({
  getUserMetadata: jest.fn().mockResolvedValue(null),
  getEffectiveDateFormat: jest.fn().mockResolvedValue('yyyy-MM-dd'),
}));

jest.mock('@/app/lib/contracts/actions', () => ({
  getOrganizationMissingClauseSettings: jest.fn(),
}));

const mockGetContractsList = getContractsList as jest.Mock;

const PUBLISHED_STATUS_ID = 4;
const ARCHIVED_STATUS_ID = 5;

const PROBE_REPORT = 'contract-ids-probe';

interface ProbeCall {
  received: number[];
  allContracts: number[] | undefined;
}

const probeCalls: ProbeCall[] = [];

function buildContract(
  id: number,
  contractOverrides: Record<string, unknown> = {},
): EnrichedContract {
  return {
    id,
    vendor_id: 1,
    vendor_name: 'Acme',
    contract: {
      id,
      status_id: PUBLISHED_STATUS_ID,
      status: 'active',
      type_id: 1,
      currency: 'usd',
      renewal_type: 'Auto',
      vendors: { name: 'Acme', ict_provider: false },
      term_start_date: [{ date: '2020-01-01', updated_at: '2020-01-01' }],
      term_end_date: [{ date: '2020-12-31', updated_at: '2020-01-01' }],
      ...contractOverrides,
    },
    products: [],
    priceHistory: null,
    isLinkedChildInvoice: false,
  };
}

beforeAll(() => {
  reportPipelines[PROBE_REPORT] = {
    filter: (contracts: EnrichedContract[], options?: PipelineOptions) => {
      probeCalls.push({
        received: contracts.map((c) => c.id),
        allContracts: options?.allContracts?.map((c) => c.id),
      });
      return { contracts };
    },
    transform: () => [],
  };
});

afterAll(() => {
  delete reportPipelines[PROBE_REPORT];
});

beforeEach(() => {
  jest.clearAllMocks();
  probeCalls.length = 0;
});

describe('getReportData contract-id narrowing', () => {
  it('keeps the pre-filter set as allContracts while narrowing what the pipeline filters', async () => {
    mockGetContractsList.mockResolvedValue({
      contracts: [
        buildContract(1),
        buildContract(2),
        buildContract(3),
        buildContract(4, { status_id: ARCHIVED_STATUS_ID }),
      ],
    });

    await getReportData(PROBE_REPORT, { contractIds: [2] });

    expect(probeCalls).toHaveLength(1);
    expect(probeCalls[0].received).toEqual([2]);
    // Segment-fee lineage needs amendments outside the selection, so the
    // lineage input keeps every fetched contract — archived ones included.
    expect(probeCalls[0].allContracts).toEqual([1, 2, 3, 4]);
  });

  it('leaves the base filters in charge when no ids are supplied', async () => {
    mockGetContractsList.mockResolvedValue({
      contracts: [
        buildContract(1),
        buildContract(2, { status_id: ARCHIVED_STATUS_ID }),
      ],
    });

    await getReportData(PROBE_REPORT);

    expect(probeCalls[0].received).toEqual([1]);
  });

  it('matches ids that arrive as strings, which is how table rows carry them', async () => {
    mockGetContractsList.mockResolvedValue({
      contracts: [buildContract(7), buildContract(8)],
    });

    await getReportData(PROBE_REPORT, {
      contractIds: ['8'] as unknown as number[],
    });

    expect(probeCalls[0].received).toEqual([8]);
  });
});

describe('dora export without a tab', () => {
  it('returns non-ICT rows even though the tab defaults to ict', async () => {
    mockGetContractsList.mockResolvedValue({
      contracts: [
        buildContract(11, { vendors: { name: 'Acme', ict_provider: false } }),
        buildContract(12, { vendors: { name: 'Globex', ict_provider: null } }),
      ],
    });

    const data = await getReportData('dora', { contractIds: [11, 12] });

    expect(data.rows.map((row) => row.contract_id)).toEqual(['11', '12']);
  });

  it('exports a selection spanning ICT and non-ICT vendors intact', async () => {
    // The export route sends no tab, so dora's own default ('ict') would drop
    // every non-ICT row the moment the selection contains an ICT provider.
    mockGetContractsList.mockResolvedValue({
      contracts: [
        buildContract(13, { vendors: { name: 'Initech', ict_provider: true } }),
        buildContract(14, { vendors: { name: 'Acme', ict_provider: false } }),
        buildContract(15, { vendors: { name: 'Globex', ict_provider: null } }),
      ],
    });

    const csv = await (await exportReportCSV([13, 14, 15], 'dora')).text();
    const [, ...rows] = parse(csv, { relaxColumnCount: true }) as string[][];

    expect(rows.map((row) => row[0])).toEqual(['13', '14', '15']);
  });
});

describe('all-renewals pipeline', () => {
  it('returns rows for exactly the requested ids', async () => {
    mockGetContractsList.mockResolvedValue({
      contracts: [buildContract(21), buildContract(22), buildContract(23)],
    });

    const data = await getReportData('all-renewals', { contractIds: [21, 23] });

    expect(data.rows.map((row) => row.contract_id)).toEqual(['21', '23']);
  });

  it('applies no renewal date window of its own', async () => {
    // Long expired: the windowed renewals pipelines would drop it.
    mockGetContractsList.mockResolvedValue({
      contracts: [
        buildContract(31, {
          term_end_date: [{ date: '2019-01-31', updated_at: '2019-01-01' }],
        }),
      ],
    });

    const data = await getReportData('all-renewals', { contractIds: [31] });

    expect(data.rows.map((row) => row.contract_id)).toEqual(['31']);
    await expect(
      getReportData('auto-renewals', { contractIds: [31] }),
    ).resolves.toMatchObject({ rows: [] });
  });
});
