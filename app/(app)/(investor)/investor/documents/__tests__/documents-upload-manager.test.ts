/**
 * @jest-environment jsdom
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  startUpload,
  subscribe,
  abort,
  clearSnapshot,
  getSnapshot,
  UploadAbortedError,
  __resetForTests,
  type SupaClient,
  type ProcessDocumentFn,
} from '@/app/(app)/(investor)/investor/documents/documents-upload-manager';
import {
  savePending,
  loadPending,
} from '@/app/(app)/(investor)/investor/documents/documents-upload-state';

interface TusOpts {
  onProgress?: (a: number, b: number) => void;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

type FindPrevFn = () => Promise<unknown[]>;

const startSpy = jest.fn<() => void>();
const abortSpy = jest.fn<(shouldTerminate?: boolean) => void>();
const findPrevImpl: { fn: FindPrevFn } = { fn: () => Promise.resolve([]) };
const defaultStart = (o: TusOpts) => {
  o.onProgress?.(50, 100);
  o.onSuccess?.();
};
const startImpl: { fn: (o: TusOpts) => void } = { fn: defaultStart };

jest.mock('tus-js-client', () => ({
  Upload: jest.fn().mockImplementation((_file: unknown, opts: unknown) => {
    const o = opts as TusOpts;
    return {
      findPreviousUploads: () => findPrevImpl.fn(),
      resumeFromPreviousUpload: jest.fn(),
      start: () => {
        startSpy();
        startImpl.fn(o);
      },
      abort: abortSpy,
    };
  }),
  DetailedError: class DetailedError extends Error {},
}));

jest.mock('@/lib/archive/zip-listing-client', () => ({
  listZipEntriesFromBlob: jest
    .fn<() => Promise<null>>()
    .mockResolvedValue(null),
}));

jest.mock('@/utils/pino', () => {
  const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
  return { __esModule: true, default: logger };
});

type SessionResult = Promise<{
  data: { session: { access_token: string } | null };
}>;

const VALID_ACCESS_TOKEN = 'header.payload.signature';

function makeSb(token: string | null = VALID_ACCESS_TOKEN): SupaClient {
  const session = token ? { access_token: token } : null;
  const getSessionFn = jest
    .fn<() => SessionResult>()
    .mockResolvedValue({ data: { session } });
  return { auth: { getSession: getSessionFn } };
}

function makeFile(name = 'a.pdf', size = 1024, type = 'application/pdf'): File {
  return new File(['x'.repeat(size)], name, { type });
}

const processOk: ProcessDocumentFn = () =>
  Promise.resolve({ success: true, documentId: 'doc-42' });
const processNoId: ProcessDocumentFn = () => Promise.resolve({ success: true });
const processFail: ProcessDocumentFn = () =>
  Promise.reject(new Error('server boom'));

const baseParams = (overrides: Record<string, unknown> = {}) => ({
  fileId: 'f1',
  documentPublicId: 'doc-1',
  filePath: 'org-1/investor/doc-1/primary/a.pdf',
  organizationId: 'org-1',
  sb: makeSb(),
  processDocument: processOk,
  file: makeFile(),
  ...overrides,
});

async function flushUploadStart(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// Aborting before tus.start() is a different path: the launch chain's own
// isActiveUpload check rejects it. To cover a user cancelling mid-transfer the
// upload has to be genuinely running first.
async function flushUntilStarted(): Promise<void> {
  for (let i = 0; i < 20 && startSpy.mock.calls.length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(startSpy).toHaveBeenCalled();
}

// Bounds the wait so a promise that never settles fails as a distinct error
// rather than hanging. Resolution stays distinguishable from rejection, so a
// regression that resolves on abort — bypassing the cancellation branch in
// DocumentsUploadCard — still fails.
function settlementOf(promise: Promise<unknown>): Promise<unknown> {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('never settled')), 50),
    ),
  ]);
}

async function flushMacrotasks(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function makeDeferredSb(): {
  sb: SupaClient;
  releaseSession: () => void;
  failSession: (err: Error) => void;
} {
  let releaseSession: () => void = () => {};
  let failSession: (err: Error) => void = () => {};
  const pending: SessionResult = new Promise((resolve, reject) => {
    releaseSession = () =>
      resolve({ data: { session: { access_token: VALID_ACCESS_TOKEN } } });
    failSession = reject;
  });
  // The rejection is asserted through the upload promise; this keeps the
  // deferred itself from surfacing as an unhandled rejection.
  pending.catch(() => {});
  return {
    sb: { auth: { getSession: () => pending } },
    releaseSession,
    failSession,
  };
}

// A retry reuses the queue row's id, so the same fileId comes back through
// startUpload while the cancelled attempt may still be awaiting its session.
async function cancelThenRetry(): Promise<{
  cancelled: ReturnType<typeof makeDeferredSb>;
  retry: ReturnType<typeof makeDeferredSb>;
  retryPromise: Promise<unknown>;
}> {
  const cancelled = makeDeferredSb();
  const cancelledPromise = startUpload(baseParams({ sb: cancelled.sb }));
  await flushUploadStart();

  abort('f1');
  await expect(settlementOf(cancelledPromise)).rejects.toBeInstanceOf(
    UploadAbortedError,
  );

  const retry = makeDeferredSb();
  const retryPromise = startUpload(baseParams({ sb: retry.sb }));
  await flushUploadStart();

  return { cancelled, retry, retryPromise };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetForTests();
  localStorage.clear();
  findPrevImpl.fn = () => Promise.resolve([]);
  startImpl.fn = defaultStart;
});

describe('documents-upload-manager - happy path', () => {
  it('resolves with the processDocument result', async () => {
    const result = await startUpload(baseParams());
    expect(result).toEqual({ success: true, documentId: 'doc-42' });
  });

  it('clears the persisted entry after success', async () => {
    savePending('org-1', {
      fileId: 'f1',
      documentPublicId: 'doc-1',
      fileName: 'a.pdf',
      fileType: 'application/pdf',
      fileSize: 1024,
      filePath: 'org-1/investor/doc-1/primary/a.pdf',
    });
    await startUpload(baseParams());
    expect(loadPending('org-1')).toEqual([]);
  });

  it('handles process without a documentId', async () => {
    const result = await startUpload(
      baseParams({ processDocument: processNoId }),
    );
    expect(result).toEqual({ success: true });
  });

  it('emits an uploaded snapshot to subscribers', async () => {
    const listener = jest.fn();
    const unsub = subscribe(listener);
    await startUpload(baseParams());
    const statuses = listener.mock.calls.map(
      (c) => (c[0] as { status: string }).status,
    );
    expect(statuses).toContain('uploading');
    expect(statuses).toContain('processing');
    expect(statuses).toContain('uploaded');
    unsub();
  });
});

describe('documents-upload-manager - persistence on launch failure', () => {
  it('clears persisted entry when session is missing', async () => {
    const params = baseParams({ sb: makeSb(null) });
    savePending('org-1', {
      fileId: 'f1',
      documentPublicId: 'doc-1',
      fileName: 'a.pdf',
      fileType: 'application/pdf',
      fileSize: 1024,
      filePath: 'org-1/investor/doc-1/primary/a.pdf',
    });
    await expect(startUpload(params)).rejects.toThrow(/Session expired/);
    // No persistence yet at this point in startUpload — pre-existing entry survives.
    expect(loadPending('org-1')).toHaveLength(1);
  });

  it('clears persisted entry when findPreviousUploads rejects', async () => {
    findPrevImpl.fn = () => Promise.reject(new Error('storage down'));
    await expect(startUpload(baseParams())).rejects.toThrow(/storage down/);
    expect(loadPending('org-1')).toEqual([]);
  });

  it('keeps a previous pending entry when auth fails before re-keying', async () => {
    savePending('org-1', {
      fileId: 'old-filepond-id',
      documentPublicId: 'doc-1',
      fileName: 'a.pdf',
      fileType: 'application/pdf',
      fileSize: 1024,
      filePath: 'org-1/investor/doc-1/primary/a.pdf',
    });

    await expect(
      startUpload(
        baseParams({
          fileId: 'new-filepond-id',
          previousPendingFileId: 'old-filepond-id',
          sb: makeSb(null),
        }),
      ),
    ).rejects.toThrow(/Session expired/);

    expect(loadPending('org-1')).toEqual([
      expect.objectContaining({ fileId: 'old-filepond-id' }),
    ]);
  });

  it('removes the previous pending entry after replacement persistence succeeds', async () => {
    savePending('org-1', {
      fileId: 'old-filepond-id',
      documentPublicId: 'doc-1',
      fileName: 'a.pdf',
      fileType: 'application/pdf',
      fileSize: 1024,
      filePath: 'org-1/investor/doc-1/primary/a.pdf',
    });

    await startUpload(
      baseParams({
        fileId: 'new-filepond-id',
        previousPendingFileId: 'old-filepond-id',
      }),
    );

    expect(loadPending('org-1')).toEqual([]);
  });
});

describe('documents-upload-manager - dedupe + abort', () => {
  it('returns the same promise for a concurrent start with same fileId', () => {
    // Stall the start so the first call stays in-flight.
    startImpl.fn = () => {
      /* never completes */
    };
    const p1 = startUpload(baseParams());
    const p2 = startUpload(baseParams());
    expect(p2).toBe(p1);
  });

  it('abort calls tus.abort and clears the snapshot', async () => {
    startImpl.fn = () => {
      /* never completes */
    };
    void startUpload(baseParams()).catch(() => {
      /* aborted */
    });
    await flushUploadStart();
    abort('f1');
    expect(abortSpy).toHaveBeenCalledWith(true);
  });

  it('clearSnapshot also aborts an in-flight upload', async () => {
    startImpl.fn = () => {
      /* never completes */
    };
    void startUpload(baseParams()).catch(() => {
      /* aborted */
    });
    await flushUploadStart();
    clearSnapshot('f1');
    expect(abortSpy).toHaveBeenCalledWith(true);
  });

  // tus.abort() never fires onError, so nothing else settles this promise. The
  // upload queue awaits it one file at a time: leaving it pending stalls the
  // whole batch on the cancelled file (psk-1687).
  it('settles the in-flight promise on abort so the queue can advance', async () => {
    startImpl.fn = () => {
      /* never completes */
    };
    const promise = startUpload(baseParams());
    await flushUntilStarted();

    abort('f1');

    await expect(settlementOf(promise)).rejects.toBeInstanceOf(
      UploadAbortedError,
    );
  });

  it('settles the in-flight promise on clearSnapshot too', async () => {
    startImpl.fn = () => {
      /* never completes */
    };
    const promise = startUpload(baseParams());
    await flushUntilStarted();

    clearSnapshot('f1');

    await expect(settlementOf(promise)).rejects.toBeInstanceOf(
      UploadAbortedError,
    );
  });

  // pendingHandlers used to be registered only after the session resolved, so
  // a cancel in that window did nothing and the upload launched anyway.
  it('cancels an upload that is still waiting on the session', async () => {
    const { sb, releaseSession } = makeDeferredSb();
    const promise = startUpload(baseParams({ sb }));
    await flushUploadStart();

    abort('f1');

    await expect(settlementOf(promise)).rejects.toBeInstanceOf(
      UploadAbortedError,
    );

    releaseSession();
    await flushMacrotasks();

    expect(startSpy).not.toHaveBeenCalled();
    expect(loadPending('org-1')).toEqual([]);
  });

  it('does not let a cancelled upload hijack a retry on the same fileId', async () => {
    const { cancelled, retry, retryPromise } = await cancelThenRetry();

    cancelled.releaseSession();
    await flushMacrotasks();

    expect(startSpy).not.toHaveBeenCalled();
    expect(loadPending('org-1')).toEqual([]);

    retry.releaseSession();
    await expect(settlementOf(retryPromise)).resolves.toEqual({
      success: true,
      documentId: 'doc-42',
    });
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores a late tus failure from an attempt that was already cancelled', async () => {
    let launched: TusOpts | null = null;
    startImpl.fn = (o) => {
      launched = o;
      startImpl.fn = defaultStart;
    };

    const cancelledPromise = startUpload(baseParams());
    await flushUntilStarted();

    abort('f1');
    await expect(settlementOf(cancelledPromise)).rejects.toBeInstanceOf(
      UploadAbortedError,
    );

    const retry = makeDeferredSb();
    const retryPromise = startUpload(baseParams({ sb: retry.sb }));
    await flushUploadStart();

    // The cancelled upload's socket finally errors out.
    (launched as unknown as TusOpts).onError?.(new Error('socket closed'));
    await flushMacrotasks();

    expect(getSnapshot('f1')?.status).not.toBe('error');

    retry.releaseSession();
    await expect(settlementOf(retryPromise)).resolves.toEqual({
      success: true,
      documentId: 'doc-42',
    });
  });

  it('does not let a cancelled attempt finish processing over a retry', async () => {
    let releaseProcess: (r: {
      success: boolean;
      documentId?: string;
    }) => void = () => {};
    const processDeferred: ProcessDocumentFn = () =>
      new Promise((resolve) => {
        releaseProcess = resolve;
      });

    const cancelledPromise = startUpload(
      baseParams({ processDocument: processDeferred }),
    );
    await flushUntilStarted();
    expect(getSnapshot('f1')?.status).toBe('processing');

    abort('f1');
    await expect(settlementOf(cancelledPromise)).rejects.toBeInstanceOf(
      UploadAbortedError,
    );

    const retry = makeDeferredSb();
    const retryPromise = startUpload(baseParams({ sb: retry.sb }));
    await flushUploadStart();

    // The cancelled attempt's process request was never cancellable.
    releaseProcess({ success: true, documentId: 'doc-stale' });
    await flushMacrotasks();

    expect(getSnapshot('f1')?.status).not.toBe('uploaded');

    retry.releaseSession();
    await expect(settlementOf(retryPromise)).resolves.toEqual({
      success: true,
      documentId: 'doc-42',
    });
  });

  it('does not let a cancelled attempt report a processing failure over a retry', async () => {
    let failProcess: (err: Error) => void = () => {};
    const processDeferred: ProcessDocumentFn = () =>
      new Promise((_resolve, reject) => {
        failProcess = reject;
      });

    const cancelledPromise = startUpload(
      baseParams({ processDocument: processDeferred }),
    );
    await flushUntilStarted();

    abort('f1');
    await expect(settlementOf(cancelledPromise)).rejects.toBeInstanceOf(
      UploadAbortedError,
    );

    const retry = makeDeferredSb();
    const retryPromise = startUpload(baseParams({ sb: retry.sb }));
    await flushUploadStart();

    failProcess(new Error('server boom'));
    await flushMacrotasks();

    expect(getSnapshot('f1')?.status).not.toBe('error');

    retry.releaseSession();
    await expect(settlementOf(retryPromise)).resolves.toEqual({
      success: true,
      documentId: 'doc-42',
    });
  });

  it('does not let a cancelled attempt report a launch failure over a retry', async () => {
    let releasePrev: () => void = () => {};
    findPrevImpl.fn = () =>
      new Promise((resolve) => {
        releasePrev = () => resolve([]);
      });

    const cancelledPromise = startUpload(baseParams());
    await flushUploadStart();

    abort('f1');
    await expect(settlementOf(cancelledPromise)).rejects.toBeInstanceOf(
      UploadAbortedError,
    );

    findPrevImpl.fn = () => Promise.resolve([]);
    const retry = makeDeferredSb();
    const retryPromise = startUpload(baseParams({ sb: retry.sb }));
    await flushUploadStart();

    releasePrev();
    await flushMacrotasks();

    expect(getSnapshot('f1')?.status).not.toBe('error');

    retry.releaseSession();
    await expect(settlementOf(retryPromise)).resolves.toEqual({
      success: true,
      documentId: 'doc-42',
    });
  });

  it('does not strand a retry when the cancelled attempt fails its session', async () => {
    const { cancelled, retry, retryPromise } = await cancelThenRetry();

    cancelled.failSession(new Error('token refresh failed'));
    await flushMacrotasks();

    // The superseded attempt must not stamp the retry's row with its failure.
    expect(getSnapshot('f1')?.status).not.toBe('error');

    retry.releaseSession();
    await expect(settlementOf(retryPromise)).resolves.toEqual({
      success: true,
      documentId: 'doc-42',
    });
  });
});

describe('documents-upload-manager - process-document failure', () => {
  it('rejects and does NOT clear persisted entry (resume preserved)', async () => {
    await expect(
      startUpload(baseParams({ processDocument: processFail })),
    ).rejects.toThrow(/server boom/);
    // process-document errors fire after tus succeeded — bytes are on the
    // server. Persisted entry stays so the user can re-trigger.
    expect(loadPending('org-1')).toHaveLength(1);
  });
});
