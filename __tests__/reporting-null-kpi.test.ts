import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@/data/users', () => ({
  getUserMetadata: () => Promise.resolve({ organizationId: 'org-1' }),
}));

let requestRow: unknown = null;
let submissionRows: unknown[] = [];

jest.mock('@/utils/supabase/server', () => {
  const createClient = () => {
    const builder: Record<string, unknown> = {};
    Object.assign(builder, {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      maybeSingle: () => Promise.resolve({ data: requestRow, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => void) =>
        resolve({ data: submissionRows, error: null }),
    });
    return { from: () => builder };
  };
  return { createClient };
});

import {
  getReportingRequestDetails,
  getCompanyReporting,
} from '@/lib/v2/kpis/service';

// Request lines now carry a single kpi_id, and reporting values resolve through
// inv_kpi. The standard performance table shows only coded (standard) KPIs;
// custom-KPI portco values (inv_kpi.code NULL) are dropped here — they surface in
// the custom payload with provenance instead.
describe('reporting service resolves values through inv_kpi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestRow = null;
    submissionRows = [];
  });

  it('resolves request KPI lines to labels ordered by sort_order', async () => {
    requestRow = {
      message: null,
      inv_reporting_request_kpi: [
        {
          kpi_id: 9,
          sort_order: 1,
          inv_kpi: { label: 'MRR', category: 'Growth', organization_id: null },
        },
        {
          kpi_id: 5,
          sort_order: 0,
          inv_kpi: { label: 'ARR', category: 'Growth', organization_id: null },
        },
      ],
      inv_reporting_request_document: [],
    };
    const result = await getReportingRequestDetails(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result).not.toBeNull();
    expect(result?.kpis).toEqual([
      { id: 5, label: 'ARR', category: 'Growth', isCustom: false },
      { id: 9, label: 'MRR', category: 'Growth', isCustom: false },
    ]);
  });

  it('resolves a custom KPI label even after it is deactivated', async () => {
    // The FK embed returns the def regardless of is_active, so an immutable
    // request still renders a custom KPI's label after it is deactivated.
    requestRow = {
      message: null,
      inv_reporting_request_kpi: [
        {
          kpi_id: 42,
          sort_order: 0,
          inv_kpi: {
            label: 'Retired custom metric',
            category: 'Custom',
            organization_id: 'org-1',
          },
        },
      ],
      inv_reporting_request_document: [],
    };
    const result = await getReportingRequestDetails(
      '22222222-2222-4222-8222-222222222222',
    );
    expect(result?.kpis).toEqual([
      {
        id: 42,
        label: 'Retired custom metric',
        category: 'Custom',
        isCustom: true,
      },
    ]);
  });

  it('skips custom (code NULL) values in company reporting', async () => {
    submissionRows = [
      {
        id: 1,
        type: 'kpi',
        period_year: 2026,
        period_quarter: 1,
        status: 'submitted',
        submitted_at: '2026-01-01T00:00:00Z',
        inv_kpi_value: [
          {
            value_numeric: 100,
            value_text: null,
            inv_kpi: {
              code: 'arr',
              label: 'ARR',
              category: 'Growth',
              value_type: 'currency',
              sort_order: 0,
            },
          },
          {
            value_numeric: 5,
            value_text: null,
            inv_kpi: {
              code: null,
              label: 'Custom metric',
              category: 'Custom',
              value_type: 'number',
              sort_order: 0,
            },
          },
        ],
        inv_reporting_document: [],
      },
    ];
    const quarters = await getCompanyReporting(1);
    expect(quarters).toHaveLength(1);
    expect(quarters[0].kpis.map((k) => k.code)).toEqual(['arr']);
  });
});
