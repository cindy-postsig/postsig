export interface SignedDocumentLike {
  id?: string | number | null;
  file_path?: string | null;
  signedUrl?: string | null;
}

export interface PinnedDocumentUrl {
  /** Stable identity of the underlying file, independent of the signed token. */
  key: string;
  url: string;
}

/**
 * Identity of the underlying stored file. `file_path` is preferred because it
 * survives a document row being re-created; `id` is the fallback.
 */
export function getDocumentIdentity(
  document: SignedDocumentLike | null | undefined,
): string | null {
  if (!document) return null;
  if (document.file_path) return document.file_path;
  if (document.id !== null && document.id !== undefined) {
    return String(document.id);
  }
  return null;
}

/**
 * Supabase mints a fresh token every time `createSignedUrl` runs, so each
 * server render of the contract page produces a different URL string for the
 * same file. Feeding that straight to react-pdf makes it tear down the
 * PDFDocumentProxy and reload on every refresh (Document.js `loadDocument`
 * cleanup calls `loadingTask.destroy()`), and pdf.js nulls the worker
 * message handler asynchronously during that teardown. Any `Page` that mounts
 * in the gap calls `getPage` on the dead proxy and throws synchronously —
 * "Cannot read properties of null (reading 'sendWithPromise')".
 *
 * Pinning the first URL per file identity keeps the document mounted across
 * refreshes and closes the window. Returns the previous pin unchanged when the
 * file is the same, so the resulting URL is referentially stable.
 */
export function resolveStableDocumentUrl(
  pinned: PinnedDocumentUrl | null,
  document: SignedDocumentLike | null | undefined,
): PinnedDocumentUrl | null {
  const key = getDocumentIdentity(document);
  if (!key) return null;

  // Same file: keep the already-loaded URL and ignore the refreshed token.
  if (pinned?.key === key) return pinned;

  const url = document?.signedUrl;
  if (!url) return null;

  return { key, url };
}
