#!/usr/bin/env node

/**
 * Security Headers Validation Script
 *
 * This script validates the presence and correctness of security headers
 * in the application's HTTP responses. It can be used for continuous
 * integration and monitoring purposes.
 */

const http = require('http');
const https = require('https');

const REQUIRED_HEADERS = {
  'content-security-policy': {
    required: true,
    mustContain: [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
    ],
    description:
      'Content Security Policy - Prevents XSS and data injection attacks',
  },
  'strict-transport-security': {
    required: true,
    mustContain: ['max-age=31536000', 'includeSubDomains'],
    description: 'HTTP Strict Transport Security - Enforces HTTPS connections',
  },
  'x-frame-options': {
    required: true,
    validValues: ['DENY', 'SAMEORIGIN'],
    description: 'X-Frame-Options - Prevents clickjacking attacks',
  },
  'x-content-type-options': {
    required: true,
    validValues: ['nosniff'],
    description: 'X-Content-Type-Options - Prevents MIME type sniffing',
  },
  'referrer-policy': {
    required: true,
    validValues: [
      'no-referrer',
      'no-referrer-when-downgrade',
      'origin',
      'origin-when-cross-origin',
      'same-origin',
      'strict-origin',
      'strict-origin-when-cross-origin',
      'unsafe-url',
    ],
    description: 'Referrer-Policy - Controls referrer information sharing',
  },
  'permissions-policy': {
    required: false,
    mustContain: ['camera=()', 'microphone=()', 'geolocation=()'],
    description: 'Permissions-Policy - Controls browser features and APIs',
  },
  'cross-origin-embedder-policy': {
    required: false,
    validValues: ['unsafe-none', 'require-corp', 'credentialless'],
    description:
      'Cross-Origin-Embedder-Policy - Controls cross-origin resource embedding',
  },
  'cross-origin-opener-policy': {
    required: false,
    validValues: ['unsafe-none', 'same-origin-allow-popups', 'same-origin'],
    description:
      'Cross-Origin-Opener-Policy - Prevents cross-origin attacks via popups',
  },
  'x-xss-protection': {
    required: false,
    validValues: ['0', '1', '1; mode=block'],
    description: 'X-XSS-Protection - Legacy XSS protection for older browsers',
  },
};

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const req = protocol.request(url, { method: 'HEAD' }, (res) => {
      resolve({
        statusCode: res.statusCode,
        headers: res.headers,
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

function validateHeader(headerName, headerValue, requirements) {
  const results = {
    present: !!headerValue,
    valid: false,
    issues: [],
  };

  if (!headerValue) {
    if (requirements.required) {
      results.issues.push(`Missing required header: ${headerName}`);
    }
    return results;
  }

  // Check valid values
  if (requirements.validValues) {
    if (!requirements.validValues.includes(headerValue)) {
      results.issues.push(`Invalid value for ${headerName}: ${headerValue}`);
      return results;
    }
  }

  // Check must contain
  if (requirements.mustContain) {
    for (const mustContain of requirements.mustContain) {
      if (!headerValue.includes(mustContain)) {
        results.issues.push(
          `${headerName} missing required content: ${mustContain}`,
        );
      }
    }
  }

  results.valid = results.issues.length === 0;
  return results;
}

function calculateSecurityScore(results) {
  const totalHeaders = Object.keys(REQUIRED_HEADERS).length;
  const requiredHeaders = Object.values(REQUIRED_HEADERS).filter(
    (h) => h.required,
  ).length;

  let score = 0;
  let maxScore = 0;

  for (const [headerName, requirements] of Object.entries(REQUIRED_HEADERS)) {
    const result = results[headerName];
    const weight = requirements.required ? 2 : 1;
    maxScore += weight;

    if (result && result.present && result.valid) {
      score += weight;
    } else if (result && result.present && !requirements.required) {
      score += 0.5; // Partial credit for optional headers that are present but invalid
    }
  }

  return Math.round((score / maxScore) * 100);
}

async function validateSecurityHeaders(url) {
  console.log(`🔍 Validating security headers for: ${url}\n`);

  try {
    const response = await makeRequest(url);

    if (response.statusCode >= 400) {
      console.error(`❌ HTTP Error: ${response.statusCode}`);
      return false;
    }

    const results = {};
    let hasErrors = false;
    let hasWarnings = false;

    console.log('📋 Security Headers Analysis:\n');

    for (const [headerName, requirements] of Object.entries(REQUIRED_HEADERS)) {
      const headerValue = response.headers[headerName.toLowerCase()];
      const result = validateHeader(headerName, headerValue, requirements);
      results[headerName] = result;

      const status = result.present
        ? result.valid
          ? '✅'
          : '⚠️ '
        : requirements.required
          ? '❌'
          : '⚪';

      console.log(`${status} ${headerName.toUpperCase()}`);
      console.log(`   ${requirements.description}`);

      if (headerValue) {
        console.log(`   Value: ${headerValue}`);
      } else {
        console.log(`   Value: Not present`);
      }

      if (result.issues.length > 0) {
        result.issues.forEach((issue) => {
          console.log(`   Issue: ${issue}`);
        });

        if (requirements.required) {
          hasErrors = true;
        } else {
          hasWarnings = true;
        }
      }

      console.log('');
    }

    const score = calculateSecurityScore(results);
    console.log(`🎯 Security Score: ${score}/100`);

    if (score >= 90) {
      console.log('🎉 Excellent security header configuration!');
    } else if (score >= 75) {
      console.log('👍 Good security header configuration');
    } else if (score >= 50) {
      console.log(
        '⚠️  Moderate security header configuration - improvements needed',
      );
    } else {
      console.log(
        '❌ Poor security header configuration - immediate attention required',
      );
    }

    if (hasErrors) {
      console.log(
        '\n❌ Critical issues found that must be addressed for SOC 2 compliance',
      );
      return false;
    }

    if (hasWarnings) {
      console.log(
        '\n⚠️  Some optional headers have issues but core security is intact',
      );
    }

    console.log('\n✅ Security headers validation passed');
    return true;
  } catch (error) {
    console.error(`❌ Failed to validate headers: ${error.message}`);
    return false;
  }
}

// Main execution
async function main() {
  const url = process.argv[2] || 'http://localhost:3000';

  console.log('🛡️  Security Headers Validator\n');
  console.log('This tool validates security headers for SOC 2 compliance\n');

  const isValid = await validateSecurityHeaders(url);
  process.exit(isValid ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { validateSecurityHeaders, REQUIRED_HEADERS };
