import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { isFeatureEnabled as IsFeatureEnabled } from '@/lib/flagkit';

const isFeatureEnabled = jest.fn<typeof IsFeatureEnabled>();
const loggerError = jest.fn();

jest.mock('@/lib/flagkit', () => ({ isFeatureEnabled }));
jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: { error: loggerError },
}));

import { isPortfolioHidden } from '../portfolioVisibility';

describe('isPortfolioHidden', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when the hide-portfolio flag is enabled', async () => {
    isFeatureEnabled.mockResolvedValue(true);

    const result = await isPortfolioHidden('user-1', 'org-1');

    expect(result).toBe(true);
    expect(isFeatureEnabled).toHaveBeenCalledWith('hide-portfolio', {
      userId: 'user-1',
      organizationId: 'org-1',
    });
  });

  it('returns false when the flag is disabled', async () => {
    isFeatureEnabled.mockResolvedValue(false);

    const result = await isPortfolioHidden('user-1', 'org-1');

    expect(result).toBe(false);
  });

  it('short-circuits to false without evaluating the flag when userId is missing', async () => {
    const result = await isPortfolioHidden(null, 'org-1');

    expect(result).toBe(false);
    expect(isFeatureEnabled).not.toHaveBeenCalled();
  });

  it('fails open (false) and logs when flag evaluation throws', async () => {
    const error = new Error('flag store unreachable');
    isFeatureEnabled.mockRejectedValue(error);

    const result = await isPortfolioHidden('user-1', 'org-1');

    expect(result).toBe(false);
    expect(loggerError).toHaveBeenCalledWith(
      { error },
      'Failed to evaluate hide-portfolio feature flag',
    );
  });

  it('forwards an empty string when organizationId is nullish', async () => {
    isFeatureEnabled.mockResolvedValue(false);

    await isPortfolioHidden('user-1', null);

    expect(isFeatureEnabled).toHaveBeenCalledWith('hide-portfolio', {
      userId: 'user-1',
      organizationId: '',
    });
  });
});
