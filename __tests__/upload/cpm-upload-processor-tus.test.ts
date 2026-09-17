/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';

interface TusOpts {
  onProgress?: (loaded: number, total: number) => void;
  onChunkComplete?: (
    chunkSize: number,
    bytesAccepted: number,
    bytesTotal: number,
  ) => void;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

const mockUploadInstances: Array<{
  resumeFromPreviousUpload: jest.Mock;
  start: jest.Mock;
}> = [];

let mockStartUpload: (opts: TusOpts) => void = () => {};

jest.mock('tus-js-client', () => ({
  Upload: jest.fn().mockImplementation((_file: unknown, opts: unknown) => {
    const o = opts as TusOpts;
    const instance = {
      findPreviousUploads: jest
        .fn<() => Promise<unknown[]>>()
        .mockResolvedValue([
          {
            uploadUrl:
              'https://test.supabase.co/storage/v1/upload/resumable/old',
            urlStorageKey: 'tus::old',
          },
        ]),
      resumeFromPreviousUpload: jest.fn(),
      start: jest.fn(() => {
        mockStartUpload(o);
      }),
      abort: jest.fn(),
    };
    mockUploadInstances.push(instance);
    return instance;
  }),
  DetailedError: (
    jest.requireActual('tus-js-client') as Record<string, unknown>
  ).DetailedError,
}));

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock('@/hooks/api/useProcessContract', () => ({
  useProcessContract: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/hooks/api/useProcessContractZip', () => ({
  useProcessContractZip: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/data/superuser/contracts', () => ({
  overrideContract: jest.fn(),
}));

jest.mock('@/lib/api/v2-client', () => ({
  apiClient: {
    contracts: {
      verifyZipUpload: jest.fn(),
    },
  },
}));

import { tusUpload } from '@/app/(app)/(cpm)/upload/useCpmUploadProcessor';

let starts = 0;

async function flushPromises(ticks = 5) {
  for (let i = 0; i < ticks; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

describe('CPM tusUpload', () => {
  beforeEach(() => {
    starts = 0;
    mockUploadInstances.length = 0;
    mockStartUpload = () => {};
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('moves progress only from accepted chunks and leaves it on disconnect', async () => {
    const progress = jest.fn();
    const pause = jest.fn();
    const resume = jest.fn();

    mockStartUpload = (o) => {
      starts += 1;
      if (starts === 1) {
        o.onChunkComplete?.(200, 200, 1000);
        o.onProgress?.(800, 1000);
        o.onError?.(new Error('Failed to fetch'));
        return;
      }
      if (starts === 2) {
        o.onProgress?.(1000, 1000);
        o.onChunkComplete?.(800, 1000, 1000);
        o.onSuccess?.();
        return;
      }
      o.onChunkComplete?.(800, 1000, 1000);
      o.onSuccess?.();
    };

    const uploadPromise = tusUpload(
      new File(['x'.repeat(1000)], 'flaky.pdf', { type: 'application/pdf' }),
      'contract_docs',
      'user-1/flaky.pdf',
      'header.payload.signature',
      async () => 'header.payload.signature',
      {
        onProgress: progress,
        onPause: pause,
        onResume: resume,
      },
    ).promise;

    await flushPromises();
    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith(200, 1000);
    expect(pause).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('online'));
    await expect(uploadPromise).resolves.toBeUndefined();

    expect(resume).toHaveBeenCalledTimes(1);
    expect(progress.mock.calls).toEqual([
      [200, 1000],
      [200, 1000],
      [1000, 1000],
    ]);
  });

  it('ignores post-resume raw progress until accepted chunks arrive', async () => {
    const progress = jest.fn();

    mockStartUpload = (o) => {
      starts += 1;
      if (starts === 1) {
        o.onChunkComplete?.(200, 200, 1000);
        o.onProgress?.(800, 1000);
        o.onError?.(new Error('Failed to fetch'));
        return;
      }
      if (starts === 2) {
        o.onProgress?.(700, 1000);
        o.onChunkComplete?.(400, 600, 1000);
        o.onProgress?.(800, 1000);
        o.onChunkComplete?.(400, 1000, 1000);
        o.onSuccess?.();
      }
    };

    const uploadPromise = tusUpload(
      new File(['x'.repeat(1000)], 'resume.pdf', { type: 'application/pdf' }),
      'contract_docs',
      'user-1/resume.pdf',
      'header.payload.signature',
      async () => 'header.payload.signature',
      {
        onProgress: progress,
      },
    ).promise;

    await flushPromises();
    window.dispatchEvent(new Event('online'));
    await expect(uploadPromise).resolves.toBeUndefined();

    expect(progress.mock.calls).toEqual([
      [200, 1000],
      [200, 1000],
      [600, 1000],
      [1000, 1000],
    ]);
  });

  it('ignores raw progress before the first accepted chunk', async () => {
    const progress = jest.fn();

    mockStartUpload = (o) => {
      o.onProgress?.(250, 1000);
      o.onChunkComplete?.(500, 500, 1000);
      o.onSuccess?.();
    };

    await tusUpload(
      new File(['x'.repeat(1000)], 'slow.pdf', { type: 'application/pdf' }),
      'contract_docs',
      'user-1/slow.pdf',
      'header.payload.signature',
      async () => 'header.payload.signature',
      {
        onProgress: progress,
      },
    ).promise;

    expect(progress.mock.calls).toEqual([[500, 1000]]);
  });

  it('does not increase tentative progress while the browser is offline', async () => {
    const progress = jest.fn();

    mockStartUpload = (o) => {
      o.onChunkComplete?.(110, 110, 1000);
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });
      window.dispatchEvent(new Event('offline'));
      o.onProgress?.(170, 1000);
      o.onError?.(new Error('Failed to fetch'));
    };

    try {
      const uploadPromise = tusUpload(
        new File(['x'.repeat(1000)], 'offline.pdf', {
          type: 'application/pdf',
        }),
        'contract_docs',
        'user-1/offline.pdf',
        'header.payload.signature',
        async () => 'header.payload.signature',
        {
          onProgress: progress,
        },
      ).promise;

      await flushPromises();

      expect(progress.mock.calls).toEqual([
        [110, 1000],
        [110, 1000],
        [110, 1000],
        [110, 1000],
      ]);
      expect(progress).not.toHaveBeenCalledWith(170, 1000);

      mockStartUpload = (o) => {
        o.onChunkComplete?.(890, 1000, 1000);
        o.onSuccess?.();
      };
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('online'));
      await expect(uploadPromise).resolves.toBeUndefined();
    } finally {
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
      });
    }
  });

  it('suppresses chunk progress while network is paused', async () => {
    const progress = jest.fn();

    mockStartUpload = (o) => {
      o.onChunkComplete?.(110, 110, 1000);
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });
      window.dispatchEvent(new Event('offline'));
      o.onProgress?.(170, 1000);
      o.onChunkComplete?.(60, 170, 1000);
      o.onSuccess?.();
    };

    try {
      await tusUpload(
        new File(['x'.repeat(1000)], 'committed-while-offline.pdf', {
          type: 'application/pdf',
        }),
        'contract_docs',
        'user-1/committed-while-offline.pdf',
        'header.payload.signature',
        async () => 'header.payload.signature',
        {
          onProgress: progress,
        },
      ).promise;

      expect(progress.mock.calls).toEqual([
        [110, 1000],
        [110, 1000],
        [110, 1000],
        [110, 1000],
      ]);
    } finally {
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
      });
    }
  });

  it('clears stale stored tus fingerprints instead of resuming an old URL', async () => {
    localStorage.setItem('tus::old', 'stale');
    mockStartUpload = (o) => o.onSuccess?.();

    await tusUpload(
      new File(['pdf'], 'same-name.pdf', { type: 'application/pdf' }),
      'contract_docs',
      'user-1/same-name.pdf',
      'header.payload.signature',
      async () => 'header.payload.signature',
      {
        onProgress: jest.fn(),
      },
    ).promise;

    expect(localStorage.getItem('tus::old')).toBeNull();
    expect(
      mockUploadInstances[0].resumeFromPreviousUpload,
    ).not.toHaveBeenCalled();
    expect(mockUploadInstances[0].start).toHaveBeenCalledTimes(1);
  });
});
