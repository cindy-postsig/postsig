import {
  getDocumentIdentity,
  resolveStableDocumentUrl,
  type PinnedDocumentUrl,
} from '@/lib/pdf/stable-document-url';

// PSK-1902: Supabase re-signs on every server render, so the contract page
// handed react-pdf a new URL each refresh. That tore down the PDFDocumentProxy
// mid-render and crashed the viewer with a null worker message handler.
describe('getDocumentIdentity', () => {
  test('prefers file_path', () => {
    expect(
      getDocumentIdentity({ id: 7, file_path: 'org/1/contract.pdf' }),
    ).toBe('org/1/contract.pdf');
  });

  test('falls back to a stringified id', () => {
    expect(getDocumentIdentity({ id: 7 })).toBe('7');
    expect(getDocumentIdentity({ id: 0 })).toBe('0');
  });

  test.each([null, undefined, {}, { file_path: null, id: null }])(
    'returns null for %p',
    (document) => {
      expect(getDocumentIdentity(document as never)).toBeNull();
    },
  );
});

describe('resolveStableDocumentUrl', () => {
  const document = {
    id: 3039,
    file_path: 'org/1/contract-3039.pdf',
    signedUrl: 'https://storage/contract-3039.pdf?token=first',
  };

  test('pins the first URL it sees', () => {
    expect(resolveStableDocumentUrl(null, document)).toEqual({
      key: 'org/1/contract-3039.pdf',
      url: 'https://storage/contract-3039.pdf?token=first',
    });
  });

  test('keeps the pinned URL when the same file is re-signed', () => {
    const pinned = resolveStableDocumentUrl(null, document);

    const resigned = resolveStableDocumentUrl(pinned, {
      ...document,
      signedUrl: 'https://storage/contract-3039.pdf?token=second',
    });

    // Same object, so the `file` prop stays referentially stable and react-pdf
    // never re-runs loadDocument.
    expect(resigned).toBe(pinned);
    expect(resigned?.url).toBe('https://storage/contract-3039.pdf?token=first');
  });

  // The hook guards its render-time setState by comparing against the value it
  // writes, so re-resolving a result must return that identical object or the
  // component would re-render forever.
  test('converges: re-resolving its own result is a no-op', () => {
    const first = resolveStableDocumentUrl(null, document);
    expect(resolveStableDocumentUrl(first, document)).toBe(first);

    const switchedDocument = {
      id: 4001,
      file_path: 'org/1/contract-4001.pdf',
      signedUrl: 'https://storage/contract-4001.pdf?token=first',
    };

    const switched = resolveStableDocumentUrl(first, switchedDocument);
    expect(resolveStableDocumentUrl(switched, switchedDocument)).toBe(switched);
    expect(resolveStableDocumentUrl(switched, document)).not.toBe(switched);

    const missing = resolveStableDocumentUrl(first, null);
    expect(resolveStableDocumentUrl(missing, null)).toBe(missing);
  });

  test('adopts the new URL when the underlying file changes', () => {
    const pinned = resolveStableDocumentUrl(null, document);

    const next = resolveStableDocumentUrl(pinned, {
      id: 4001,
      file_path: 'org/1/contract-4001.pdf',
      signedUrl: 'https://storage/contract-4001.pdf?token=first',
    });

    expect(next).not.toBe(pinned);
    expect(next?.url).toBe('https://storage/contract-4001.pdf?token=first');
  });

  test('holds the pin when a refresh transiently fails to sign', () => {
    const pinned = resolveStableDocumentUrl(null, document);

    const next = resolveStableDocumentUrl(pinned, {
      ...document,
      signedUrl: null,
    });

    expect(next).toBe(pinned);
  });

  test('drops the pin when the document goes away', () => {
    const pinned: PinnedDocumentUrl = {
      key: 'org/1/contract-3039.pdf',
      url: 'https://storage/contract-3039.pdf?token=first',
    };

    expect(resolveStableDocumentUrl(pinned, null)).toBeNull();
    expect(resolveStableDocumentUrl(pinned, undefined)).toBeNull();
  });

  test('returns null for a new file that has no signed URL yet', () => {
    const pinned = resolveStableDocumentUrl(null, document);

    expect(
      resolveStableDocumentUrl(pinned, {
        id: 4001,
        file_path: 'org/1/contract-4001.pdf',
        signedUrl: null,
      }),
    ).toBeNull();
  });
});
