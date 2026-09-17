const NOT_FOUND = new Error('NEXT_NOT_FOUND');
const notFound = jest.fn(() => {
  throw NOT_FOUND;
});
jest.mock('next/navigation', () => ({ notFound: () => notFound() }));

const isAssignmentsEnabled = jest.fn();
jest.mock('@/lib/v2/assignments/flag', () => ({
  isAssignmentsEnabled: (...args: unknown[]) => isAssignmentsEnabled(...args),
}));

const getUserMetadata = jest.fn();
jest.mock('@/data/users', () => ({ getUserMetadata: () => getUserMetadata() }));

const loadAssignmentsPage = jest.fn();
jest.mock('@/lib/v2/assignments/service', () => ({
  loadAssignmentsPage: (...args: unknown[]) => loadAssignmentsPage(...args),
}));

const loadAllocationRollupReport = jest.fn();
jest.mock('@/lib/v2/cost-allocation/rollup-report', () => ({
  loadAllocationRollupReport: (...args: unknown[]) =>
    loadAllocationRollupReport(...args),
}));

const getOrgHierarchyLevelOrder = jest.fn();
jest.mock('@/lib/v2/org-units/sync', () => ({
  getOrgHierarchyLevelOrder: (...args: unknown[]) =>
    getOrgHierarchyLevelOrder(...args),
}));

const cookieJar = new Map<string, string>();
jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

jest.mock('@/components/assignments/AssignmentsPage', () => ({
  AssignmentsPage: () => null,
}));

import AssignmentsRoute from '@/app/(app)/(cpm)/assignments/page';
import { ASSIGNMENTS_SIDEBAR_ID } from '@/lib/v2/assignments/layout';
import { panelLayoutCookieName } from '@/lib/panel-layout-cookie';

const USER = {
  organizationId: 'org-1',
  userId: 'user-1',
  baseCurrency: 'USD',
  dateFormat: 'dd/MM/yyyy',
};

const route = (month?: string) =>
  AssignmentsRoute({ searchParams: Promise.resolve({ month }) });

beforeEach(() => {
  jest.clearAllMocks();
  cookieJar.clear();
  getUserMetadata.mockResolvedValue(USER);
  loadAssignmentsPage.mockResolvedValue({ empty: true });
  getOrgHierarchyLevelOrder.mockResolvedValue([]);
});

describe('the Assignments route', () => {
  it('renders when the org has assignments', async () => {
    isAssignmentsEnabled.mockResolvedValue(true);
    await route();
    expect(notFound).not.toHaveBeenCalled();
    expect(loadAssignmentsPage).toHaveBeenCalledWith(USER, {
      month: undefined,
    });
  });

  it('opens the rail at the share saved in the cookie', async () => {
    isAssignmentsEnabled.mockResolvedValue(true);
    cookieJar.set(
      panelLayoutCookieName(ASSIGNMENTS_SIDEBAR_ID),
      JSON.stringify({ key: { layout: [30, 70] } }),
    );
    const page = await route();
    expect(page?.props.defaultLayout).toEqual([30, 70]);
  });

  it('falls back to the default layout without a cookie', async () => {
    isAssignmentsEnabled.mockResolvedValue(true);
    const page = await route();
    expect(page?.props.defaultLayout).toBeUndefined();
  });

  it('hands the URL’s month to the loader', async () => {
    isAssignmentsEnabled.mockResolvedValue(true);
    await route('2026-04');
    expect(loadAssignmentsPage).toHaveBeenCalledWith(USER, {
      month: '2026-04',
    });
  });

  it('404s when the flag is off', async () => {
    isAssignmentsEnabled.mockResolvedValue(false);
    await expect(route()).rejects.toThrow(NOT_FOUND);
    expect(notFound).toHaveBeenCalled();
  });

  it('loads nothing at all when the flag is off', async () => {
    // Every figure on the page is a cost allocation, so an org without the
    // feature would pay for a page of zeros.
    isAssignmentsEnabled.mockResolvedValue(false);
    await expect(route()).rejects.toThrow(NOT_FOUND);
    expect(loadAssignmentsPage).not.toHaveBeenCalled();
    expect(getOrgHierarchyLevelOrder).not.toHaveBeenCalled();
  });

  it('never runs the org-wide allocation spend query', async () => {
    // Monthly figures come from the monthly report's engine run now, not from
    // an org-wide allocation rollup.
    isAssignmentsEnabled.mockResolvedValue(true);
    await route();
    expect(loadAllocationRollupReport).not.toHaveBeenCalled();
  });

  it('asks the flag for the signed-in org', async () => {
    isAssignmentsEnabled.mockResolvedValue(true);
    await route();
    expect(isAssignmentsEnabled).toHaveBeenCalledWith(USER);
  });

  it('renders nothing when nobody is signed in, without asking the flag', async () => {
    getUserMetadata.mockResolvedValue(null);
    expect(await route()).toBeNull();
    expect(isAssignmentsEnabled).not.toHaveBeenCalled();
  });
});
