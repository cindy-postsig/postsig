// PSK-1899: `/pdfjs/*` holds the vendored pdf.js worker and font/CMap assets.
// The middleware's module gate maps every non-`/investor` path to the `cpm`
// module, so while these assets ran through middleware an investor-only user
// got a redirect to HTML instead of the worker script and every PDF failed to
// render. They must stay excluded from the matcher.

// proxy.ts pulls in Supabase, auth and logging on import; none of that is
// needed to assert the exported matcher.
jest.mock('@/utils/supabase/middleware', () => ({ updateSession: jest.fn() }));
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/app/lib/auth/mfa-actions', () => ({
  checkMFATrustStatus: jest.fn(),
}));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { config } from '@/proxy';

const matches = (pathname: string): boolean =>
  config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));

describe('middleware matcher', () => {
  test.each([
    '/pdfjs/pdf.worker.min.mjs',
    '/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap',
    '/pdfjs/standard_fonts/FoxitSans.pfb',
    '/pdfjs/wasm/openjpeg.wasm',
    '/pdfjs/iccs/sRGB.icc',
  ])('does not run middleware on %s', (pathname) => {
    expect(matches(pathname)).toBe(false);
  });

  test.each(['/_next/static/chunk.js', '/favicon.ico', '/fonts/inter.woff2'])(
    'keeps the existing exclusion for %s',
    (pathname) => {
      expect(matches(pathname)).toBe(false);
    },
  );

  test.each([
    '/',
    '/investor/documents',
    '/settings/groups',
    '/api/v2/investor/documents',
  ])('still runs middleware on %s', (pathname) => {
    expect(matches(pathname)).toBe(true);
  });
});
