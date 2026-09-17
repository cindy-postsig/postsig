import * as tus from 'tus-js-client';
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
  listZipEntriesFromBlob,
  type PersistedZipListing,
} from '@/lib/archive/zip-listing-client';
import logger from '@/utils/pino';
import {
  savePending,
  removePending,
  type PendingDocumentUpload,
} from '@/app/(app)/(investor)/investor/documents/documents-upload-state';

export type ManagerStatus =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'uploaded'
  | 'error';

export interface UploadSnapshot {
  fileId: string;
  status: ManagerStatus;
  fileName: string;
  errorMessage?: string;
  loaded: number;
  total: number;
  documentId?: string;
}

type Listener = (snapshot: UploadSnapshot) => void;

interface AuthClient {
  getSession: () => Promise<{
    data: { session: { access_token: string } | null };
  }>;
}

export interface SupaClient {
  auth: AuthClient;
}

interface ProcessDocumentPayload {
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  zipListing?: PersistedZipListing;
}

interface ProcessDocumentResult {
  success: boolean;
  documentId?: string;
}

export type ProcessDocumentFn = (
  payload: ProcessDocumentPayload,
) => Promise<ProcessDocumentResult>;

export interface StartUploadParams {
  file: File;
  fileId: string;
  documentPublicId: string;
  filePath: string;
  organizationId: string;
  previousPendingFileId?: string;
  sb: SupaClient;
  processDocument: ProcessDocumentFn;
}

type ZipRef = { current: PersistedZipListing | null };
type RunHandlers = {
  resolve: (result: ProcessDocumentResult) => void;
  reject: (err: Error) => void;
};

function bucketName(): string {
  return process.env.NEXT_PUBLIC_FILE_UPLOAD_BUCKET ?? 'documents';
}

function isZipFile(file: File): boolean {
  if (file.type === 'application/zip') return true;
  if (file.type === 'application/x-zip-compressed') return true;
  return file.name.toLowerCase().endsWith('.zip');
}

interface UploadState {
  tusUpload: tus.Upload | null;
  networkPaused: boolean;
  acceptedLoaded: number;
}

const uploads = new Map<string, UploadState>();
const snapshots = new Map<string, UploadSnapshot>();
const inFlight = new Map<string, Promise<ProcessDocumentResult>>();
const pendingHandlers = new Map<string, RunHandlers>();
const listeners = new Set<Listener>();

/** Distinguishes a user-initiated cancel from a genuine upload failure. */
export class UploadAbortedError extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadAbortedError';
  }
}

function waitForOnline(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    window.addEventListener('online', () => resolve(), { once: true });
  });
}

function emit(snapshot: UploadSnapshot) {
  snapshots.set(snapshot.fileId, snapshot);
  listeners.forEach((fn) => fn(snapshot));
}

function patch(fileId: string, updates: Partial<UploadSnapshot>) {
  const existing = snapshots.get(fileId);
  if (!existing) return;
  emit({ ...existing, ...updates });
}

export function getSnapshot(fileId: string): UploadSnapshot | null {
  return snapshots.get(fileId) ?? null;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function safeAbort(u: tus.Upload, shouldTerminate = false): void {
  try {
    u.abort(shouldTerminate);
  } catch {
    // tus may throw if already terminated — best-effort cleanup
  }
}

function cleanupTus(
  fileId: string,
  doAbort = false,
  shouldTerminate = false,
): void {
  const state = uploads.get(fileId);
  if (!state) return;
  if (state.tusUpload) {
    if (doAbort) safeAbort(state.tusUpload, shouldTerminate);
    unregisterActiveUpload(state.tusUpload);
  }
  uploads.delete(fileId);
}

function ownsRegistration(fileId: string, handlers: RunHandlers): boolean {
  return pendingHandlers.get(fileId) === handlers;
}

// tus.abort() never fires onError, so nothing else would settle the promise
// runStartUpload handed back. The queue awaits it one file at a time, so
// leaving it pending stalls the whole batch on the cancelled file.
function settleAborted(fileId: string): void {
  const handlers = pendingHandlers.get(fileId);
  if (!handlers) return;
  handlers.reject(new UploadAbortedError());
}

export function abort(fileId: string): void {
  cleanupTus(fileId, true, true);
  snapshots.delete(fileId);
  inFlight.delete(fileId);
  settleAborted(fileId);
}

export function clearSnapshot(fileId: string): void {
  cleanupTus(fileId, true, true);
  snapshots.delete(fileId);
  inFlight.delete(fileId);
  settleAborted(fileId);
}

export function __resetForTests(): void {
  for (const id of Array.from(uploads.keys())) cleanupTus(id, true, true);
  snapshots.clear();
  inFlight.clear();
  pendingHandlers.clear();
  listeners.clear();
}

function startZipListing(file: File): {
  zipRef: ZipRef;
  listingPromise: Promise<void>;
} {
  const zipRef: ZipRef = { current: null };
  if (!isZipFile(file)) return { zipRef, listingPromise: Promise.resolve() };
  const listingPromise = listZipEntriesFromBlob(file)
    .then((listing) => {
      zipRef.current = listing;
    })
    .catch((err) => {
      logger.warn({ err }, 'Document zip listing parse failed');
    });
  return { zipRef, listingPromise };
}

function reportFail(fileId: string, fileName: string, message: string): void {
  logger.error({ error: message, fileName }, 'Document upload error');
  cleanupTus(fileId);
  inFlight.delete(fileId);
  emit({
    fileId,
    fileName,
    status: 'error',
    loaded: 0,
    total: 0,
    errorMessage: message,
  });
}

// Launch-time failures (no bytes uploaded yet) should also clear the persisted
// resume entry — otherwise the user sees a ghost "re-select to resume" row for
// an upload the server never knew about. tus runtime errors (post-launch) must
// NOT clear pending — that's exactly when resume needs the persisted state.
function reportLaunchFail(
  fileId: string,
  fileName: string,
  message: string,
  organizationId: string,
): void {
  removePending(organizationId, fileId);
  reportFail(fileId, fileName, message);
}

function persist(
  organizationId: string,
  fileId: string,
  documentPublicId: string,
  file: File,
  filePath: string,
  previousPendingFileId?: string,
): void {
  const entry: Omit<PendingDocumentUpload, 'startedAt'> = {
    fileId,
    documentPublicId,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    filePath,
  };
  const saved = savePending(organizationId, entry);
  if (saved && previousPendingFileId && previousPendingFileId !== fileId) {
    removePending(organizationId, previousPendingFileId);
  }
}

function makeTokenGetter(sb: SupaClient): TokenGetter {
  return async () => {
    const session = await sb.auth.getSession();
    return session.data.session?.access_token ?? null;
  };
}

async function callProcess(
  params: StartUploadParams,
  zipRef: ZipRef,
  listingPromise: Promise<void>,
): Promise<ProcessDocumentResult> {
  await listingPromise;
  const payload: ProcessDocumentPayload = {
    fileName: params.file.name,
    filePath: params.filePath,
    fileType: params.file.type,
    fileSize: params.file.size,
  };
  if (zipRef.current) payload.zipListing = zipRef.current;
  return params.processDocument(payload);
}

function onProcessSuccess(
  params: StartUploadParams,
  result: ProcessDocumentResult,
  handlers: RunHandlers,
): void {
  // The process request outlives a cancel, so this can land after a retry has
  // taken the fileId. Everything below would be applied to the retry's row.
  if (!ownsRegistration(params.fileId, handlers)) return;
  cleanupTus(params.fileId);
  inFlight.delete(params.fileId);
  removePending(params.organizationId, params.fileId);
  const snap: UploadSnapshot = {
    fileId: params.fileId,
    fileName: params.file.name,
    status: 'uploaded',
    loaded: params.file.size,
    total: params.file.size,
  };
  if (result.documentId) snap.documentId = result.documentId;
  emit(snap);
  handlers.resolve(result);
}

function onProcessError(
  params: StartUploadParams,
  err: unknown,
  handlers: RunHandlers,
): void {
  if (!ownsRegistration(params.fileId, handlers)) return;
  const msg =
    err instanceof Error ? err.message : 'Post-upload processing failed';
  reportFail(params.fileId, params.file.name, msg);
  handlers.reject(err instanceof Error ? err : new Error(msg));
}

function handleTusSuccess(
  params: StartUploadParams,
  zipRef: ZipRef,
  listingPromise: Promise<void>,
  handlers: RunHandlers,
): void {
  patch(params.fileId, { status: 'processing' });
  callProcess(params, zipRef, listingPromise)
    .then((result) => onProcessSuccess(params, result, handlers))
    .catch((err: unknown) => onProcessError(params, err, handlers));
}

function handleNetworkPause(fileId: string): void {
  const state = uploads.get(fileId);
  if (!state) return;
  state.networkPaused = true;
  patch(fileId, {
    loaded: state.acceptedLoaded,
    errorMessage:
      'Upload paused — waiting for network. Will resume automatically.',
  });
  waitForOnline().then(() => {
    if (!state.tusUpload || !isActiveUpload(state.tusUpload)) return;
    state.networkPaused = false;
    patch(fileId, { errorMessage: undefined });
    state.tusUpload.start();
  });
}

function makeUploadErrorHandler(
  params: StartUploadParams,
  handlers: RunHandlers,
) {
  return (message: string, rawErr: Error) => {
    if (isNetworkError(rawErr)) return handleNetworkPause(params.fileId);
    // tus can fail an attempt after abort() tore it down. By then a retry may
    // hold the fileId, and reportFail would clear its tus state and stamp its
    // row with this failure.
    if (!ownsRegistration(params.fileId, handlers)) return;
    reportFail(params.fileId, params.file.name, message);
    handlers.reject(new Error(message));
  };
}

function makeChunkCompleteHandler(params: StartUploadParams) {
  return (_chunkSize: number, bytesAccepted: number, bytesTotal: number) => {
    const state = uploads.get(params.fileId);
    if (state?.networkPaused || isOffline()) {
      if (state && !state.networkPaused) {
        handleNetworkPause(params.fileId);
      }
      return;
    }
    if (state) {
      state.acceptedLoaded = bytesAccepted;
      state.networkPaused = false;
    }
    patch(params.fileId, {
      status: 'uploading',
      loaded: bytesAccepted,
      total: bytesTotal,
    });
  };
}

function buildCallbacks(
  params: StartUploadParams,
  zipRef: ZipRef,
  listingPromise: Promise<void>,
  handlers: RunHandlers,
): TusCallbacks {
  return {
    onError: makeUploadErrorHandler(params, handlers),
    onProgress: () => {},
    onChunkComplete: makeChunkCompleteHandler(params),
    onSuccess: () => handleTusSuccess(params, zipRef, listingPromise, handlers),
  };
}

function rejectLaunchFail(
  params: StartUploadParams,
  handlers: RunHandlers,
  msg: string,
): void {
  // A cancelled attempt can still resolve findPreviousUploads; reportLaunchFail
  // would drop the retry's resume entry and stamp its row.
  if (!ownsRegistration(params.fileId, handlers)) return;
  reportLaunchFail(params.fileId, params.file.name, msg, params.organizationId);
  handlers.reject(new Error(msg));
}

function launchTus(
  params: StartUploadParams,
  accessToken: string,
  zipRef: ZipRef,
  listingPromise: Promise<void>,
  handlers: RunHandlers,
): void {
  const callbacks = buildCallbacks(params, zipRef, listingPromise, handlers);
  const opts = buildTusOptions(
    params.file,
    bucketName(),
    params.filePath,
    accessToken,
    callbacks,
    makeTokenGetter(params.sb),
  );
  const upload = new tus.Upload(params.file, opts);
  uploads.set(params.fileId, {
    tusUpload: upload,
    networkPaused: false,
    acceptedLoaded: 0,
  });
  registerActiveUpload(upload);

  clearStaleTusFingerprint(upload)
    .then(() => upload.findPreviousUploads())
    .then((previous) => {
      if (!isActiveUpload(upload)) {
        const msg = 'Upload stopped — session expired. Please sign in again.';
        return rejectLaunchFail(params, handlers, msg);
      }
      if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to start upload';
      rejectLaunchFail(params, handlers, msg);
    });
}

async function launchWhenAuthorized(
  params: StartUploadParams,
  handlers: RunHandlers,
): Promise<void> {
  emit({
    fileId: params.fileId,
    fileName: params.file.name,
    status: 'uploading',
    loaded: 0,
    total: params.file.size,
  });

  const { zipRef, listingPromise } = startZipListing(params.file);
  const session = await params.sb.auth.getSession();
  // A cancel during the session round-trip settles and unregisters the
  // handlers. Launching now would upload a file the user already dropped.
  // Compared by identity, not presence: a retry reuses the fileId, so a bare
  // presence check would let this attempt launch on the retry's entry.
  if (!ownsRegistration(params.fileId, handlers)) return;

  const accessToken = session.data.session?.access_token;
  if (!accessToken) {
    const msg = 'Session expired. Please sign in again.';
    // No persistence yet at this point — nothing to clear.
    reportFail(params.fileId, params.file.name, msg);
    handlers.reject(new Error(msg));
    return;
  }

  persist(
    params.organizationId,
    params.fileId,
    params.documentPublicId,
    params.file,
    params.filePath,
    params.previousPendingFileId,
  );

  launchTus(params, accessToken, zipRef, listingPromise, handlers);
}

function runStartUpload(
  params: StartUploadParams,
): Promise<ProcessDocumentResult> {
  return new Promise<ProcessDocumentResult>((resolve, reject) => {
    const settle = (fn: () => void) => {
      pendingHandlers.delete(params.fileId);
      fn();
    };
    const handlers: RunHandlers = {
      resolve: (result) => settle(() => resolve(result)),
      reject: (err) => settle(() => reject(err)),
    };
    // Registered before the first await, so abort() can settle an upload that
    // is still waiting on the session rather than leaving the queue blocked.
    pendingHandlers.set(params.fileId, handlers);
    void launchWhenAuthorized(params, handlers).catch((err: unknown) => {
      // A superseded attempt reports nothing: reportFail would tear down the
      // live retry's tus state and stamp its row with this failure.
      if (!ownsRegistration(params.fileId, handlers)) return;
      const msg = err instanceof Error ? err.message : 'Failed to start upload';
      reportFail(params.fileId, params.file.name, msg);
      handlers.reject(err instanceof Error ? err : new Error(msg));
    });
  });
}

export function startUpload(
  params: StartUploadParams,
): Promise<ProcessDocumentResult> {
  // Dedupe concurrent starts: a double-click on Upload or a StrictMode remount
  // can call startUpload twice for the same fileId. Returning the existing
  // promise is friendlier than throwing.
  const existing = inFlight.get(params.fileId);
  if (existing) return existing;

  const promise = runStartUpload(params);
  inFlight.set(params.fileId, promise);
  // Clear the registry slot when the promise settles so the next user-driven
  // retry isn't blocked. The error path already does this via reportFail;
  // success path does it via onProcessSuccess. This is a safety net.
  // The .catch is a no-op handler — the *returned* promise still rejects to
  // the caller; this branch just prevents an unhandledRejection from the
  // detached .finally chain.
  promise
    .catch(() => {})
    .finally(() => {
      if (inFlight.get(params.fileId) === promise) {
        inFlight.delete(params.fileId);
      }
    });
  return promise;
}
