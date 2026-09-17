import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('react', () => ({
  ...(jest.requireActual('react') as object),
  cache: (fn: unknown) => fn,
}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({}),
}));

const mockOrderCalls: Array<[string, { ascending: boolean }]> = [];
let mockEventRows: Record<string, unknown>[] = [];
let mockKpiValues: Record<string, unknown>[] = [];
let mockPackDocs: Record<string, unknown>[] = [];
let mockRequests: Record<string, unknown>[] = [];

jest.mock('@/utils/supabase/server', () => {
  const createClient = () => {
    let table = '';
    const dataForTable = () => {
      switch (table) {
        case 'inv_reporting_event':
          return mockEventRows;
        case 'inv_kpi_value':
          return mockKpiValues;
        case 'inv_reporting_document':
          return mockPackDocs;
        case 'inv_reporting_request':
          return mockRequests;
        default:
          return [];
      }
    };
    const builder: Record<string, unknown> = {};
    Object.assign(builder, {
      select: () => builder,
      eq: () => builder,
      order: (column: string, opts: { ascending: boolean }) => {
        mockOrderCalls.push([column, opts]);
        return builder;
      },
      in: () => Promise.resolve({ data: dataForTable(), error: null }),
      limit: () => Promise.resolve({ data: dataForTable(), error: null }),
    });
    return {
      from: (t: string) => {
        table = t;
        return builder;
      },
    };
  };
  return { createClient };
});

import { getKpiEvents } from '@/lib/v2/kpis/events';

describe('getKpiEvents query', () => {
  beforeEach(() => {
    mockOrderCalls.length = 0;
    mockEventRows = [];
    mockKpiValues = [];
    mockPackDocs = [];
    mockRequests = [];
  });

  it('orders by created_at then id descending so ties are deterministic at the row cap', async () => {
    await getKpiEvents(1);
    expect(mockOrderCalls).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
  });

  it('folds submitted-vs-requested counts onto kpi and reporting_pack submissions', async () => {
    mockEventRows = [
      {
        id: 1,
        event_type: 'submission_received',
        actor_user_id: null,
        payload: {
          submissionType: 'reporting_pack',
          periodYear: 2026,
          periodQuarter: 1,
          submissionId: 100,
        },
        created_at: '2026-07-14T00:00:00Z',
      },
      {
        id: 2,
        event_type: 'submission_received',
        actor_user_id: null,
        payload: {
          submissionType: 'kpi',
          periodYear: 2026,
          periodQuarter: 1,
          submissionId: 200,
        },
        created_at: '2026-07-14T00:00:00Z',
      },
    ];
    mockPackDocs = [{ submission_id: 100 }];
    mockKpiValues = [
      { submission_id: 200 },
      { submission_id: 200 },
      { submission_id: 200 },
      // Investor-origin corrections carry a null submission_id and must not
      // inflate the submitted tally.
      { submission_id: null },
    ];
    mockRequests = [
      {
        request_type: 'reporting_pack',
        period_year: 2026,
        period_quarter: 1,
        // A stray kpi count on the same period must not leak into the pack tally.
        inv_reporting_request_kpi: [{ count: 5 }],
        inv_reporting_request_document: [{ count: 2 }],
      },
      {
        request_type: 'kpi',
        period_year: 2026,
        period_quarter: 1,
        inv_reporting_request_kpi: [{ count: 8 }],
        inv_reporting_request_document: [],
      },
    ];

    const events = await getKpiEvents(1);

    const pack = events.find((e) => e.id === 1);
    expect(pack?.submittedCount).toBe(1);
    expect(pack?.requestedCount).toBe(2);

    const kpi = events.find((e) => e.id === 2);
    expect(kpi?.submittedCount).toBe(3);
    expect(kpi?.requestedCount).toBe(8);
  });

  it('leaves counts off a self-serve submission with no matching request', async () => {
    mockEventRows = [
      {
        id: 1,
        event_type: 'submission_received',
        actor_user_id: null,
        payload: {
          submissionType: 'reporting_pack',
          periodYear: 2026,
          periodQuarter: 2,
          submissionId: 100,
        },
        created_at: '2026-07-14T00:00:00Z',
      },
    ];
    mockPackDocs = [{ submission_id: 100 }];
    mockRequests = [];

    const events = await getKpiEvents(1);

    expect(events[0]?.submittedCount).toBeUndefined();
    expect(events[0]?.requestedCount).toBeUndefined();
  });
});
