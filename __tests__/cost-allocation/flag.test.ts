const isFeatureEnabled = jest.fn();
jest.mock('@/lib/flagkit', () => ({
  isFeatureEnabled: (...args: unknown[]) => isFeatureEnabled(...args),
}));
const loggerError = jest.fn();
jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: { error: loggerError, info: jest.fn(), warn: jest.fn() },
}));

import {
  COST_ALLOCATION_FLAG_KEY,
  isCostAllocationEnabled,
} from '@/lib/v2/cost-allocation/flag';

const ORG = { organizationId: 'org-1', userId: 'user-1' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isCostAllocationEnabled', () => {
  it('asks the cost-allocation flag for the org and user', async () => {
    isFeatureEnabled.mockResolvedValue(true);

    expect(await isCostAllocationEnabled(ORG, {})).toBe(true);
    expect(isFeatureEnabled).toHaveBeenCalledWith(COST_ALLOCATION_FLAG_KEY, {
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('is off when the flag says so', async () => {
    isFeatureEnabled.mockResolvedValue(false);

    expect(await isCostAllocationEnabled(ORG, {})).toBe(false);
  });

  it('passes an empty userId where the caller has none', async () => {
    isFeatureEnabled.mockResolvedValue(true);

    await isCostAllocationEnabled({ organizationId: 'org-1' }, {});
    expect(isFeatureEnabled).toHaveBeenCalledWith(COST_ALLOCATION_FLAG_KEY, {
      organizationId: 'org-1',
      userId: '',
    });
  });

  it('fails closed, and says so, when evaluation throws', async () => {
    isFeatureEnabled.mockRejectedValue(new Error('flag store down'));

    expect(await isCostAllocationEnabled(ORG, {})).toBe(false);
    expect(loggerError).toHaveBeenCalled();
  });

  it('FF_COST_ALLOCATION=true overrides the flag — exactly "true", nothing else', async () => {
    isFeatureEnabled.mockResolvedValue(false);

    expect(
      await isCostAllocationEnabled(ORG, { FF_COST_ALLOCATION: 'true' }),
    ).toBe(true);
    expect(isFeatureEnabled).not.toHaveBeenCalled();

    for (const value of ['TRUE', '1', 'false']) {
      expect(
        await isCostAllocationEnabled(ORG, { FF_COST_ALLOCATION: value }),
      ).toBe(false);
    }
  });

  it('reads process.env by default', async () => {
    const previous = process.env.FF_COST_ALLOCATION;
    try {
      process.env.FF_COST_ALLOCATION = 'true';
      expect(await isCostAllocationEnabled(ORG)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.FF_COST_ALLOCATION;
      else process.env.FF_COST_ALLOCATION = previous;
    }
  });
});
