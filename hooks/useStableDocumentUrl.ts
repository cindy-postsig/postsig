'use client';

import { useState } from 'react';
import {
  resolveStableDocumentUrl,
  type PinnedDocumentUrl,
  type SignedDocumentLike,
} from '@/lib/pdf/stable-document-url';

/**
 * Referentially stable signed URL for a stored document.
 *
 * Holds the first URL seen for a given file so a re-signed token from a server
 * re-render does not force react-pdf to destroy and reload the document. See
 * `resolveStableDocumentUrl` for why that teardown crashes the viewer.
 */
export function useStableDocumentUrl(
  document: SignedDocumentLike | null | undefined,
): string | null {
  const [pinned, setPinned] = useState<PinnedDocumentUrl | null>(() =>
    resolveStableDocumentUrl(null, document),
  );

  // React's "adjusting state during render" pattern: the update is guarded by a
  // comparison against the state it writes, so it converges on the next render
  // rather than looping. A ref written during render would survive a render
  // React discards, leaving a pin for a document that never committed.
  const next = resolveStableDocumentUrl(pinned, document);
  if (next !== pinned) {
    setPinned(next);
  }

  return next?.url ?? null;
}
