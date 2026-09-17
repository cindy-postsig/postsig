jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const getContractsList = jest.fn();
jest.mock('@/lib/v2/contracts/service', () => ({
  getContractsList: (...args: unknown[]) => getContractsList(...args),
}));

const loadAllocationContextForRequest = jest.fn();
jest.mock('@/lib/v2/cost-allocation/context', () => ({
  ...jest.requireActual('@/lib/v2/cost-allocation/context'),
  loadAllocationContextForRequest: (...args: unknown[]) =>
    loadAllocationContextForRequest(...args),
}));

import { contractTypes } from '@/app/lib/constants';
import type { UserMetadata } from '@/constants/types';
import { buildAllocationContext } from '@/lib/v2/cost-allocation/context';
import {
  loadInvoiceCostAllocationReport,
  type InvoiceReportSource,
} from '@/lib/v2/cost-allocation/invoice-report';

const user = {
  organizationId: 'org-1',
  organizationFY: 4,
} as unknown as UserMetadata;
// Mid-August, so "this month" is August, "this quarter" is Jul–Sep, year to
// date runs from January, and the April fiscal year started in April 2026.
const TODAY = new Date('2026-08-15T00:00:00Z');

function invoice(id: number, termStart: string): InvoiceReportSource {
  return {
    id,
    vendor_name: 'Bloomberg',
    products: [{ product_id: 7, name: 'Terminal', isSuperseded: false }],
    contract: {
      type_id: contractTypes.Invoice,
      term_start_date: [{ date: termStart }],
      vendor_products_details: [{ product_id: 7, fees: 1000 }],
    },
    engineSpend: {
      currentBase: 0,
      currentNative: 0,
      recordedBase: 1000,
      recordedNative: 1000,
      products: {},
    } as InvoiceReportSource['engineSpend'],
  };
}

const emptyContext = () =>
  buildAllocationContext({
    allocations: [],
    lines: [],
    units: [],
    employees: [],
    seats: [],
    relationships: [],
  });

const load = (
  params: Parameters<typeof loadInvoiceCostAllocationReport>[1] = {},
) => loadInvoiceCostAllocationReport(user, params, TODAY);

beforeEach(() => {
  jest.clearAllMocks();
  loadAllocationContextForRequest.mockResolvedValue(emptyContext());
});

describe('the default view widens until it finds invoices', () => {
  it('stays on this month when this month has invoices', async () => {
    getContractsList.mockResolvedValue({
      contracts: [invoice(1, '2026-08-10')],
    });

    const report = await load();

    expect(report.period).toBe('this-month');
    expect(report.widenedFrom).toBeNull();
    expect(report.rows).toHaveLength(1);
  });

  it('falls through to the quarter, then the year, then all time', async () => {
    // July: outside August, inside Q3.
    getContractsList.mockResolvedValue({
      contracts: [invoice(1, '2026-07-10')],
    });
    let report = await load();
    expect(report.period).toBe('this-quarter');
    expect(report.widenedFrom).toBe('this-month');
    expect(report.rows).toHaveLength(1);

    // March: outside Q3, inside this year.
    getContractsList.mockResolvedValue({
      contracts: [invoice(1, '2026-03-10')],
    });
    report = await load();
    expect(report.period).toBe('ytd');
    expect(report.widenedFrom).toBe('this-month');

    // A prior year: only All Time reaches it.
    getContractsList.mockResolvedValue({
      contracts: [invoice(1, '2021-03-10')],
    });
    report = await load();
    expect(report.period).toBe('all');
    expect(report.widenedFrom).toBe('this-month');
  });

  it('never lands on a period that is merely different, not wider', async () => {
    // July is both "last month" and inside "this quarter"; the wider window is
    // the one that answers "what have we billed", so last-month is skipped.
    getContractsList.mockResolvedValue({
      contracts: [invoice(1, '2026-07-10')],
    });

    const report = await load();

    expect(report.period).not.toBe('last-month');
    expect(report.period).toBe('this-quarter');
  });

  it('reports the default period, not an empty All Time, when nothing exists', async () => {
    getContractsList.mockResolvedValue({ contracts: [] });

    const report = await load();

    expect(report.period).toBe('this-month');
    expect(report.widenedFrom).toBeNull();
    expect(report.rows).toEqual([]);
  });

  it('honours an explicitly chosen period, empty or not', async () => {
    getContractsList.mockResolvedValue({
      contracts: [invoice(1, '2021-03-10')],
    });

    const report = await load({ period: 'this-month' });

    expect(report.period).toBe('this-month');
    expect(report.widenedFrom).toBeNull();
    expect(report.rows).toEqual([]);
  });

  it('widens past an unrecognised period name, which is nobody having chosen', async () => {
    getContractsList.mockResolvedValue({
      contracts: [invoice(1, '2026-07-10')],
    });

    const report = await load({ period: 'all-time' });

    expect(report.period).toBe('this-quarter');
    expect(report.widenedFrom).toBe('this-month');
  });
});

describe('an explicit window is honoured exactly', () => {
  it('keeps an empty custom range, and reports the dates back for the control to seed from', async () => {
    getContractsList.mockResolvedValue({
      contracts: [invoice(1, '2021-03-10')],
    });

    const report = await load({
      period: 'custom',
      from: '2026-05-01',
      to: '2026-05-31',
    });

    expect(report.period).toBe('custom');
    expect(report.widenedFrom).toBeNull();
    expect(report.window).toEqual({ start: '2026-05-01', end: '2026-06-01' });
    expect(report.custom).toEqual({ from: '2026-05-01', to: '2026-05-31' });
    expect(report.rows).toEqual([]);
  });

  it('lists the invoices inside a custom range', async () => {
    getContractsList.mockResolvedValue({
      contracts: [invoice(1, '2021-03-10'), invoice(2, '2021-04-10')],
    });

    const report = await load({
      period: 'custom',
      from: '2021-03-01',
      to: '2021-03-31',
    });

    expect(report.rows.map((row) => row.id)).toEqual([1]);
  });

  it("resolves the FY presets against the org's fiscal year, and does not widen", async () => {
    getContractsList.mockResolvedValue({
      contracts: [invoice(1, '2026-05-10'), invoice(2, '2027-05-10')],
    });

    const current = await load({ period: 'current-fy' });
    expect(current.window).toEqual({ start: '2026-04-01', end: '2027-04-01' });
    expect(current.rows.map((row) => row.id)).toEqual([1]);

    const projected = await load({ period: 'projected-fy' });
    expect(projected.window).toEqual({
      start: '2027-04-01',
      end: '2028-04-01',
    });
    expect(projected.rows.map((row) => row.id)).toEqual([2]);
    expect(projected.widenedFrom).toBeNull();
  });

  it('falls back to this month, without widening, when the typed range is unusable', async () => {
    getContractsList.mockResolvedValue({
      contracts: [invoice(1, '2021-03-10')],
    });

    const report = await load({
      period: 'custom',
      from: '2026-05-31',
      to: '2026-05-01',
    });

    expect(report.period).toBe('this-month');
    expect(report.custom).toBeNull();
    expect(report.widenedFrom).toBeNull();
    expect(report.rows).toEqual([]);
  });
});
