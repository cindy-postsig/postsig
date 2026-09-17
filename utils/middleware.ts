export function generateCSPHeader(nonce: string, pathname?: string): string {
  const isDevelopment = process.env.NODE_ENV === 'development';
  // The OAuth consent page submits its approve/deny form to /api/oauth/decision,
  // which 303s to the requesting client's OAuth callback URL (e.g. claude.ai).
  // `form-action` is enforced on redirect targets too, so `'self'` would block
  // the cross-origin callback and the consent flow silently dead-ends. Relax
  // only on /oauth/consent; everywhere else keeps the strict policy.
  const allowExternalFormRedirects = pathname === '/oauth/consent';

  const directives = [
    "default-src 'self'",
    // unsafe-eval is needed in dev for React DevTools and HMR.
    isDevelopment
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' *.sentry.io *.vercel.app *.vercel-insights.com *.vercel-scripts.com`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' *.sentry.io *.vercel.app *.vercel-insights.com vercel.live`,
    // unsafe-inline required for CSS-in-JS (styled-components, Tailwind).
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
    "img-src 'self' data: https: asset.brandfetch.io logo.clearbit.com *.cdn.digitaloceanspaces.com img.logo.dev *.vercel.app",
    "font-src 'self' data: fonts.gstatic.com",
    "connect-src 'self' https: *.supabase.co *.sentry.io *.vercel.app *.vercel-insights.com wss: http://127.0.0.1:54321 vercel.live",
    // Workers fall back to script-src when worker-src is absent, and
    // 'strict-dynamic' there blocks them — a worker URL can't carry a nonce.
    // pdf.js then degrades to running on the main thread. The self-hosted
    // worker is same-origin; blob: covers the wrapper pdf.js builds when the
    // worker source is cross-origin.
    "worker-src 'self' blob:",
    'frame-src vercel.live',
    "object-src 'none'",
    "base-uri 'self'",
    allowExternalFormRedirects
      ? "form-action 'self' https:"
      : "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  return directives.join('; ');
}
