/**
 * Report CSV goldens.
 *
 * The export now formats whatever rows the v2 report pipeline hands it, so the
 * formatter itself — column assembly, headers, per-column rendering — is pinned
 * here against v2-shaped rows, one report type per case.
 */
import { parse } from 'csv-parse/sync';
import { exportReportCSV } from '@/app/lib/actions/export-report';
import { getReportData } from '@/lib/v2/reports/service';
import { getEffectiveDateFormat } from '@/data/users';

jest.mock('@/lib/v2/reports/service', () => ({
  getReportData: jest.fn(),
}));

jest.mock('@/data/users', () => ({
  getUserMetadata: jest.fn(),
  getEffectiveDateFormat: jest.fn(),
}));

const mockGetReportData = getReportData as jest.Mock;
const mockGetEffectiveDateFormat = getEffectiveDateFormat as jest.Mock;

function stageRows(rows: unknown[]): void {
  mockGetReportData.mockResolvedValue({
    rows,
    contracts: [],
    totalValueInUSD: 0,
  });
}

async function exportRows(
  rows: unknown[],
  reportType: string,
): Promise<string[][]> {
  stageRows(rows);
  const csv = await (await exportReportCSV([1], reportType)).text();
  return parse(csv, { relaxColumnCount: true }) as string[][];
}

const baseRow = {
  id: '101',
  contract_id: '101',
  vendor: 'Acme',
  orderNumber: 'PO-101',
  currency: 'USD',
  tags: [{ id: 1, name: 'core' }],
  businessSponsor: ['Dana Reed'],
  businessGroup: 'IT',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetEffectiveDateFormat.mockResolvedValue('yyyy-MM-dd');
});

describe('renewals report export', () => {
  it('formats a row against the auto-renewals columns', async () => {
    const [headers, ...rows] = await exportRows(
      [
        {
          ...baseRow,
          currentProducts: [{ vendor_products: { id: 1, name: 'Widget' } }],
          type: 'Master Agreement',
          renewalType: 'Auto',
          termStartDate: '2026-01-01',
          cancelByDate: '2026-11-01',
          termEndDate: '2026-12-31',
          currentBudget: 1200,
          projectedBudget: 1260,
        },
      ],
      'auto-renewals',
    );

    expect(headers).toEqual([
      'Contract ID',
      'Vendor',
      'Contract No.',
      'Product',
      'Contract Type',
      'Renewal Type',
      'Start Date',
      'Cancel By Date',
      'End Date',
      'Current Spend',
      'Projected Spend',
      'Business Sponsor',
      'Business Group',
      'Tags',
    ]);
    expect(rows).toEqual([
      [
        '101',
        'Acme',
        'PO-101',
        'Widget',
        'Master Agreement',
        'Auto',
        '2026-01-01',
        '2026-11-01',
        '2026-12-31',
        '$1,200.00',
        '$1,260.00',
        'Dana Reed',
        'IT',
        'core',
      ],
    ]);
  });
});

describe('dora report export', () => {
  it('inserts the missing DORA categories column after the score', async () => {
    const [headers, ...rows] = await exportRows(
      [
        {
          ...baseRow,
          currentProducts: [{ vendor_products: { id: 1, name: 'Widget' } }],
          doraScore: { score: 6, details: {} },
          doraScoreValue: 6,
          missingDoraCategories: ['Data Recovery', 'Service Level Agreement'],
          type: 'Master Agreement',
          renewalType: 'Auto',
          termStartDate: '2026-01-01',
          cancelByDate: '2026-11-01',
          termEndDate: '2026-12-31',
          currentBudget: 1200,
          projectedBudget: 1260,
          totalContractValue: 2400,
        },
      ],
      'dora',
    );

    expect(headers).toEqual([
      'Contract ID',
      'Vendor',
      'Contract No.',
      'Product',
      'DORA Score',
      'Missing DORA Categories',
      'Contract Type',
      'Renewal Type',
      'Start Date',
      'Cancel By Date',
      'End Date',
      'Current Spend',
      'Projected Spend',
      'Total Contract Value',
      'Business Sponsor',
      'Business Group',
      'Tags',
    ]);
    expect(rows).toEqual([
      [
        '101',
        'Acme',
        'PO-101',
        'Widget',
        '6',
        'Data Recovery, Service Level Agreement',
        'Master Agreement',
        'Auto',
        '2026-01-01',
        '2026-11-01',
        '2026-12-31',
        '$1,200.00',
        '$1,260.00',
        '$2,400.00',
        'Dana Reed',
        'IT',
        'core',
      ],
    ]);
  });
});

describe('contract omissions report export', () => {
  it('lists the missing clauses beside their count', async () => {
    const [headers, ...rows] = await exportRows(
      [
        {
          ...baseRow,
          currentProducts: [{ vendor_products: { id: 1, name: 'Widget' } }],
          missingClausesCount: 2,
          missingClauses: ['Termination', 'Liability'],
          type: 'Master Agreement',
          renewalType: 'Auto',
          termStartDate: '2026-01-01',
          cancelByDate: '2026-11-01',
          termEndDate: '2026-12-31',
          currentBudget: 1200,
          projectedBudget: 1260,
          totalContractValue: 2400,
        },
      ],
      'contract-omissions',
    );

    expect(headers).toEqual([
      'Contract ID',
      'Vendor',
      'Contract No.',
      'Product',
      'Missing Clauses Count',
      'Missing Clauses',
      'Contract Type',
      'Renewal Type',
      'Start Date',
      'Cancel By Date',
      'End Date',
      'Current Spend',
      'Projected Spend',
      'Total Contract Value',
      'Business Sponsor',
      'Business Group',
      'Tags',
    ]);
    expect(rows).toEqual([
      [
        '101',
        'Acme',
        'PO-101',
        'Widget',
        '2',
        'Termination, Liability',
        'Master Agreement',
        'Auto',
        '2026-01-01',
        '2026-11-01',
        '2026-12-31',
        '$1,200.00',
        '$1,260.00',
        '$2,400.00',
        'Dana Reed',
        'IT',
        'core',
      ],
    ]);
  });
});

describe('nda report export', () => {
  it('labels the risk flags raised by ndaInsights', async () => {
    const [headers, ...rows] = await exportRows(
      [
        {
          ...baseRow,
          termStartDate: '2026-01-01',
          cancelByDate: '2026-11-01',
          termEndDate: '2026-12-31',
          extendedTermEndDate: '2029-12-31',
          ndaRiskLevel: 2,
          ndaInsights: {
            no_time_limit: true,
            unilateral_nda: false,
            uncapped_liability: true,
          },
        },
      ],
      'nda',
    );

    expect(headers).toEqual([
      'Contract ID',
      'Vendor',
      'Contract No.',
      'Start Date',
      'Cancel By Date',
      'End Date',
      'Extended Confidentiality Term',
      'NDA Risk Level',
      'Identified Risks',
      'Business Sponsor',
      'Business Group',
      'Tags',
    ]);
    expect(rows).toEqual([
      [
        '101',
        'Acme',
        'PO-101',
        '2026-01-01',
        '2026-11-01',
        '2026-12-31',
        '2029-12-31',
        '2',
        'No Time Limit on Confidentiality, Uncapped Liability',
        'Dana Reed',
        'IT',
        'core',
      ],
    ]);
  });
});

describe('leavers report export', () => {
  it('exports the departed licence count and seat usage', async () => {
    const [headers, ...rows] = await exportRows(
      [
        {
          ...baseRow,
          currentProducts: [{ vendor_products: { id: 1, name: 'Widget' } }],
          departedLicensesCount: 3,
          seatUsage: { assigned: 4, licensed: 10 },
          seatUsageDisplay: '4/10',
        },
      ],
      'leavers',
    );

    expect(headers).toEqual([
      'Contract ID',
      'Vendor',
      'Contract No.',
      'Product',
      'departedLicensesCount',
      'Seat Usage',
      'Business Sponsor',
      'Business Group',
      'reAllocateSeats',
      'Tags',
    ]);
    expect(rows).toEqual([
      [
        '101',
        'Acme',
        'PO-101',
        'Widget',
        '3',
        '4 / 10',
        'Dana Reed',
        'IT',
        '',
        'core',
      ],
    ]);
  });
});

describe('utilization report export', () => {
  it('exports one row per product usage subrow, stamped from the parent', async () => {
    const [headers, ...rows] = await exportRows(
      [
        {
          ...baseRow,
          id: '501',
          contract_id: '501',
          vendor: 'Globex',
          orderNumber: 'PO-501',
          renewalType: 'Manual',
          termStartDate: '2026-02-01',
          cancelByDate: '2026-10-01',
          termEndDate: '2027-01-31',
          seatUsage: { assigned: 8, licensed: 10 },
          subRows: [
            {
              id: 'report-usage-501-1',
              contract_id: '501',
              product: [{ vendor_products: { id: 1, name: 'Widget' } }],
              productUsage: {
                totalSeats: {
                  assigned: 5,
                  licensed: 6,
                  value: 600,
                  valuePerSeat: 100,
                  unusedSeatsValue: 100,
                },
              },
              seatUsage: { assigned: 5, licensed: 6 },
              potentialOverage: 100,
              // Empty on the v2 subrow, so the parent's currency has to win.
              currency: '',
              isReportRow: true,
              isProductUsageRow: true,
              reportType: 'utilization',
            },
            {
              id: 'report-usage-501-2',
              contract_id: '501',
              product: [{ vendor_products: { id: 2, name: 'Gadget' } }],
              productUsage: {
                totalSeats: {
                  assigned: 2,
                  licensed: 4,
                  value: 400,
                  valuePerSeat: 100,
                  unusedSeatsValue: 200,
                },
              },
              seatUsage: { assigned: 2, licensed: 4 },
              potentialOverage: 200,
              currency: 'USD',
              isReportRow: true,
              isProductUsageRow: true,
              reportType: 'utilization',
            },
          ],
        },
      ],
      'utilization',
    );

    expect(headers).toEqual([
      'Contract ID',
      'Vendor',
      'Contract No.',
      'Product',
      'Seat Usage',
      'Utilization %',
      'Price Per Seat',
      'Potential Overage',
      'Renewal Type',
      'Start Date',
      'Cancel By Date',
      'End Date',
      'Business Sponsor',
      'Business Group',
      'Tags',
    ]);
    // A subrow carries only its product's seat figures, so every
    // contract-level column is stamped from the parent row — each exported row
    // stands alone, with no parent row above it to read them from.
    expect(rows).toEqual([
      [
        '501',
        'Globex',
        'PO-501',
        'Widget',
        '5 / 6',
        '83%',
        '$100.00',
        '$100.00',
        'Manual',
        '2026-02-01',
        '2026-10-01',
        '2027-01-31',
        'Dana Reed',
        'IT',
        'core',
      ],
      [
        '501',
        'Globex',
        'PO-501',
        'Gadget',
        '2 / 4',
        '50%',
        '$100.00',
        '$200.00',
        'Manual',
        '2026-02-01',
        '2026-10-01',
        '2027-01-31',
        'Dana Reed',
        'IT',
        'core',
      ],
    ]);
  });

  it('falls back to the contract row when it has no usage subrows', async () => {
    const [, ...rows] = await exportRows(
      [
        {
          ...baseRow,
          currentProducts: [{ vendor_products: { id: 1, name: 'Widget' } }],
          renewalType: 'Manual',
          termStartDate: '2026-02-01',
          cancelByDate: '2026-10-01',
          termEndDate: '2027-01-31',
          seatUsage: { assigned: 8, licensed: 10 },
          productUsage: { totalSeats: { valuePerSeat: 50 } },
          potentialOverage: 100,
        },
      ],
      'utilization',
    );

    expect(rows).toEqual([
      [
        '101',
        'Acme',
        'PO-101',
        'Widget',
        '8 / 10',
        '80%',
        '$50.00',
        '$100.00',
        'Manual',
        '2026-02-01',
        '2026-10-01',
        '2027-01-31',
        'Dana Reed',
        'IT',
        'core',
      ],
    ]);
  });
});
