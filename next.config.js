/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  env: {
    DOCUSIGN_ENABLED: process.env.DOCUSIGN_ENABLED,
    SENTRY_DSN: process.env.SENTRY_DSN,
    VERCEL_ENV: process.env.VERCEL_ENV,
    ENGINEERING_AND_PRODUCT_EMAILS: process.env.ENGINEERING_AND_PRODUCT_EMAILS,
    ENGINEERING_EMAILS: process.env.ENGINEERING_EMAILS,
    ZIYA_EMAIL: process.env.ZIYA_EMAIL,
    LINEAGE_EMAILS: process.env.LINEAGE_EMAILS,
    LOCAL_EMAILS: process.env.LOCAL_EMAILS,
  },
  async headers() {
    // Security headers configuration
    // Note: Content-Security-Policy is set in proxy.ts with per-request nonces
    // for enhanced XSS protection using 'strict-dynamic'
    return [
      {
        source: '/(.*)',
        headers: [
          {
            // HTTP Strict Transport Security - Enforces HTTPS connections
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            // X-Frame-Options - Prevents clickjacking attacks
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            // X-Content-Type-Options - Prevents MIME type sniffing
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            // Referrer-Policy - Controls referrer information sharing
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            // Permissions-Policy - Controls browser features and APIs
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          {
            // Cross-Origin-Embedder-Policy - Controls cross-origin resource embedding
            key: 'Cross-Origin-Embedder-Policy',
            value: 'credentialless',
          },
          {
            // Cross-Origin-Opener-Policy - Prevents cross-origin attacks via popups
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
          {
            // X-XSS-Protection - Legacy XSS protection for older browsers
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
  images: {
    dangerouslyAllowLocalIP: process.env.NODE_ENV === 'development',
    remotePatterns: [
      // Supabase Storage signed URLs (project-ref subdomain)
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        port: '',
      },
      {
        protocol: 'https',
        hostname: 'asset.brandfetch.io',
        port: '',
      },
      {
        protocol: 'https',
        hostname: 'cdn.brandfetch.io',
        port: '',
      },
      {
        protocol: 'https',
        hostname: 'logo.clearbit.com',
        port: '',
      },
      {
        protocol: 'https',
        hostname: '**.cdn.digitaloceanspaces.com',
        port: '',
      },
      {
        protocol: 'https',
        hostname: 'img.logo.dev',
        port: '',
      },
      ...(process.env.NODE_ENV === 'development'
        ? [{ protocol: 'http', hostname: '127.0.0.1', port: '54321' }]
        : []),
    ],
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: 'postsig',
  project: 'javascript-nextjs',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: false,
});
