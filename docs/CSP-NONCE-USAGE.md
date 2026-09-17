# CSP Nonce Usage Guide

## Overview

The application implements Content Security Policy (CSP) with nonces to prevent XSS attacks. The proxy (`proxy.ts`) generates a unique cryptographic nonce for each request and sets it in the `x-nonce` header.

## Proxy Configuration

The nonce is generated and set in `proxy.ts`:

```typescript
// Generate cryptographic nonce for CSP
const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
const cspHeader = generateCSPHeader(nonce);

// Helper to add CSP headers to any response
const addCSPHeaders = (response: NextResponse): NextResponse => {
  response.headers.set('x-nonce', nonce);
  response.headers.set('Content-Security-Policy', cspHeader);
  return response;
};
```

## Using Nonces in Server Components

### Reading the Nonce

To use the nonce in a server component, import `headers` from `next/headers` and read the `x-nonce` header:

```typescript
import { headers } from 'next/headers';

export default async function MyServerComponent() {
  const nonce = headers().get('x-nonce') || undefined;

  // Use the nonce...
}
```

### Passing to Script Components

When adding Next.js Script components, pass the nonce via the `nonce` prop:

```typescript
import Script from 'next/script';
import { headers } from 'next/headers';

export default async function MyPage() {
  const nonce = headers().get('x-nonce') || undefined;

  return (
    <>
      <Script
        src="https://example.com/script.js"
        strategy="afterInteractive"
        nonce={nonce}
      />
      {/* Your page content */}
    </>
  );
}
```

### Inline Scripts

For inline scripts in server components, use the nonce attribute:

```typescript
import { headers } from 'next/headers';

export default async function MyPage() {
  const nonce = headers().get('x-nonce') || undefined;

  return (
    <>
      <script nonce={nonce} dangerouslySetInnerHTML={{
        __html: `console.log('This inline script has a nonce');`
      }} />
    </>
  );
}
```

## Important Notes

### Server Components Only

- **Only use `headers()` in server components**. Client components (with `'use client'`) cannot access request headers at runtime.
- If you need the nonce in a client component, pass it down as a prop from a server component parent.

### Handling Missing Nonces

Always handle cases where the nonce might be missing or null:

```typescript
const nonce = headers().get('x-nonce') || undefined;
// or
const nonce = headers().get('x-nonce') ?? '';
```

### CSP strict-dynamic

The CSP uses `'strict-dynamic'` which means:

- Scripts loaded by trusted (nonce-tagged) scripts are automatically trusted
- Third-party analytics libraries that load additional scripts dynamically will work once the initial script has a nonce

### Style Tags

The current CSP allows `'unsafe-inline'` for styles, so nonces are not strictly required for inline styles. However, for maximum security, consider using nonces for inline styles as well.

## Current Implementation

The root layout (`app/layout.tsx`) already reads the nonce:

```typescript
const nonce = headers().get('x-nonce') || undefined;
```

This nonce is available for use with any Script components added to the layout.

## Example: Root Layout

See `app/layout.tsx` for a working example of reading the nonce in a server component.

## Testing

When adding Script components with nonces:

1. Verify the script loads correctly in the browser
2. Check the browser console for CSP violations
3. Use browser DevTools Security panel to verify CSP headers
4. Test that the nonce is different on each page load

## References

- [Next.js CSP Documentation](https://nextjs.org/docs/app/guides/content-security-policy)
- [Next.js Script Component](https://nextjs.org/docs/app/api-reference/components/script)
- [CSP strict-dynamic](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src#strict-dynamic)
