type UrlConstructorWithParse = typeof URL & {
  parse?: (url: string | URL, base?: string | URL) => URL | null;
};

// pdf.js calls URL.parse in getDocument to validate cMapUrl and
// standardFontDataUrl, but Edge/Chrome < 126 don't have it, so passing these
// options crashes the contract page there.
const urlConstructor = URL as UrlConstructorWithParse;
if (typeof urlConstructor.parse !== 'function') {
  urlConstructor.parse = (url, base) => {
    try {
      return new URL(url, base);
    } catch {
      return null;
    }
  };
}

// pdf.js needs CMap + standard-font data to map character codes to glyphs for
// CID/composite and non-embedded base-14 fonts; without them it renders
// gibberish for such PDFs. Assets are copied from the installed pdfjs-dist by
// scripts/copy-pdfjs-assets.mjs (prebuild/predev) and served same-origin so
// no CDN or CSP directive can silently break font loading.
// useSystemFonts is disabled because OS font substitution makes non-embedded
// fonts render differently per platform (garbled glyphs on Windows); bundled
// standard fonts render identically everywhere.
export const PDF_DOCUMENT_OPTIONS = {
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  iccUrl: '/pdfjs/iccs/',
  useSystemFonts: false,
};
