# Security Headers Configuration

## Overview

This document describes the comprehensive security headers implementation for SOC 2 compliance. The security headers are configured in `next.config.js` and provide protection against common web vulnerabilities including XSS, clickjacking, MITM attacks, and data injection.

## Implementation

### Configuration Location

Security headers are configured in the `headers()` function within `next.config.js`. The configuration applies to all routes using the `/(.*)`source pattern.

### Environment-Specific Behavior

The CSP (Content Security Policy) configuration adapts based on the `NODE_ENV`:

- **Development**: Includes `'unsafe-eval'` directive for hot reloading and development tools
- **Production**: Excludes `'unsafe-eval'` for enhanced security

## Security Headers Implemented

### Critical Security Headers (SOC 2 Required)

#### 1. Content Security Policy (CSP)

- **Header**: `Content-Security-Policy`
- **Purpose**: Prevents XSS and data injection attacks
- **Configuration**:
  - `default-src 'self'` - Default fallback to same origin
  - `script-src` - Allows self, Sentry, Vercel, and inline scripts
  - `style-src` - Allows self, inline styles, and Google Fonts
  - `img-src` - Allows self, data URIs, HTTPS, and specified image services
  - `connect-src` - Allows self, HTTPS, Supabase, Sentry, Vercel, and WebSocket
  - `frame-src 'none'` - Prevents iframe embedding
  - `object-src 'none'` - Blocks object/embed elements
  - `frame-ancestors 'none'` - Prevents clickjacking

#### 2. HTTP Strict Transport Security (HSTS)

- **Header**: `Strict-Transport-Security`
- **Value**: `max-age=31536000; includeSubDomains; preload`
- **Purpose**: Enforces HTTPS connections for 1 year, including subdomains

#### 3. X-Frame-Options

- **Header**: `X-Frame-Options`
- **Value**: `DENY`
- **Purpose**: Prevents clickjacking by blocking iframe embedding

#### 4. X-Content-Type-Options

- **Header**: `X-Content-Type-Options`
- **Value**: `nosniff`
- **Purpose**: Prevents MIME type sniffing attacks

#### 5. Referrer-Policy

- **Header**: `Referrer-Policy`
- **Value**: `strict-origin-when-cross-origin`
- **Purpose**: Balances privacy and functionality for referrer information

### Advanced Security Headers

#### 6. Permissions-Policy

- **Header**: `Permissions-Policy`
- **Value**: `camera=(), microphone=(), geolocation=(), payment=(), usb=()`
- **Purpose**: Disables potentially sensitive browser APIs

#### 7. Cross-Origin-Embedder-Policy (COEP)

- **Header**: `Cross-Origin-Embedder-Policy`
- **Value**: `credentialless`
- **Purpose**: Controls cross-origin resource embedding with credentials

#### 8. Cross-Origin-Opener-Policy (COOP)

- **Header**: `Cross-Origin-Opener-Policy`
- **Value**: `same-origin-allow-popups`
- **Purpose**: Prevents cross-origin attacks via popup windows

#### 9. X-XSS-Protection (Legacy)

- **Header**: `X-XSS-Protection`
- **Value**: `1; mode=block`
- **Purpose**: Legacy XSS protection for older browsers

## Third-Party Service Compatibility

The CSP configuration specifically allows the following external services:

### Image Sources

- `asset.brandfetch.io` - Brand logos and assets
- `logo.clearbit.com` - Company logos
- `*.cdn.digitaloceanspaces.com` - CDN content
- `img.logo.dev` - Logo service

### Script and Connect Sources

- `*.sentry.io` - Error monitoring and performance tracking
- `*.vercel.app` - Vercel platform services
- `*.vercel-insights.com` - Analytics and insights
- `*.supabase.co` - Backend services and APIs

### Style Sources

- `fonts.googleapis.com` - Google Fonts
- `fonts.gstatic.com` - Google Fonts static assets

## Testing and Validation

### Automated Testing

Security headers are validated through comprehensive Jest tests located in `__tests__/security-headers.test.ts`:

- **29 test cases** covering all security headers
- **Environment-specific testing** for development vs production CSP
- **Value validation** for header formats and compliance
- **SOC 2 compliance verification**

Run tests with:

```bash
npm test __tests__/security-headers.test.ts
```

### Manual Validation

Use the security headers validation script:

```bash
# Start the application
npm run dev  # or npm start for production

# Validate headers
node scripts/validate-security-headers.js [URL]
```

The script provides:

- Detailed header analysis
- Security score calculation
- SOC 2 compliance verification
- Issue identification and recommendations

### Online Validation Tools

Recommended external validation services:

- [SecurityHeaders.com](https://securityheaders.com)
- [Mozilla Observatory](https://observatory.mozilla.org)
- [CSP Evaluator](https://csp-evaluator.withgoogle.com)

## SOC 2 Compliance

This security headers implementation satisfies SOC 2 Type II requirements for:

### Security Controls

- **CC6.1** - Logical and physical access controls
- **CC6.7** - Transmission of data protection
- **CC6.8** - Prevention of unauthorized access

### Trust Service Criteria

- **Data transmission security** via HSTS and secure CSP
- **Content injection prevention** via CSP and X-Content-Type-Options
- **Clickjacking protection** via X-Frame-Options and CSP frame-ancestors
- **Cross-site scripting mitigation** via comprehensive CSP

## Troubleshooting

### Common Issues

#### CSP Violations

If you encounter CSP violations in the browser console:

1. **Inline scripts/styles**: Add specific nonces or move to external files
2. **Third-party services**: Add domains to appropriate CSP directives
3. **Data URIs**: Ensure `data:` is included in relevant directives

#### Development Issues

- CSP includes `'unsafe-eval'` in development mode for hot reloading
- Adjust CSP directives if new development tools are added

#### Integration Issues

- Verify new third-party services are added to CSP allow-lists
- Test headers don't break existing functionality after updates

### Header Modification

To modify security headers:

1. **Update** `next.config.js` in the `headers()` function
2. **Test** changes with the validation script
3. **Verify** no functionality is broken
4. **Run** the automated test suite
5. **Deploy** and validate in production

## Maintenance

### Regular Tasks

- **Monthly**: Validate headers with online tools
- **Quarterly**: Review and update CSP directives for new services
- **Annually**: Review HSTS max-age and security best practices

### Security Updates

- Monitor security advisories for new header recommendations
- Update CSP directives when adding new third-party integrations
- Regularly audit and remove unused CSP allowances

## References

- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
- [MDN Security Headers Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers#security)
- [SOC 2 Security Controls](https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/aicpasoc2report)
- [Content Security Policy Level 3](https://w3c.github.io/webappsec-csp/)
