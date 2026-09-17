import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';

jest.mock('@/utils/pino', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

import logger from '@/utils/pino';
import { timed } from '@/utils/logging/timed';

const mockDebug = logger.debug as jest.Mock;

describe('timed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(250.4);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the wrapped result and logs a rounded duration at debug level', async () => {
    const result = await timed('contracts.getContractsList', async () => 42);

    expect(result).toBe(42);
    expect(mockDebug).toHaveBeenCalledTimes(1);
    expect(mockDebug).toHaveBeenCalledWith(
      {
        event: 'timing',
        label: 'contracts.getContractsList',
        durationMs: 150,
      },
      'contracts.getContractsList',
    );
  });

  it('spreads context fields into the log payload', async () => {
    await timed('spend.query', async () => null, {
      kind: 'spend',
      window: 'currentFY',
    });

    const [payload] = mockDebug.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toEqual({
      kind: 'spend',
      window: 'currentFY',
      event: 'timing',
      label: 'spend.query',
      durationMs: 150,
    });
  });

  it('still logs the duration when the call throws, then rethrows', async () => {
    const failure = new Error('boom');

    await expect(
      timed('contracts.getContractsList', async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(mockDebug).toHaveBeenCalledTimes(1);
    const [payload] = mockDebug.mock.calls[0] as [Record<string, unknown>];
    expect(payload.durationMs).toBe(150);
  });
});
