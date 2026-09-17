/**
 * Mint an MCP API token for a user. Run with:
 *
 *   npx tsx -r dotenv/config scripts/mcp-token-create.ts \
 *     --email user@example.com \
 *     --name "Claude Desktop" \
 *     --scopes read,write \
 *     --module cpm \
 *     --expires-days 90
 *
 * Modules:
 *   cpm       — tokens for /api/cpm/mcp (default)
 *   investor  — tokens for /api/investor/mcp
 *
 * The token is bound to a single module; it will not authenticate on the
 * other MCP endpoint. The user's org must have that module's MCP enabled
 * (organization_modules.settings.mcp_enabled = true).
 *
 * Plaintext token is printed once — copy it now, it cannot be retrieved later.
 */

import { createClient } from '@supabase/supabase-js';
import { generateTokenPlaintext, hashToken } from '@/app/lib/mcp/auth';

type Module = 'cpm' | 'investor';

interface Args {
  email?: string;
  userId?: string;
  name: string;
  scopes: string[];
  module: Module;
  expiresDays?: number;
}

const ALLOWED_MODULES: Module[] = ['cpm', 'investor'];

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Partial<Args> = { scopes: ['read'], module: 'cpm' };
  const requireValue = (flag: string, value: string | undefined): string => {
    if (!value) throw new Error(`${flag} requires a value`);
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--email') out.email = requireValue('--email', next);
    else if (a === '--user-id') out.userId = requireValue('--user-id', next);
    else if (a === '--name') out.name = requireValue('--name', next);
    else if (a === '--scopes')
      out.scopes = requireValue('--scopes', next)
        .split(',')
        .map((s) => s.trim());
    else if (a === '--module') {
      const m = requireValue('--module', next);
      if (!ALLOWED_MODULES.includes(m as Module)) {
        throw new Error(
          `Invalid module: ${m}. Allowed: ${ALLOWED_MODULES.join(', ')}`,
        );
      }
      out.module = m as Module;
    } else if (a === '--expires-days')
      out.expiresDays = parseInt(requireValue('--expires-days', next), 10);
  }
  if (!out.name) throw new Error('--name is required');
  if (!out.email && !out.userId) {
    throw new Error('--email or --user-id is required');
  }
  for (const s of out.scopes!) {
    if (s !== 'read' && s !== 'write') {
      throw new Error(`Invalid scope: ${s}. Allowed: read, write`);
    }
  }
  return out as Args;
}

async function main() {
  const args = parseArgs();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let userQuery = supabase.from('users').select('id, email, organization_id');
  userQuery = args.userId
    ? userQuery.eq('id', args.userId)
    : userQuery.eq('email', args.email!);
  const { data: user, error: userErr } = await userQuery.single();

  if (userErr || !user) {
    throw new Error(`User not found: ${args.email ?? args.userId}`);
  }

  // Avoid minting a token the route will then reject at auth time.
  const { data: orgModule, error: orgErr } = await supabase
    .from('organization_modules')
    .select('settings, app_modules!inner(code)')
    .eq('organization_id', user.organization_id)
    .eq('app_modules.code', args.module)
    .maybeSingle();

  if (orgErr) {
    throw new Error(`Failed to look up org module: ${orgErr.message}`);
  }
  const orgSettings = orgModule?.settings as
    | Record<string, unknown>
    | null
    | undefined;
  if (orgSettings?.mcp_enabled !== true) {
    throw new Error(
      `Module "${args.module}" MCP is not enabled for org ${user.organization_id}. ` +
        'Set organization_modules.settings.mcp_enabled = true first.',
    );
  }

  const { plaintext, prefix: tokenPrefix } = generateTokenPlaintext();
  const tokenHash = hashToken(plaintext);

  const expiresAt = args.expiresDays
    ? new Date(Date.now() + args.expiresDays * 86400_000).toISOString()
    : null;

  const { data: row, error: insertErr } = await supabase
    .from('mcp_api_tokens')
    .insert({
      user_id: user.id,
      organization_id: user.organization_id,
      name: args.name,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      scopes: args.scopes,
      module: args.module,
      expires_at: expiresAt,
    })
    .select('id, scopes, expires_at, module')
    .single();

  if (insertErr || !row) {
    throw new Error(`Failed to insert token: ${insertErr?.message}`);
  }

  const endpoint =
    args.module === 'investor' ? '/api/investor/mcp' : '/api/cpm/mcp';

  process.stdout.write(
    [
      'MCP token minted.',
      '',
      `  user:       ${user.email} (${user.id})`,
      `  org:        ${user.organization_id}`,
      `  name:       ${args.name}`,
      `  module:     ${row.module}`,
      `  endpoint:   ${endpoint}`,
      `  scopes:     ${row.scopes.join(', ')}`,
      `  expires_at: ${row.expires_at ?? 'never'}`,
      `  id:         ${row.id}`,
      '',
      `  TOKEN (copy now, will not be shown again):`,
      `  ${plaintext}`,
      '',
    ].join('\n'),
  );
}

main().catch((err) => {
  process.stderr.write(`error: ${err.message}\n`);
  process.exit(1);
});
