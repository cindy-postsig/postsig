/**
 * Backfill org_units and org_employees.org_unit_id from the existing employee
 * roster (PSK-1846 phase 1). Runs the same upsert walk the employee write
 * paths use: never deletes, renames, or re-parents nodes, so re-running is
 * safe and idempotent.
 *
 *   npx tsx scripts/backfill-org-units.ts                 # all orgs with employees
 *   npx tsx scripts/backfill-org-units.ts --org <uuid>    # one org
 *   npx tsx scripts/backfill-org-units.ts --env .env.prod # another environment
 *
 * The DB comes from the env file's NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY, loaded into an isolated object so prod creds are
 * never mixed into process.env (same pattern as enrich-inv-domains).
 */
import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/database.types';
import { syncOrgUnitsForEmployees } from '@/lib/v2/org-units';

const DB_PAGE_SIZE = 1000;

export function parseArgs(args: string[]): {
  org: string | null;
  envPath: string;
} {
  let org: string | null = null;
  let envPath = '.env.local';
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag !== '--org' && flag !== '--env') {
      throw new Error(`Unknown argument: ${flag}`);
    }
    // A bare --org must not fall through to "every organization".
    const value = args[++i];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${flag} requires a value`);
    }
    if (flag === '--org') org = value;
    else envPath = value;
  }
  return { org, envPath };
}

function clientFromEnv(envPath: string): SupabaseClient<Database> {
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

async function fetchEmployeeRoster(
  client: SupabaseClient<Database>,
  organizationId: string | null,
): Promise<Map<string, number[]>> {
  const byOrg = new Map<string, number[]>();
  for (let offset = 0; ; offset += DB_PAGE_SIZE) {
    let query = client
      .from('org_employees')
      .select('id, organization_id')
      .is('deleted_at', null);
    if (organizationId) query = query.eq('organization_id', organizationId);
    const { data, error } = await query
      .order('id')
      .range(offset, offset + DB_PAGE_SIZE - 1);

    if (error) throw error;
    for (const row of data ?? []) {
      const ids = byOrg.get(row.organization_id);
      if (ids) ids.push(row.id);
      else byOrg.set(row.organization_id, [row.id]);
    }
    if (!data || data.length < DB_PAGE_SIZE) break;
  }
  return byOrg;
}

async function countOrgUnits(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<number> {
  const { count, error } = await client
    .from('org_units')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  const { org, envPath } = parseArgs(process.argv.slice(2));
  const client = clientFromEnv(envPath);

  const roster = await fetchEmployeeRoster(client, org);
  const orgIds = org ? [org] : [...roster.keys()];

  for (const organizationId of orgIds) {
    const employeeIds = roster.get(organizationId) ?? [];
    if (employeeIds.length === 0) {
      console.log(`- ${organizationId}: no employees, skipped`);
      continue;
    }
    const before = await countOrgUnits(client, organizationId);
    await syncOrgUnitsForEmployees(organizationId, employeeIds, client);
    const after = await countOrgUnits(client, organizationId);
    console.log(
      `- ${organizationId}: walked ${employeeIds.length} employees, ` +
        `org_units ${before} → ${after} (+${after - before})`,
    );
  }
  console.log('Done.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
