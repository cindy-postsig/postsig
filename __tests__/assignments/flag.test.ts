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
  ASSIGNMENTS_FLAG_KEY,
  isAssignmentsEnabled,
} from '@/lib/v2/assignments/flag';

const ORG = { organizationId: 'org-1', userId: 'user-1' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isAssignmentsEnabled', () => {
  it('asks the assignments flag for the org and user', async () => {
    isFeatureEnabled.mockResolvedValue(true);

    expect(await isAssignmentsEnabled(ORG, {})).toBe(true);
    expect(isFeatureEnabled).toHaveBeenCalledWith(ASSIGNMENTS_FLAG_KEY, {
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('asks its own flag, never the cost-allocation one', async () => {
    isFeatureEnabled.mockResolvedValue(true);

    await isAssignmentsEnabled(ORG, {});
    expect(ASSIGNMENTS_FLAG_KEY).toBe('assignments');
    expect(isFeatureEnabled).not.toHaveBeenCalledWith(
      'cost-allocation',
      expect.anything(),
    );
  });

  it('is off when the flag says so', async () => {
    isFeatureEnabled.mockResolvedValue(false);

    expect(await isAssignmentsEnabled(ORG, {})).toBe(false);
  });

  it('passes an empty userId where the caller has none', async () => {
    isFeatureEnabled.mockResolvedValue(true);

    await isAssignmentsEnabled({ organizationId: 'org-1' }, {});
    expect(isFeatureEnabled).toHaveBeenCalledWith(ASSIGNMENTS_FLAG_KEY, {
      organizationId: 'org-1',
      userId: '',
    });
  });

  it('fails closed, and says so, when evaluation throws', async () => {
    isFeatureEnabled.mockRejectedValue(new Error('flag store down'));

    expect(await isAssignmentsEnabled(ORG, {})).toBe(false);
    expect(loggerError).toHaveBeenCalled();
  });

  it('FF_ASSIGNMENTS=true overrides the flag — exactly "true", nothing else', async () => {
    isFeatureEnabled.mockResolvedValue(false);

    expect(await isAssignmentsEnabled(ORG, { FF_ASSIGNMENTS: 'true' })).toBe(
      true,
    );
    expect(isFeatureEnabled).not.toHaveBeenCalled();

    for (const value of ['TRUE', '1', 'false']) {
      expect(await isAssignmentsEnabled(ORG, { FF_ASSIGNMENTS: value })).toBe(
        false,
      );
    }
  });

  it('is not switched on by the cost-allocation override', async () => {
    isFeatureEnabled.mockResolvedValue(false);

    expect(
      await isAssignmentsEnabled(ORG, { FF_COST_ALLOCATION: 'true' }),
    ).toBe(false);
  });

  it('reads process.env by default', async () => {
    const previous = process.env.FF_ASSIGNMENTS;
    try {
      process.env.FF_ASSIGNMENTS = 'true';
      expect(await isAssignmentsEnabled(ORG)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.FF_ASSIGNMENTS;
      else process.env.FF_ASSIGNMENTS = previous;
    }
  });
});
