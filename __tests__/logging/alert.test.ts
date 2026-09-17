import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('@/utils/pino', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

import logger from '@/utils/pino';
import { logAlert } from '@/utils/logging/alert';

const mockError = logger.error as jest.Mock;

describe('logAlert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs at error level', () => {
    logAlert('contract-processing-failure', new Error('boom'), {}, 'msg');

    expect(mockError).toHaveBeenCalledTimes(1);
  });

  it('emits the alert code, error, and all context fields', () => {
    const error = new Error('extraction blew up');
    const context = {
      processName: 'contracts/extract',
      contractId: 42,
      fileName: 'deal.pdf',
      userId: 'user-1',
      organizationId: 'org-1',
    };

    logAlert('contract-processing-failure', error, context, 'Contract failed');

    const [payload, message] = mockError.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];

    expect(payload).toEqual({
      ...context,
      alert: 'contract-processing-failure',
      error,
    });
    expect(message).toBe('Contract failed');
  });

  it('keeps the alert code and error even if context carries the same keys', () => {
    logAlert(
      'openai-file-processing-failure',
      new Error('real'),
      { alert: 'spoofed', error: 'spoofed' } as Record<string, unknown>,
      'msg',
    );

    const [payload] = mockError.mock.calls[0] as [Record<string, unknown>];

    expect(payload.alert).toBe('openai-file-processing-failure');
    expect(payload.error).toBeInstanceOf(Error);
  });
});
