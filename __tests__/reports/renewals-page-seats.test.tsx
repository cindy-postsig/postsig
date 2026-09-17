import type { ReactElement } from 'react';

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => () => null,
}));
jest.mock('@/data/users', () => ({
  getUserMetadata: async () => ({
    organizationId: 'org-1',
    baseCurrency: 'EUR',
    userProfile: { advance_notice_period: 30 },
  }),
}));
const getReportData = jest.fn();
jest.mock('@/lib/v2/reports/service', () => ({
  getReportData: (...args: unknown[]) => getReportData(...args),
}));
const ContractsTableClient = () => null;
jest.mock('@/components/contracts/ContractsTableClient', () => ({
  ContractsTableClient,
}));
jest.mock('@/components/Loading', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/cards/SummaryCard', () => ({
  SummaryCard: () => null,
}));

import Page from '@/app/(app)/(cpm)/reports/page';

const row = (id: string) => ({ id, vendor: 'V', currentBudget: 0 });

function findAll(node: unknown, type: unknown, found: ReactElement[] = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => findAll(child, type, found));
    return found;
  }
  if (!node || typeof node !== 'object') return found;
  const element = node as ReactElement<{ children?: unknown }>;
  if (element.type === type) found.push(element);
  findAll(element.props?.children, type, found);
  return found;
}

describe('Renewals Report page — pipeline rows', () => {
  beforeEach(() => {
    getReportData.mockImplementation(async (type: string) => ({
      contracts: [{ id: 1 }],
      rows:
        type === 'auto-renewals'
          ? [row('1'), row('bloomberg:469')]
          : [row('1')],
      totalValueInUSD: 100,
      metadata: {},
    }));
  });

  it('renders the rows the pipelines built, seat row included, and asks for the notice window', async () => {
    const page = (await Page({})) as ReactElement;

    const tables = findAll(page, ContractsTableClient) as ReactElement<{
      data: Array<{ id: string }>;
    }>[];
    expect(tables.map((table) => table.props.data.map((r) => r.id))).toEqual([
      ['1', 'bloomberg:469'],
      ['1'],
      ['1'],
    ]);
    expect(getReportData).toHaveBeenCalledWith('auto-renewals', {
      range: 30,
      valueField: 'projectedBudget',
    });
  });

  it('gives each renewal section its own filter key prefix so filters do not leak across sections', async () => {
    const page = (await Page({})) as ReactElement;

    const tables = findAll(page, ContractsTableClient) as ReactElement<{
      filterKeyPrefix?: string;
    }>[];
    const prefixes = tables.map((table) => table.props.filterKeyPrefix);

    expect(prefixes).toEqual(['auto', 'manual', 'renewed']);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
