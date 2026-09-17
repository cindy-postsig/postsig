'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import {
  AuthenticationError,
  AuthorizationError,
  DatabaseError,
} from '@/lib/errors';
import logger from '@/utils/pino';
import { generateTokenPlaintext, hashToken } from '@/app/lib/mcp/auth';
import {
  encryptTokenPlaintext,
  decryptTokenCiphertext,
} from '@/app/lib/mcp/token-storage';

const SETTINGS_PATH = '/settings/developer';
const DEFAULT_EXPIRY_DAYS = 30;

export type McpTokenModule = 'cpm' | 'investor';

const MODULE_SETTINGS_CODE: Record<McpTokenModule, string> = {
  cpm: 'cpm',
  investor: 'investor',
};

export interface McpTokenSummary {
  id: string;
  name: string;
  module: McpTokenModule;
  tokenPrefix: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revealable: boolean;
}

interface ListTokensResult {
  tokens: McpTokenSummary[];
}

async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new AuthenticationError('Not authenticated');
  }
  return { supabase, userId: user.id };
}

async function requireMcpEnabled(
  supabase: Awaited<ReturnType<typeof getCurrentUser>>['supabase'],
  userId: string,
  module: McpTokenModule,
): Promise<{ organizationId: string }> {
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select(
      'organization_id, organizations!users_organization_id_fkey(organization_modules(settings, app_modules(code)))',
    )
    .eq('id', userId)
    .single();
  if (userErr || !userRow?.organization_id) {
    logger.error({ err: userErr, userId }, 'mcp-tokens: org lookup failed');
    throw new DatabaseError(
      `Failed to resolve organization${userErr ? `: ${userErr.message}` : ''}`,
    );
  }
  const moduleCode = MODULE_SETTINGS_CODE[module];
  const moduleSettings = userRow.organizations?.organization_modules?.find(
    (om) => om.app_modules?.code === moduleCode,
  )?.settings as Record<string, unknown> | null | undefined;
  if (moduleSettings?.mcp_enabled !== true) {
    throw new AuthorizationError(
      `MCP server access (${module}) is not enabled for this organization`,
    );
  }
  return { organizationId: userRow.organization_id };
}

export async function listMcpTokens(
  module: McpTokenModule = 'cpm',
): Promise<ListTokensResult> {
  const { supabase, userId } = await getCurrentUser();
  await requireMcpEnabled(supabase, userId, module);

  const { data, error } = await supabase
    .from('mcp_api_tokens')
    .select(
      'id, name, module, token_prefix, scopes, created_at, expires_at, revoked_at, token_encrypted',
    )
    .eq('user_id', userId)
    .eq('module', module)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ err: error, userId }, 'mcp-tokens: list failed');
    throw new DatabaseError(`Failed to list tokens: ${error.message}`);
  }

  const tokenIds = (data ?? []).map((t) => t.id);
  const lastUsedByToken = new Map<string, string>();

  if (tokenIds.length > 0) {
    const lookups = await Promise.all(
      tokenIds.map(async (tokenId) => {
        const { data: rows, error: callsErr } = await supabase
          .from('mcp_tool_calls')
          .select('started_at')
          .eq('token_id', tokenId)
          .order('started_at', { ascending: false })
          .limit(1);
        if (callsErr) {
          logger.warn(
            { err: callsErr, userId, tokenId },
            'mcp-tokens: tool-calls lookup failed; last-used will be unknown',
          );
          return null;
        }
        return { tokenId, startedAt: rows?.[0]?.started_at ?? null };
      }),
    );
    for (const row of lookups) {
      if (row?.startedAt) lastUsedByToken.set(row.tokenId, row.startedAt);
    }
  }

  return {
    tokens: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      module: row.module as McpTokenModule,
      tokenPrefix: row.token_prefix,
      scopes: row.scopes,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastUsedAt: lastUsedByToken.get(row.id) ?? null,
      revokedAt: row.revoked_at,
      revealable: Boolean(row.token_encrypted),
    })),
  };
}

export interface CreateMcpTokenInput {
  name: string;
  module?: McpTokenModule;
}

export interface CreateMcpTokenResult {
  id: string;
  name: string;
  module: McpTokenModule;
  tokenPrefix: string;
  plaintext: string;
}

export async function createMcpToken(
  input: CreateMcpTokenInput,
): Promise<CreateMcpTokenResult> {
  const { supabase, userId } = await getCurrentUser();

  const name = input.name.trim();
  if (!name) {
    throw new Error('Token name is required');
  }
  if (name.length > 80) {
    throw new Error('Token name must be 80 characters or fewer');
  }

  const tokenModule: McpTokenModule = input.module ?? 'cpm';
  const { organizationId } = await requireMcpEnabled(
    supabase,
    userId,
    tokenModule,
  );

  const { plaintext, prefix } = generateTokenPlaintext();
  const tokenHash = hashToken(plaintext);
  const tokenEncrypted = encryptTokenPlaintext(plaintext);
  const expiresAt = new Date(
    Date.now() + DEFAULT_EXPIRY_DAYS * 86_400_000,
  ).toISOString();

  const { data: row, error: insertErr } = await supabase
    .from('mcp_api_tokens')
    .insert({
      user_id: userId,
      organization_id: organizationId,
      name,
      token_hash: tokenHash,
      token_prefix: prefix,
      scopes: ['read'],
      module: tokenModule,
      token_encrypted: tokenEncrypted,
      expires_at: expiresAt,
    })
    .select('id, name, module, token_prefix')
    .single();

  if (insertErr || !row) {
    logger.error({ err: insertErr, userId }, 'mcp-tokens: insert failed');
    throw new DatabaseError(
      `Failed to create token${insertErr ? `: ${insertErr.message}` : ''}`,
    );
  }

  revalidatePath(SETTINGS_PATH);

  return {
    id: row.id,
    name: row.name,
    module: row.module as McpTokenModule,
    tokenPrefix: row.token_prefix,
    plaintext,
  };
}

export async function revealMcpToken(tokenId: string): Promise<string> {
  // No MCP-enabled gate: blocking cleanup after MCP is disabled is worse
  // than letting users revoke/reveal tokens they already own.
  const { supabase, userId } = await getCurrentUser();

  const { data, error } = await supabase
    .from('mcp_api_tokens')
    .select('token_encrypted, revoked_at')
    .eq('id', tokenId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    logger.warn(
      { err: error, userId, tokenId },
      'mcp-tokens: reveal not found',
    );
    throw new Error('Token not found');
  }

  if (data.revoked_at) {
    throw new Error('Token has been revoked');
  }

  const ciphertext = data.token_encrypted;
  if (!ciphertext) {
    throw new Error(
      'Token cannot be revealed — it was created before secure storage was enabled',
    );
  }

  try {
    return decryptTokenCiphertext(ciphertext);
  } catch (err) {
    logger.error({ err, userId, tokenId }, 'mcp-tokens: decrypt failed');
    throw new Error('Failed to decrypt token');
  }
}

export async function revokeMcpToken(tokenId: string): Promise<void> {
  const { supabase, userId } = await getCurrentUser();

  const { error } = await supabase
    .from('mcp_api_tokens')
    .update({
      revoked_at: new Date().toISOString(),
      token_encrypted: null,
    })
    .eq('id', tokenId)
    .eq('user_id', userId);

  if (error) {
    logger.error({ err: error, userId, tokenId }, 'mcp-tokens: revoke failed');
    throw new DatabaseError(`Failed to revoke token: ${error.message}`);
  }

  revalidatePath(SETTINGS_PATH);
}

export async function deleteMcpToken(tokenId: string): Promise<void> {
  const { supabase, userId } = await getCurrentUser();

  const { error } = await supabase
    .from('mcp_api_tokens')
    .delete()
    .eq('id', tokenId)
    .eq('user_id', userId);

  if (error) {
    logger.error({ err: error, userId, tokenId }, 'mcp-tokens: delete failed');
    throw new DatabaseError(`Failed to delete token: ${error.message}`);
  }

  revalidatePath(SETTINGS_PATH);
}
