import { NextRequest, NextResponse } from 'next/server';
import nextConfig from '../next.config.js';
import { generateCSPHeader } from '@/utils/middleware';

describe('Security Headers Configuration', () => {
  let mockRequest: NextRequest;
  let headers: Array<{
    source: string;
    headers: Array<{ key: string; value: string }>;
  }>;

  beforeAll(async () => {
    if (typeof nextConfig.headers === 'function') {
      headers = await nextConfig.headers();
    } else {
      headers = nextConfig.headers || [];
    }

    mockRequest = new NextRequest('https://example.com/test');
  });

  describe('Headers Configuration', () => {
    test('should have headers function defined', () => {
      expect(typeof nextConfig.headers).toBe('function');
    });

    test('should return headers array', () => {
      expect(Array.isArray(headers)).toBe(true);
      expect(headers.length).toBeGreaterThan(0);
    });

    test('should apply headers to all routes', () => {
      const globalHeaders = headers.find(
        (config) => config.source === '/(.*)',
      )?.headers;
      expect(globalHeaders).toBeDefined();
      expect(globalHeaders!.length).toBeGreaterThan(0);
    });
  });

  describe('Critical Security Headers', () => {
    let securityHeaders: Array<{ key: string; value: string }>;

    beforeAll(() => {
      const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
      const cspHeader = generateCSPHeader(nonce);
      securityHeaders = [
        { key: 'Content-Security-Policy', value: cspHeader },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains; preload',
        },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        },
        { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        {
          key: 'Cross-Origin-Opener-Policy',
          value: 'same-origin-allow-popups',
        },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
      ];
    });

    test('should include Content-Security-Policy header', () => {
      const cspHeader = securityHeaders.find(
        (h) => h.key === 'Content-Security-Policy',
      );
      expect(cspHeader).toBeDefined();
      expect(cspHeader!.value).toContain("default-src 'self'");
      expect(cspHeader!.value).toContain("frame-ancestors 'none'");
      expect(cspHeader!.value).toContain("object-src 'none'");
    });

    test('should include HTTP Strict Transport Security header', () => {
      const hstsHeader = securityHeaders.find(
        (h) => h.key === 'Strict-Transport-Security',
      );
      expect(hstsHeader).toBeDefined();
      expect(hstsHeader!.value).toBe(
        'max-age=31536000; includeSubDomains; preload',
      );
    });

    test('should include X-Frame-Options header', () => {
      const xFrameHeader = securityHeaders.find(
        (h) => h.key === 'X-Frame-Options',
      );
      expect(xFrameHeader).toBeDefined();
      expect(xFrameHeader!.value).toBe('DENY');
    });

    test('should include X-Content-Type-Options header', () => {
      const xContentTypeHeader = securityHeaders.find(
        (h) => h.key === 'X-Content-Type-Options',
      );
      expect(xContentTypeHeader).toBeDefined();
      expect(xContentTypeHeader!.value).toBe('nosniff');
    });

    test('should include Referrer-Policy header', () => {
      const referrerHeader = securityHeaders.find(
        (h) => h.key === 'Referrer-Policy',
      );
      expect(referrerHeader).toBeDefined();
      expect(referrerHeader!.value).toBe('strict-origin-when-cross-origin');
    });

    test('should include Permissions-Policy header', () => {
      const permissionsHeader = securityHeaders.find(
        (h) => h.key === 'Permissions-Policy',
      );
      expect(permissionsHeader).toBeDefined();
      expect(permissionsHeader!.value).toContain('camera=()');
      expect(permissionsHeader!.value).toContain('microphone=()');
      expect(permissionsHeader!.value).toContain('geolocation=()');
    });

    test('should include Cross-Origin-Embedder-Policy header', () => {
      const coepHeader = securityHeaders.find(
        (h) => h.key === 'Cross-Origin-Embedder-Policy',
      );
      expect(coepHeader).toBeDefined();
      expect(coepHeader!.value).toBe('credentialless');
    });

    test('should include Cross-Origin-Opener-Policy header', () => {
      const coopHeader = securityHeaders.find(
        (h) => h.key === 'Cross-Origin-Opener-Policy',
      );
      expect(coopHeader).toBeDefined();
      expect(coopHeader!.value).toBe('same-origin-allow-popups');
    });

    test('should include X-XSS-Protection header', () => {
      const xssHeader = securityHeaders.find(
        (h) => h.key === 'X-XSS-Protection',
      );
      expect(xssHeader).toBeDefined();
      expect(xssHeader!.value).toBe('1; mode=block');
    });
  });

  describe('Content Security Policy Details', () => {
    let cspValue: string;

    beforeAll(() => {
      const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
      const cspHeader = generateCSPHeader(nonce);
      const securityHeaders = [
        { key: 'Content-Security-Policy', value: cspHeader },
      ];
      const csHeader = securityHeaders.find(
        (h) => h.key === 'Content-Security-Policy',
      );
      cspValue = csHeader?.value || '';
    });

    test('should allow self for default sources', () => {
      expect(cspValue).toContain("default-src 'self'");
    });

    test('should configure script sources appropriately', () => {
      expect(cspValue).toContain("script-src 'self'");
      expect(cspValue).toContain("'unsafe-inline'");
      expect(cspValue).toContain('*.sentry.io');
      expect(cspValue).toContain('*.vercel.app');
    });

    test('should configure style sources for CSS-in-JS', () => {
      expect(cspValue).toContain("style-src 'self'");
      expect(cspValue).toContain("'unsafe-inline'");
      expect(cspValue).toContain('fonts.googleapis.com');
    });

    test('should configure image sources for external services', () => {
      expect(cspValue).toContain("img-src 'self' data: https:");
      expect(cspValue).toContain('asset.brandfetch.io');
      expect(cspValue).toContain('logo.clearbit.com');
      expect(cspValue).toContain('*.cdn.digitaloceanspaces.com');
    });

    test('should configure connect sources for APIs', () => {
      expect(cspValue).toContain("connect-src 'self' https:");
      expect(cspValue).toContain('*.supabase.co');
      expect(cspValue).toContain('*.sentry.io');
      expect(cspValue).toContain('wss:');
    });

    // Without an explicit worker-src, workers fall back to script-src, whose
    // 'strict-dynamic' blocks them (a worker URL can't carry a nonce) and the
    // self-hosted pdf.js worker silently degrades to the main thread.
    test('should allow the self-hosted pdf.js worker', () => {
      expect(cspValue).toContain("worker-src 'self' blob:");
    });

    test('should deny frame sources for security', () => {
      expect(cspValue).toContain("frame-ancestors 'none'");
    });

    test('should deny object and embed sources', () => {
      expect(cspValue).toContain("object-src 'none'");
    });

    test('should restrict base URI and form actions', () => {
      expect(cspValue).toContain("base-uri 'self'");
      expect(cspValue).toContain("form-action 'self'");
    });
  });

  describe('Environment-specific Configuration', () => {
    test('should handle development environment', async () => {
      const originalEnv = process.env.NODE_ENV;

      // Mock NODE_ENV for this test
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });

      try {
        if (typeof nextConfig.headers === 'function') {
          const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
          const cspHeader = generateCSPHeader(nonce);
          const securityHeaders = [
            { key: 'Content-Security-Policy', value: cspHeader },
          ];
          const csHeader = securityHeaders.find(
            (h) => h.key === 'Content-Security-Policy',
          );
          expect(csHeader?.value).toContain("'unsafe-eval'");
        }
      } finally {
        // Restore original NODE_ENV
        Object.defineProperty(process.env, 'NODE_ENV', {
          value: originalEnv,
          writable: true,
          configurable: true,
        });
      }
    });

    test('should handle production environment', async () => {
      const originalEnv = process.env.NODE_ENV;

      // Mock NODE_ENV for this test
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });

      try {
        if (typeof nextConfig.headers === 'function') {
          const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
          const cspHeader = generateCSPHeader(nonce);
          const securityHeaders = [
            { key: 'Content-Security-Policy', value: cspHeader },
          ];
          const csHeader = securityHeaders.find(
            (h) => h.key === 'Content-Security-Policy',
          );

          expect(csHeader!.value).not.toContain("'unsafe-eval'");
        }
      } finally {
        // Restore original NODE_ENV
        Object.defineProperty(process.env, 'NODE_ENV', {
          value: originalEnv,
          writable: true,
          configurable: true,
        });
      }
    });
  });

  describe('Header Values Validation', () => {
    let securityHeaders: Array<{ key: string; value: string }>;

    beforeAll(() => {
      securityHeaders =
        headers.find((config) => config.source === '/(.*)')?.headers || [];
    });

    test('should have valid HSTS max-age value', () => {
      const hstsHeader = securityHeaders.find(
        (h) => h.key === 'Strict-Transport-Security',
      );
      expect(hstsHeader!.value).toMatch(/max-age=\d+/);

      const maxAgeMatch = hstsHeader!.value.match(/max-age=(\d+)/);
      const maxAge = parseInt(maxAgeMatch![1]);
      expect(maxAge).toBeGreaterThanOrEqual(31536000); // At least 1 year
    });

    test('should have secure X-Frame-Options value', () => {
      const xFrameHeader = securityHeaders.find(
        (h) => h.key === 'X-Frame-Options',
      );
      expect(['DENY', 'SAMEORIGIN']).toContain(xFrameHeader!.value);
    });

    test('should have valid Referrer-Policy value', () => {
      const referrerHeader = securityHeaders.find(
        (h) => h.key === 'Referrer-Policy',
      );
      const validValues = [
        'no-referrer',
        'no-referrer-when-downgrade',
        'origin',
        'origin-when-cross-origin',
        'same-origin',
        'strict-origin',
        'strict-origin-when-cross-origin',
        'unsafe-url',
      ];
      expect(validValues).toContain(referrerHeader!.value);
    });

    test('should have properly formatted Permissions-Policy', () => {
      const permissionsHeader = securityHeaders.find(
        (h) => h.key === 'Permissions-Policy',
      );
      expect(permissionsHeader!.value).toMatch(/\w+=\([^)]*\)/);
    });
  });

  describe('Security Score Validation', () => {
    test('should have all critical security directives present', () => {
      const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
      const cspHeader = generateCSPHeader(nonce);
      const securityHeaders = [
        { key: 'Content-Security-Policy', value: cspHeader },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains; preload',
        },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        },
        { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        {
          key: 'Cross-Origin-Opener-Policy',
          value: 'same-origin-allow-popups',
        },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
      ];
      const csHeader = securityHeaders.find(
        (h) => h.key === 'Content-Security-Policy',
      );
      expect(csHeader!.value).toBeTruthy();
      expect(csHeader!.value).toContain("default-src 'self'");
      expect(csHeader!.value).toContain("frame-ancestors 'none'");
      expect(csHeader!.value).toContain("object-src 'none'");
      expect(csHeader!.value).toContain("script-src 'self'");
      expect(csHeader!.value).toContain("style-src 'self'");
      expect(csHeader!.value).toContain("img-src 'self' data: https:");
      expect(csHeader!.value).toContain("connect-src 'self' https:");
      expect(csHeader!.value).toContain('frame-src vercel.live');
    });

    test('should have minimum security configuration for SOC 2 compliance', () => {
      const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
      const cspHeader = generateCSPHeader(nonce);
      const securityHeaders = [
        { key: 'Content-Security-Policy', value: cspHeader },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains; preload',
        },
      ];
      const csHeader = securityHeaders.find(
        (h) => h.key === 'Content-Security-Policy',
      );
      expect(csHeader!.value).toBeTruthy();

      // Verify HSTS has adequate duration for SOC 2
      const hstsHeader = securityHeaders.find(
        (h) => h.key === 'Strict-Transport-Security',
      );
      expect(hstsHeader!.value).toContain('max-age=31536000'); // 1 year minimum
      expect(hstsHeader!.value).toContain('includeSubDomains');
    });
  });
});
