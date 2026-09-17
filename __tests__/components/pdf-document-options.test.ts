import { PDF_DOCUMENT_OPTIONS } from '@/components/pdf/pdf-document-options';

type UrlConstructorWithParse = typeof URL & {
  parse?: (url: string | URL, base?: string | URL) => URL | null;
};

describe('URL.parse polyfill', () => {
  const urlConstructor = URL as UrlConstructorWithParse;
  const nativeParse = urlConstructor.parse;

  afterEach(() => {
    urlConstructor.parse = nativeParse;
  });

  it('installs a spec-compliant URL.parse when the browser lacks it', () => {
    Reflect.deleteProperty(urlConstructor, 'parse');
    jest.isolateModules(() => {
      require('@/components/pdf/pdf-document-options');
    });

    expect(typeof urlConstructor.parse).toBe('function');
    expect(urlConstructor.parse?.('https://example.com/cmaps/')?.href).toBe(
      'https://example.com/cmaps/',
    );
    expect(urlConstructor.parse?.('not a url')).toBeNull();
  });

  it('leaves the native URL.parse untouched when present', () => {
    const sentinel = jest.fn();
    urlConstructor.parse = sentinel;
    jest.isolateModules(() => {
      require('@/components/pdf/pdf-document-options');
    });

    expect(urlConstructor.parse).toBe(sentinel);
  });
});

describe('PDF_DOCUMENT_OPTIONS', () => {
  it('enables packed CMaps so CID/composite fonts map to the right glyphs', () => {
    expect(PDF_DOCUMENT_OPTIONS.cMapPacked).toBe(true);
  });

  it('disables system fonts so non-embedded fonts render the same on every OS', () => {
    expect(PDF_DOCUMENT_OPTIONS.useSystemFonts).toBe(false);
  });

  it('points every asset URL at the self-hosted /pdfjs/ path', () => {
    expect(PDF_DOCUMENT_OPTIONS.cMapUrl).toBe('/pdfjs/cmaps/');
    expect(PDF_DOCUMENT_OPTIONS.standardFontDataUrl).toBe(
      '/pdfjs/standard_fonts/',
    );
    expect(PDF_DOCUMENT_OPTIONS.wasmUrl).toBe('/pdfjs/wasm/');
    expect(PDF_DOCUMENT_OPTIONS.iccUrl).toBe('/pdfjs/iccs/');
  });
});
