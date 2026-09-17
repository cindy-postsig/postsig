import type { McpModule } from '@/app/lib/mcp/auth';

export const MCP_MODULE_PATHS: Record<McpModule, string> = {
  cpm: '/cpm',
  investor: '/investor',
};

export function getMcpHosts(): Set<string> {
  const raw = process.env.MCP_HOSTS ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isMcpHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return getMcpHosts().has(host.toLowerCase());
}

function buildRewriteMap(): Record<string, string> {
  const entries: Array<[string, string]> = [];
  for (const m of Object.keys(MCP_MODULE_PATHS) as McpModule[]) {
    const publicPath = MCP_MODULE_PATHS[m];
    const internalPath = `/api/${m}/mcp`;
    entries.push([publicPath, internalPath]);
    entries.push([
      `/.well-known/oauth-protected-resource${publicPath}`,
      `/.well-known/oauth-protected-resource${internalPath}`,
    ]);
  }
  return Object.fromEntries(entries);
}

export const MCP_REWRITE_MAP: Readonly<Record<string, string>> =
  buildRewriteMap();

export const MCP_ROOT_RESPONSE = {
  service: 'PostSig MCP',
  endpoints: MCP_MODULE_PATHS,
  documentation: 'https://postsig.com/docs/mcp',
};
