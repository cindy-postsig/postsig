import * as tus from 'tus-js-client';
import { v4 as uuidv4 } from 'uuid';
import {
  buildTusOptions,
  clearStaleTusFingerprint,
  isActiveUpload,
  isNetworkError,
  isOffline,
  registerActiveUpload,
  unregisterActiveUpload,
  type TokenGetter,
  type TusCallbacks,
} from '@/lib/upload/tus-upload';
import {
  sanitizeFileName,
  buildSafePath,
  PathTraversalError,
} from '@/utils/helpers';
import {
  listZipEntriesFromBlob,
  type PersistedZipListing,
} from '@/lib/archive/zip-listing-client';
import logger from '@/utils/pino';
import {
  savePending,
  clearPending,
} from '@/app/(app)/(investor)/investor/documents/aumni-upload-state';

export type ManagerStatus = 'idle' | 'uploading' | 'uploaded' | 'error';

export interface UploadSnapshot {
  status: ManagerStatus;
  fileName: string | null;
  errorMessage?: string;
  loaded: number;
  total: number;
}

type Listener = (snapshot: UploadSnapshot) => void;

interface ToastOpts {
  variant?: 'destructive';
  title: string;
  description: string;
}

interface StorageClient {
  from: (bucket: string) => {
    list: (path: string) => Promise<{
      data: { name: string }[] | null;
      error: unknown;
    }>;
  };
}

interface AuthClient {
  getSession: () => Promise<{
    data: { session: { access_token: string } | null };
  }>;
}

export interface SupaClient {
  storage: StorageClient;
  auth: AuthClient;
}

const IDLE: UploadSnapshot = {
  status: 'idle',
  fileName: null,
  loaded: 0,
  total: 0,
};

function buildUploadPath(orgId: string, name: string): string | null {
  try {
    return buildSafePath([orgId, 'aumni_export', name]);
  } catch (err) {
    if (err instanceof PathTraversalError) return null;
    throw err;
  }
}

async function checkDuplicate(
  sb: SupaClient,
  folder: string,
  name: string,
): Promise<'ok' | 'duplicate' | 'list-error'> {
  const { data, error } = await sb.storage.from(aumniBucket()).list(folder);
  if (error) return 'list-error';
  if (data?.some((f) => f.name === name)) return 'duplicate';
  return 'ok';
}

async function registerExport(
  fileName: string,
  filePath: string,
  fileSize: number,
  zipRef: { current: PersistedZipListing | null },
): Promise<void> {
  const body = JSON.stringify({
    fileName,
    filePath,
    fileSize,
    ...(zipRef.current ? { zipListing: zipRef.current } : {}),
  });

  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch('/api/v2/investor/process-aumni-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (response.ok) return;

    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || `API error: ${response.status}`);

    // Only retry on 401 — session may have refreshed in the background.
    const shouldRetry = response.status === 401 && attempt < maxAttempts - 1;
    if (!shouldRetry) throw error;
  }
}

function aumniBucket(): string {
  return process.env.NEXT_PUBLIC_FILE_UPLOAD_BUCKET ?? 'documents';
}

interface SuccessCtx {
  organizationId: string;
  sanitizedName: string;
  safePath: string;
  fileSize: number;
  listingPromise: Promise<void>;
  zipRef: { current: PersistedZipListing | null };
}

async function finalizeUpload(ctx: SuccessCtx): Promise<void> {
  await ctx.listingPromise;
  await registerExport(
    ctx.sanitizedName,
    ctx.safePath,
    ctx.fileSize,
    ctx.zipRef,
  );
  clearPending(ctx.organizationId);
}

function makeSnapshot(
  status: ManagerStatus,
  name: string | null,
  loaded = 0,
  total = 0,
  errorMessage?: string,
): UploadSnapshot {
  return { status, fileName: name, loaded, total, errorMessage };
}

// --- Module-level singleton state ---

let snapshot: UploadSnapshot = { ...IDLE };
const listeners = new Set<Listener>();
let tusUpload: tus.Upload | null = null;
let networkPaused = false;
let acceptedLoaded = 0;
let currentOrgId: string | null = null;

function waitForOnline(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    window.addEventListener('online', () => resolve(), { once: true });
  });
}

export const toastRef: { current: ((opts: ToastOpts) => void) | null } = {
  current: null,
};

function emit(next: UploadSnapshot) {
  snapshot = next;
  listeners.forEach((fn) => fn(next));
}

function reportFail(fileName: string, title: string, message: string) {
  logger.error({ error: message, fileName }, 'Aumni upload error');
  if (tusUpload) unregisterActiveUpload(tusUpload);
  tusUpload = null;
  networkPaused = false;
  acceptedLoaded = 0;
  emit(makeSnapshot('error', fileName, 0, 0, message));
  toastRef.current?.({
    variant: 'destructive',
    title,
    description: message,
  });
}

function onTusComplete(ctx: SuccessCtx) {
  finalizeUpload(ctx)
    .then(() => onFinalizeSuccess(ctx))
    .catch((err) => onFinalizeError(ctx.sanitizedName, err));
}

function onFinalizeSuccess(ctx: SuccessCtx) {
  if (tusUpload) unregisterActiveUpload(tusUpload);
  tusUpload = null;
  networkPaused = false;
  acceptedLoaded = 0;
  emit(makeSnapshot('uploaded', ctx.sanitizedName, ctx.fileSize, ctx.fileSize));
  toastRef.current?.({
    title: 'Aumni import started',
    description: 'Your portfolio will update shortly.',
  });
  fetch('/api/v2/investor/notify-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileNames: [ctx.sanitizedName],
      source: 'aumni',
      sessionId: uuidv4(),
    }),
  })
    .then((res) => {
      if (!res.ok) {
        logger.warn(
          { status: res.status, fileName: ctx.sanitizedName },
          'notify-upload returned non-OK response',
        );
      }
    })
    .catch((err) => {
      logger.warn(
        { err, fileName: ctx.sanitizedName },
        'notify-upload request failed',
      );
    });
}

function onFinalizeError(name: string, err: unknown) {
  const msg =
    err instanceof Error ? err.message : 'Post-upload processing failed';
  reportFail(name, 'Import failed', msg);
}

export function getSnapshot(): UploadSnapshot {
  return snapshot;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isActive(): boolean {
  return snapshot.status === 'uploading';
}

export function abort() {
  if (tusUpload) {
    tusUpload.abort();
    unregisterActiveUpload(tusUpload);
  }
  tusUpload = null;
  networkPaused = false;
  acceptedLoaded = 0;
  emit({ ...IDLE });
}

export function reset() {
  if (currentOrgId) clearPending(currentOrgId);
  abort();
  currentOrgId = null;
}

function handleNetworkPause(fileName: string): void {
  networkPaused = true;
  emit(
    makeSnapshot(
      'uploading',
      fileName,
      acceptedLoaded,
      snapshot.total,
      'Upload paused — waiting for network. Will resume automatically.',
    ),
  );
  waitForOnline().then(() => {
    if (!tusUpload || !isActiveUpload(tusUpload)) return;
    networkPaused = false;
    emit(makeSnapshot('uploading', fileName, acceptedLoaded, snapshot.total));
    tusUpload.start();
  });
}

async function validateAndCheckDuplicate(
  sb: SupaClient,
  organizationId: string,
  sanitizedName: string,
): Promise<string | null> {
  let folder: string;
  try {
    folder = buildSafePath([organizationId, 'aumni_export']);
  } catch {
    return 'Invalid file path detected';
  }

  const dup = await checkDuplicate(sb, folder, sanitizedName);

  if (dup === 'list-error') {
    const msg = 'Unable to verify file. Please try again.';
    reportFail(sanitizedName, 'Upload failed', msg);
    return msg;
  }
  if (dup === 'duplicate') {
    const msg = 'This file has already been uploaded.';
    reportFail(sanitizedName, 'Duplicate file', msg);
    return msg;
  }
  return null;
}

function startZipListing(file: File) {
  const zipRef: { current: PersistedZipListing | null } = { current: null };
  const listingPromise = listZipEntriesFromBlob(file, { maxEntries: 50_000 })
    .then((listing) => {
      zipRef.current = listing;
    })
    .catch((err) => {
      logger.warn({ err }, 'Aumni zip listing parse failed');
    });
  return { zipRef, listingPromise };
}

export async function startUpload(
  file: File,
  organizationId: string,
  sb: SupaClient,
): Promise<string | null> {
  if (isActive()) return 'Upload already in progress';
  if (!organizationId) return 'Organization ID not available';
  currentOrgId = organizationId;

  const sanitizedName = sanitizeFileName(file.name);
  const safePath = buildUploadPath(organizationId, sanitizedName);
  if (!safePath) return 'Invalid file path detected';

  const dupError = await validateAndCheckDuplicate(
    sb,
    organizationId,
    sanitizedName,
  );
  if (dupError) return dupError;

  networkPaused = false;
  acceptedLoaded = 0;
  emit(makeSnapshot('uploading', sanitizedName, 0, file.size));
  const { zipRef, listingPromise } = startZipListing(file);
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session?.access_token) {
    reportFail(
      sanitizedName,
      'Upload failed',
      'Session expired. Please sign in again.',
    );
    return 'Session expired. Please sign in again.';
  }
  savePending(organizationId, sanitizedName, safePath);

  const ctx: SuccessCtx = {
    organizationId,
    sanitizedName,
    safePath,
    fileSize: file.size,
    listingPromise,
    zipRef,
  };
  const getToken: TokenGetter = async () => {
    const {
      data: { session: s },
    } = await sb.auth.getSession();
    return s?.access_token ?? null;
  };
  const callbacks: TusCallbacks = {
    onError: (message, rawErr) => {
      if (isNetworkError(rawErr)) return handleNetworkPause(sanitizedName);
      reportFail(sanitizedName, 'Import failed', message);
    },
    onProgress: () => {},
    onChunkComplete: (_chunkSize, bytesAccepted, bytesTotal) => {
      if (networkPaused || isOffline()) {
        networkPaused = true;
        return;
      }
      acceptedLoaded = bytesAccepted;
      networkPaused = false;
      emit(makeSnapshot('uploading', sanitizedName, bytesAccepted, bytesTotal));
    },
    onSuccess: () => onTusComplete(ctx),
  };
  const opts = buildTusOptions(
    file,
    aumniBucket(),
    safePath,
    session.access_token,
    callbacks,
    getToken,
  );

  tusUpload = new tus.Upload(file, opts);
  registerActiveUpload(tusUpload);
  await clearStaleTusFingerprint(tusUpload);
  if (!isActiveUpload(tusUpload)) {
    return 'Upload stopped — session expired. Please sign in again.';
  }
  tusUpload.start();
  return null;
}
