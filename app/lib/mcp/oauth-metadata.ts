import { DEFAULT_URL } from '@/app/lib/constants';
import type { McpModule } from '@/app/lib/mcp/auth';
import { MCP_MODULE_PATHS, getMcpHosts } from '@/app/lib/mcp/host-gate';

// Supabase's OAuth 2.1 server only honors the four standard OIDC scopes
// (openid, profile, email, phone). Per-module read/write is enforced
// downstream via mcp_oauth_grants, not via OAuth scope. We require `openid`
// as a baseline so the issued JWT carries identity claims.
export const MCP_REQUIRED_SCOPE = 'openid';
export const MCP_MODULE_SCOPES: Record<McpModule, readonly string[]> = {
  cpm: [MCP_REQUIRED_SCOPE],
  investor: [MCP_REQUIRED_SCOPE],
};

// Fail fast on a missing scheme or accidental path so we don't publish
// broken `aud` URLs that quietly fail audience binding after deploy.
function mcpBase(): string {
  const raw = process.env.MCP_BASE_URL ?? DEFAULT_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`MCP_BASE_URL is not a valid absolute URL: ${raw}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`MCP_BASE_URL must be http(s): ${raw}`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(
      `MCP_BASE_URL must be an origin without path, query, or hash: ${raw}`,
    );
  }
  return url.origin;
}

// Short paths only resolve on hosts in MCP_HOSTS. Without a subdomain
// configured (local dev, sparse previews), emit the legacy /api/<module>/mcp
// form so strict MCP clients see a `resource` value matching the URL they
// connect to.
function publicMcpPath(module: McpModule): string {
  if (getMcpHosts().size > 0) {
    return MCP_MODULE_PATHS[module];
  }
  return `/api/${module}/mcp`;
}

export function canonicalResourceUrl(module: McpModule): string {
  return `${mcpBase()}${publicMcpPath(module)}`;
}

export function resourceMetadataUrl(module: McpModule): string {
  return `${mcpBase()}/.well-known/oauth-protected-resource${publicMcpPath(module)}`;
}

// Supabase AS issuer — base of /auth/v1/oauth/* and where AS metadata is served.
export function authorizationServerIssuer(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  }
  return `${url.replace(/\/$/, '')}/auth/v1`;
}

export function buildProtectedResourceMetadata(module: McpModule) {
  return {
    resource: canonicalResourceUrl(module),
    authorization_servers: [authorizationServerIssuer()],
    scopes_supported: [...MCP_MODULE_SCOPES[module]],
    bearer_methods_supported: ['header'],
    resource_documentation: 'https://postsig.com/docs/mcp',
  };
}

export function wwwAuthenticateHeader(module: McpModule): string {
  return `Bearer resource_metadata="${resourceMetadataUrl(module)}"`;
}
