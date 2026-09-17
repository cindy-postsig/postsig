const STORAGE_KEY_PREFIX = 'aumni_upload_pending_';

export interface PendingUpload {
  fileName: string;
  safePath: string;
  startedAt: number;
}

function storageKey(organizationId: string): string {
  return `${STORAGE_KEY_PREFIX}${organizationId}`;
}

export function savePending(
  organizationId: string,
  fileName: string,
  safePath: string,
): void {
  const value: PendingUpload = { fileName, safePath, startedAt: Date.now() };
  try {
    localStorage.setItem(storageKey(organizationId), JSON.stringify(value));
  } catch {
    // localStorage may be full or unavailable
  }
}

function isPendingUpload(v: unknown): v is PendingUpload {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.fileName === 'string' &&
    typeof o.safePath === 'string' &&
    typeof o.startedAt === 'number'
  );
}

export function loadPending(organizationId: string): PendingUpload | null {
  try {
    const raw = localStorage.getItem(storageKey(organizationId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPendingUpload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPending(organizationId: string): void {
  try {
    localStorage.removeItem(storageKey(organizationId));
  } catch {
    // localStorage may be unavailable
  }
}
