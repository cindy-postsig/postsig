import { DEFAULT_URL } from '@/app/lib/constants';

// Per MCP Streamable HTTP spec §Security Warning: "Servers MUST validate the
// Origin header on all incoming connections to prevent DNS rebinding attacks.
// If the Origin header is present and invalid, servers MUST respond with HTTP
// 403 Forbidden." If Origin is absent (typical for server-to-server MCP
// clients) we allow the request — only browser-originated requests carry it.

function parseAllowedOrigins(): Set<string> {
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(DEFAULT_URL).origin);
  } catch {
    // DEFAULT_URL malformed — fall through and rely on env list only.
  }
  const fromEnv = process.env.MCP_ALLOWED_ORIGINS;
  if (fromEnv) {
    for (const raw of fromEnv.split(',')) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      try {
        allowed.add(new URL(trimmed).origin);
      } catch {
        // skip malformed env entry
      }
    }
  }
  return allowed;
}

const allowedOrigins = parseAllowedOrigins();

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;
  try {
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}
