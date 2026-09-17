process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  startUpload,
  getSnapshot,
  subscribe,
  reset,
  toastRef,
  type SupaClient,
} from '@/app/(app)/(investor)/investor/documents/aumni-upload-manager';

jest.mock(
  '@/app/(app)/(investor)/investor/documents/aumni-upload-state',
  () => ({
    savePending: jest.fn(),
    clearPending: jest.fn(),
    loadPending: jest.fn().mockReturnValue(null),
  }),
);

interface TusOpts {
  onProgress?: (a: number, b: number) => void;
  onSuccess?: () => void;
}

jest.mock('tus-js-client', () => ({
  Upload: jest.fn().mockImplementation((_file: unknown, opts: unknown) => {
    const o = opts as TusOpts;
    return {
      findPreviousUploads: jest
        .fn<() => Promise<unknown[]>>()
        .mockResolvedValue([]),
      resumeFromPreviousUpload: jest.fn(),
      start: jest.fn(() => {
        o.onProgress?.(50, 100);
        o.onSuccess?.();
      }),
      abort: jest.fn(),
    };
  }),
}));

jest.mock('@/utils/helpers', () => ({
  sanitizeFileName: (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_'),
  buildSafePath: (parts: string[]) => parts.join('/'),
  PathTraversalError: class PathTraversalError extends Error {},
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

const SESSION = {
  data: { session: { access_token: 'header.payload.signature' } },
};

type ListResult = Promise<{ data: { name: string }[] | null; error: unknown }>;
type SessionResult = Promise<{
  data: { session: { access_token: string } | null };
}>;

function makeSb(
  listData: { name: string }[] | null = [],
  listError: unknown = null,
): SupaClient {
  const listFn = jest
    .fn<(path: string) => ListResult>()
    .mockResolvedValue({ data: listData, error: listError });
  const fromFn = (_bucket: string) => ({ list: listFn });
  const getSessionFn = jest
    .fn<() => SessionResult>()
    .mockResolvedValue(SESSION);
  return { storage: { from: fromFn }, auth: { getSession: getSessionFn } };
}

function makeFile(name = 'export.zip', size = 1024): File {
  return new File(['x'.repeat(size)], name, { type: 'application/zip' });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function flushPromises() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

const duplicateToast = expect.objectContaining({ title: 'Duplicate file' });
const postMethod = expect.objectContaining({ method: 'POST' });

describe('aumni-upload-manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reset();
    toastRef.current = jest.fn();
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ success: true }));
  });

  it('returns error when organizationId is empty', async () => {
    const err = await startUpload(makeFile(), '', makeSb());
    expect(err).toBe('Organization ID not available');
    expect(getSnapshot().status).toBe('idle');
  });

  it('reports duplicate file error', async () => {
    const err = await startUpload(
      makeFile(),
      'org-1',
      makeSb([{ name: 'export.zip' }]),
    );
    expect(err).toBe('This file has already been uploaded.');
    expect(getSnapshot().status).toBe('error');
    expect(toastRef.current).toHaveBeenCalledWith(duplicateToast);
  });

  it('reports list error when storage list fails', async () => {
    const err = await startUpload(
      makeFile(),
      'org-1',
      makeSb(null, { message: 'fail' }),
    );
    expect(err).toBe('Unable to verify file. Please try again.');
    expect(getSnapshot().status).toBe('error');
  });

  it('uploads via TUS and calls process-aumni-export on success', async () => {
    const err = await startUpload(makeFile(), 'org-1', makeSb());
    await flushPromises();
    expect(err).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v2/investor/process-aumni-export',
      postMethod,
    );
    expect(getSnapshot().status).toBe('uploaded');
  });

  it('reports error when process-aumni-export fails', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'server error' }, 500));
    await startUpload(makeFile(), 'org-1', makeSb());
    await flushPromises();
    expect(getSnapshot().status).toBe('error');
    expect(getSnapshot().errorMessage).toBe('server error');
  });

  it('notifies subscribers on state changes', async () => {
    const listener = jest.fn();
    const unsub = subscribe(listener);
    await startUpload(makeFile(), 'org-1', makeSb());
    await flushPromises();
    expect(listener).toHaveBeenCalled();
    const statuses = listener.mock.calls.map(
      (c) => (c[0] as { status: string }).status,
    );
    expect(statuses).toContain('uploading');
    unsub();
  });

  it('prevents concurrent uploads', async () => {
    await startUpload(makeFile(), 'org-1', makeSb());
    const err = await startUpload(makeFile(), 'org-1', makeSb());
    expect(err).toBe('Upload already in progress');
  });

  it('reports error when session is null', async () => {
    const nullSessionSb = makeSb();
    nullSessionSb.auth.getSession = jest
      .fn<() => SessionResult>()
      .mockResolvedValue({ data: { session: null } });
    const err = await startUpload(makeFile(), 'org-1', nullSessionSb);
    expect(err).toBe('Session expired. Please sign in again.');
    expect(getSnapshot().status).toBe('error');
  });

  it('abort calls tusUpload.abort and resets to idle', async () => {
    const { abort } = await import('../aumni-upload-manager');
    await startUpload(makeFile(), 'org-1', makeSb());
    await flushPromises();
    abort();
    expect(getSnapshot().status).toBe('idle');
  });
});
