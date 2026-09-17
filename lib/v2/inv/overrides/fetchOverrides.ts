/**
 * Server-side read client for investor value overrides.
 *
 * Reads go straight to Supabase (this app's primary DB) via a cached query.
 * Writes (create / revert) are mediated by the droid API — see
 * `app/lib/investor/droid-client.ts`.
 */

import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getMcpContext } from '@/app/lib/mcp/context';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';

import type { ValueOverrideRow } from './applyOverrides';

type OverrideTableDef = {
  Row: ValueOverrideRow;
  Insert: Omit<
    ValueOverrideRow,
    'id' | 'created_at' | 'reverted_at' | 'reverted_by'
  >;
  Update: Pick<ValueOverrideRow, 'reverted_at' | 'reverted_by'>;
  Relationships: [];
};

type CreateOverrideFn = {
  Args: {
    p_organization_id: string;
    p_entity_type: string;
    p_entity_id: number;
    p_field_key: string;
    p_original_value: unknown;
    p_override_value: unknown;
    p_reason: string;
    p_created_by: string;
  };
  Returns: ValueOverrideRow;
};

/**
 * Minimal schema covering `inv_value_overrides` until the migration lands in
 * the generated database.types.ts. Includes the create RPC for server actions.
 */
export type InvValueOverridesSchema = {
  public: {
    Tables: { inv_value_overrides: OverrideTableDef };
    Views: Record<string, never>;
    Functions: { create_inv_value_override: CreateOverrideFn };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// Same client selection as lib/v2/inv/service.ts: MCP routes are bearer-auth'd
// with no Supabase session cookie, so the cookie client would hit RLS as anon.
async function createOverridesClient(): Promise<
  SupabaseClient<InvValueOverridesSchema>
> {
  const client = getMcpContext()
    ? createServiceClient()
    : await createServerClient();
  return client as unknown as SupabaseClient<InvValueOverridesSchema>;
}

/**
 * Fetch every active (non-reverted) override for an org in one query.
 * Failure degrades to source values (empty list) — investor pages must not
 * 500 while the overrides feature is partially deployed — but is logged
 * loudly so a missing table/policy is visible.
 */
export const getActiveValueOverrides = cache(
  async (organizationId: string): Promise<ValueOverrideRow[]> => {
    const supabase = await createOverridesClient();

    const { data, error } = await supabase
      .from('inv_value_overrides')
      .select('*')
      .eq('organization_id', organizationId)
      .is('reverted_at', null);

    if (error) {
      logger.error(
        { organizationId, error },
        'Failed to fetch value overrides; rendering source values',
      );
      return [];
    }

    return data ?? [];
  },
);
