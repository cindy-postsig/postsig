import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/database.types';

export interface BackfillArgs {
  org: string | null;
  envPath: string;
  dryRun: boolean;
}

export function parseBackfillArgs(args: string[]): BackfillArgs {
  let org: string | null = null;
  let envPath = '.env.local';
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (flag !== '--org' && flag !== '--env') {
      throw new Error(`Unknown argument: ${flag}`);
    }
    // A bare or empty --org must not fall through to "every organization".
    const value = args[++i];
    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} requires a value`);
    }
    if (flag === '--org') org = value;
    else envPath = value;
  }
  return { org, envPath, dryRun };
}

/**
 * Service-role client from ONE env file, loaded into an isolated object so
 * prod credentials are never mixed into process.env.
 */
export function clientFromEnv(envPath: string): SupabaseClient<Database> {
  const env: Record<string, string> = {};
  config({ path: envPath, processEnv: env });
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      `${envPath} missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.`,
    );
  }
  console.log(`✓ DB: ${url}`);
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

const DB_PAGE_SIZE = 1000;

/** PostgREST caps responses at max_rows (1000), so read every page. */
export async function fetchAllRows<T>(
  buildQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += DB_PAGE_SIZE) {
    const { data, error } = await buildQuery(offset, offset + DB_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < DB_PAGE_SIZE) break;
  }
  return rows;
}
