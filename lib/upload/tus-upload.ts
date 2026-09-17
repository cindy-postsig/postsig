import type { Upload, UploadOptions } from 'tus-js-client';
import { DetailedError } from 'tus-js-client';

export const TUS_CHUNK_SIZE = 6 * 1024 * 1024; // 6MB

export class SessionExpiredError extends Error {
  constructor(message = 'Upload session expired. Please sign in again.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

function isCompactJwsLike(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

function assertCompactAccessToken(token: string): void {
  if (isCompactJwsLike(token)) return;
  throw new SessionExpiredError(
    'Upload session is invalid. Please refresh the page and sign in again.',
  );
}

// Module-level registry of in-flight tus uploads across the app. Any caller
// that creates a tus.Upload should register it so a global abort (e.g. on
// SIGNED_OUT in another tab) can stop it before tus issues another request
// with a stale token — which would otherwise cause Supabase Storage to 401
// the HEAD-resume, leading tus to discard the upload URL and restart from 0.
const activeUploads = new Set<Upload>();

export function registerActiveUpload(upload: Upload): void {
  activeUploads.add(upload);
}

export function unregisterActiveUpload(upload: Upload): void {
  activeUploads.delete(upload);
}

export function isActiveUpload(upload: Upload): boolean {
  return activeUploads.has(upload);
}

export function abortAllActiveUploads(): void {
  for (const upload of activeUploads) {
    try {
      upload.abort();
    } catch {
      // ignore — best-effort abort
    }
  }
  activeUploads.clear();
}

function tusEndpoint(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error('Missing required env var NEXT_PUBLIC_SUPABASE_URL');
  }
  return `${url}/storage/v1/upload/resumable`;
}

export function buildTusHeaders(accessToken: string): Record<string, string> {
  assertCompactAccessToken(accessToken);
  return {
    'x-upsert': 'true',
  };
}

export function buildTusMetadata(
  bucketName: string,
  objectPath: string,
  contentType: string,
): Record<string, string> {
  return {
    bucketName,
    objectName: objectPath,
    contentType,
    cacheControl: '3600',
  };
}

export interface TusCallbacks {
  // Receives both the humanized, user-facing message and the raw Error so
  // callers can route on it (e.g. distinguish SessionExpiredError, network
  // errors). buildTusOptions wires this directly into the tus options so it
  // cannot be silently lost by post-construction option mutation — tus
  // shallow-copies its options at construction time.
  onError: (message: string, rawError: Error) => void;
  onProgress: (loaded: number, total: number) => void;
  onChunkComplete?: (
    chunkSize: number,
    bytesAccepted: number,
    bytesTotal: number,
  ) => void;
  onSuccess: () => void;
}

export type TokenGetter = () => Promise<string | null>;

async function refreshAuth(
  req: { setHeader: (h: string, v: string) => void },
  getToken: TokenGetter,
): Promise<void> {
  const token = await getToken();
  // If the session is gone (e.g. user logged out in this or another tab),
  // throw before tus issues the request. A 401 here would cause tus to
  // invalidate the upload URL and restart from byte 0 on next retry.
  if (!token) throw new SessionExpiredError();
  assertCompactAccessToken(token);
  req.setHeader('authorization', `Bearer ${token}`);
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function hasStaleTokenSignature(err: Error | DetailedError): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes('jws') || msg.includes('jwt') || msg.includes('token expired')
  );
}

function looksLikeNetworkError(err: Error | DetailedError): boolean {
  if (err instanceof SessionExpiredError) return false;
  if (isSessionExpiredCause(err)) return false;
  if (isOffline()) return true;

  if (err instanceof DetailedError && err.causingError) {
    const cause = err.causingError.message.toLowerCase();
    if (cause.includes('failed to fetch') || cause.includes('networkerror')) {
      return true;
    }
  }

  const msg = err.message.toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('networkerror');
}

function isSessionExpiredCause(err: Error | DetailedError): boolean {
  if (err instanceof SessionExpiredError) return true;
  if (err instanceof DetailedError && err.causingError) {
    return err.causingError instanceof SessionExpiredError;
  }
  return false;
}

const MAX_AUTH_RETRIES = 2;

function createUploadRetryState(): {
  shouldRetry: NonNullable<UploadOptions['onShouldRetry']>;
  resetAuthFailures: () => void;
} {
  let consecutiveAuthFailures = 0;

  return {
    shouldRetry: (err: DetailedError): boolean => {
      if (isSessionExpiredCause(err)) return false;
      // Never let tus retry network errors internally — the upload
      // manager's handleNetworkPause waits for the online event and
      // calls start() once. Letting tus also retry creates two
      // competing resume paths and resets the retry counter on every
      // partial chunk, allowing uploads to "succeed" through repeated
      // disconnects even when the file was never fully sent.
      if (looksLikeNetworkError(err)) return false;

      const status = err.originalResponse?.getStatus() ?? 0;
      const isAuthError =
        status === 401 || status === 403 || hasStaleTokenSignature(err);

      if (isAuthError) {
        consecutiveAuthFailures++;
        return consecutiveAuthFailures <= MAX_AUTH_RETRIES;
      }

      consecutiveAuthFailures = 0;
      if (status >= 500) return true;
      if (status === 409 || status === 423) return true;

      return false;
    },
    resetAuthFailures: () => {
      consecutiveAuthFailures = 0;
    },
  };
}

export function isNetworkError(err: Error): boolean {
  return looksLikeNetworkError(err);
}

export function isSessionExpired(err: Error): boolean {
  return isSessionExpiredCause(err);
}

// Pure classifier — returns a user-facing message. Does NOT log.
// Callers decide whether to log and at what severity (e.g. session-expired
// is expected, not an error; 5xx might warrant Sentry; etc.).
function humanizeUploadError(err: Error | DetailedError): string {
  if (isSessionExpiredCause(err)) {
    return 'Upload stopped — session expired. Please sign in again.';
  }

  if (isOffline()) {
    return 'Upload paused — you appear to be offline. It will resume automatically when you reconnect.';
  }

  if (err instanceof DetailedError) {
    const status = err.originalResponse?.getStatus();

    if (status === 403 || status === 401) {
      return 'Upload session expired. Please refresh the page and try again.';
    }
    if (status === 413) {
      return 'File is too large for the server to accept.';
    }
    if (status !== undefined && status >= 500) {
      return 'Upload failed due to a server error. Please try again later.';
    }
  }

  if (looksLikeNetworkError(err)) {
    return 'Upload paused — network connection was lost. It will resume automatically when you reconnect.';
  }

  return 'Upload failed. Please try again.';
}

export function buildTusOptions(
  file: File,
  bucketName: string,
  objectPath: string,
  accessToken: string,
  callbacks: TusCallbacks,
  getToken?: TokenGetter,
): UploadOptions {
  const retryState = createUploadRetryState();

  return {
    endpoint: tusEndpoint(),
    retryDelays: [0, 3000, 5000, 10000, 30000],
    headers: buildTusHeaders(accessToken),
    uploadDataDuringCreation: true,
    uploadLengthDeferred: false,
    removeFingerprintOnSuccess: true,
    metadata: buildTusMetadata(bucketName, objectPath, file.type),
    chunkSize: TUS_CHUNK_SIZE,
    onShouldRetry: retryState.shouldRetry,
    onAfterResponse: (_req, res) => {
      const status = res.getStatus();
      if (status >= 200 && status < 400) {
        retryState.resetAuthFailures();
      }
    },
    onError: (err) => callbacks.onError(humanizeUploadError(err), err),
    onProgress: (loaded, total) => callbacks.onProgress(loaded, total),
    onChunkComplete: (chunkSize, bytesAccepted, bytesTotal) =>
      callbacks.onChunkComplete?.(chunkSize, bytesAccepted, bytesTotal),
    onSuccess: () => callbacks.onSuccess(),
    ...(getToken && { onBeforeRequest: (req) => refreshAuth(req, getToken) }),
  };
}

export async function clearStaleTusFingerprint(upload: Upload): Promise<void> {
  try {
    const previous = await upload.findPreviousUploads();
    for (const entry of previous) {
      if (entry.urlStorageKey) {
        localStorage.removeItem(entry.urlStorageKey);
      }
    }
  } catch {
    // best-effort cleanup
  }
}
