const STORAGE_KEY_PREFIX = 'documents_upload_pending_';

export interface PendingDocumentUpload {
  fileId: string;
  documentPublicId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  startedAt: number;
}

function storageKey(organizationId: string): string {
  return `${STORAGE_KEY_PREFIX}${organizationId}`;
}

function isPendingDocumentUpload(v: unknown): v is PendingDocumentUpload {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.fileId === 'string' &&
    typeof o.documentPublicId === 'string' &&
    typeof o.fileName === 'string' &&
    typeof o.fileType === 'string' &&
    typeof o.fileSize === 'number' &&
    typeof o.filePath === 'string' &&
    typeof o.startedAt === 'number'
  );
}

function readAll(organizationId: string): PendingDocumentUpload[] {
  try {
    const raw = localStorage.getItem(storageKey(organizationId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPendingDocumentUpload);
  } catch {
    return [];
  }
}

function writeAll(
  organizationId: string,
  entries: PendingDocumentUpload[],
): boolean {
  try {
    if (entries.length === 0) {
      localStorage.removeItem(storageKey(organizationId));
      return true;
    }
    localStorage.setItem(storageKey(organizationId), JSON.stringify(entries));
    return true;
  } catch {
    // localStorage may be full or unavailable
    return false;
  }
}

export function savePending(
  organizationId: string,
  entry: Omit<PendingDocumentUpload, 'startedAt'>,
): boolean {
  const existing = readAll(organizationId).filter(
    (e) => e.fileId !== entry.fileId,
  );
  existing.push({ ...entry, startedAt: Date.now() });
  return writeAll(organizationId, existing);
}

export function loadPending(organizationId: string): PendingDocumentUpload[] {
  return readAll(organizationId);
}

export function removePending(organizationId: string, fileId: string): void {
  const next = readAll(organizationId).filter((e) => e.fileId !== fileId);
  writeAll(organizationId, next);
}

export function clearPending(organizationId: string): void {
  try {
    localStorage.removeItem(storageKey(organizationId));
  } catch {
    // localStorage may be unavailable
  }
}

interface PendingUploadIdentity {
  fileId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export function findPendingUploadMatch(
  pending: PendingDocumentUpload[],
  file: PendingUploadIdentity,
): PendingDocumentUpload | undefined {
  return (
    pending.find((p) => p.fileId === file.fileId) ??
    pending.find(
      (p) =>
        p.fileName === file.fileName &&
        p.fileSize === file.fileSize &&
        p.fileType === file.fileType,
    )
  );
}
