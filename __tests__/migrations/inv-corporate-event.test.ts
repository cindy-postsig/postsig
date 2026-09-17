import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from '@jest/globals';

const MIGRATIONS_DIR = path.join(__dirname, '../../supabase/migrations');
const TYPES_PATH = path.join(__dirname, '../../database.types.ts');

/**
 * Located by suffix, not by timestamp: a migration gets renamed whenever one
 * already sitting on that second lands first, and this suite is about what the
 * migration declares rather than when it runs.
 */
function readMigration(suffix: string): string {
  const matches = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(suffix));
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${suffix} migration, found ${matches.length}`,
    );
  }
  return fs.readFileSync(path.join(MIGRATIONS_DIR, matches[0]), 'utf8');
}

const sql = readMigration('_inv_corporate_event.sql');
const viewSql = readMigration('_v_inv_company_valuation_corporate_events.sql');
const previousViewSql = readMigration('_position_cost_gross_deployed.sql');
const updateFnSql = readMigration('_update_corporate_event_raw.sql');
const types = fs.readFileSync(TYPES_PATH, 'utf8');

/**
 * A corporate event links predecessor and successor portfolio companies so the
 * valuation view can stop counting one investment twice. The guarantees below
 * are the ones a later backfill could not re-add: the role vocabulary, the
 * ratio living only on successor rows, tenancy on both tables, and an audit
 * trail of edits through updated_at.
 */
describe('inv_corporate_event migration', () => {
  it('creates both tables', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS inv_corporate_event \(/);
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS inv_corporate_event_party \(/,
    );
  });

  it('restricts event types to the four corporate actions', () => {
    expect(sql).toContain('CONSTRAINT inv_corporate_event_type_ck');
    expect(sql).toContain(
      "CHECK (event_type IN ('merger', 'acquisition', 'spin_off', 'reorganization'))",
    );
  });

  it('restricts party roles and keeps the ratio on successor rows only', () => {
    expect(sql).toContain('CONSTRAINT inv_corporate_event_party_role_ck');
    expect(sql).toContain("CHECK (role IN ('predecessor', 'successor'))");
    expect(sql).toContain('CONSTRAINT inv_corporate_event_party_ratio_ck');
    expect(sql).toContain('CONSTRAINT inv_corporate_event_party_ratio_role_ck');
    expect(sql).toContain(
      "CHECK ((role = 'successor') = (cost_allocation_ratio IS NOT NULL))",
    );
  });

  it('allows one row per company and role per event', () => {
    expect(sql).toContain(
      'CONSTRAINT inv_corporate_event_party_uq UNIQUE (event_id, company_id, role)',
    );
  });

  it('binds parties to an event and a company of the same organization', () => {
    // A cross-org reference must be a constraint violation, not an RLS gap.
    expect(sql).toContain(
      'CONSTRAINT inv_corporate_event_org_id_uq UNIQUE (organization_id, id)',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT inv_company_org_id_uq UNIQUE (organization_id, id)',
    );
    expect(sql).toMatch(
      /FOREIGN KEY \(organization_id, event_id\)\s+REFERENCES inv_corporate_event\(organization_id, id\) ON DELETE CASCADE/,
    );
    expect(sql).toMatch(
      /FOREIGN KEY \(organization_id, company_id\)\s+REFERENCES inv_company\(organization_id, id\) ON DELETE RESTRICT/,
    );
  });

  it('enables row level security with the org_access policy on both tables', () => {
    expect(sql).toContain(
      'ALTER TABLE inv_corporate_event ENABLE ROW LEVEL SECURITY;',
    );
    expect(sql).toContain(
      'ALTER TABLE inv_corporate_event_party ENABLE ROW LEVEL SECURITY;',
    );
    expect(sql).toMatch(
      /CREATE POLICY "org_access" ON inv_corporate_event FOR ALL/,
    );
    expect(sql).toMatch(
      /CREATE POLICY "org_access" ON inv_corporate_event_party FOR ALL/,
    );
  });

  it('maintains updated_at on both tables', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER update_inv_corporate_event_updated_at\s+BEFORE UPDATE ON inv_corporate_event/,
    );
    expect(sql).toMatch(
      /CREATE TRIGGER update_inv_corporate_event_party_updated_at\s+BEFORE UPDATE ON inv_corporate_event_party/,
    );
  });

  it('documents the superseded registry columns', () => {
    expect(sql).toContain('inv_companies.merged_into_company_id');
    expect(sql).toContain('merger_effective_date');
  });

  it('is mirrored in the generated types', () => {
    expect(types).toContain('inv_corporate_event: {');
    expect(types).toContain('inv_corporate_event_party: {');
    expect(types).toContain('successor_cost_booked: boolean');
    expect(types).toContain('cost_allocation_ratio: number | null');
  });
});

/**
 * The view is where the event changes a number. It must keep every column the
 * previous definition exposed (readers select * and map by name) and add the
 * three corporate-event columns at the end.
 */
describe('v_inv_company_valuation corporate events migration', () => {
  it('recreates the view with security_invoker', () => {
    expect(viewSql).toMatch(
      /drop view if exists "public"\."v_inv_company_valuation";/,
    );
    expect(viewSql).toMatch(
      /create or replace view "public"\."v_inv_company_valuation" as/,
    );
    expect(viewSql).toContain(
      'ALTER VIEW public.v_inv_company_valuation SET (security_invoker = true);',
    );
  });

  it('appends the three corporate-event columns', () => {
    expect(viewSql).toContain('ma.excluded_share AS ma_excluded_share');
    expect(viewSql).toContain('ma.carried_cost AS ma_carried_cost');
    expect(viewSql).toContain('ma.event_date AS ma_event_date');
    expect(types).toContain('ma_excluded_share: number | null');
    expect(types).toContain('ma_carried_cost: number | null');
    expect(types).toContain('ma_event_date: string | null');
  });

  it('keeps every column alias of the previous definition', () => {
    const previousView = previousViewSql.slice(
      previousViewSql.indexOf('"v_inv_company_valuation" as'),
    );
    const aliases = [...previousView.matchAll(/ AS ([a-z_]+),?\n/g)].map(
      (m) => m[1],
    );
    expect(aliases.length).toBeGreaterThan(20);
    for (const alias of aliases) {
      expect(viewSql).toContain(` AS ${alias}`);
    }
  });

  it('applies events only on or before the current date and after the status rule', () => {
    expect(viewSql).toContain('(e.event_date <= CURRENT_DATE)');
    expect(viewSql).toContain('(e.successor_cost_booked = false)');
    expect(viewSql).toMatch(
      /WHEN \(ic\.status = 'active'::text\) THEN\s+CASE\s+WHEN \(\(pos\.total_cost IS NULL\) AND \(ma\.carried_cost = \(0\)::numeric\)\) THEN NULL::numeric/,
    );
  });

  it('does not touch the position or fund summary views', () => {
    expect(viewSql).not.toMatch(/view "public"\."v_inv_position"/);
    expect(viewSql).not.toMatch(/view "public"\."v_inv_fund_summary"/);
  });
});

/**
 * The API replaces an event's party list and patches its scalars through one
 * database function so a failed replacement can never leave the event without
 * parties.
 */
describe('update_corporate_event_raw migration', () => {
  it('defines the function with a pinned search_path', () => {
    expect(updateFnSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.update_corporate_event_raw\(/,
    );
    expect(updateFnSql).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(types).toContain('update_corporate_event_raw: {');
  });

  it('locks the event, refuses an empty party list and replaces parties in place', () => {
    expect(updateFnSql).toMatch(/FOR UPDATE;/);
    expect(updateFnSql).toContain('jsonb_array_length(p_parties) = 0');
    expect(updateFnSql).toMatch(
      /DELETE FROM inv_corporate_event_party\s+WHERE event_id = p_event_id/,
    );
    expect(updateFnSql).toMatch(/INSERT INTO inv_corporate_event_party/);
  });

  it('patches only the columns present on the patch', () => {
    for (const column of [
      'event_type',
      'event_date',
      'announced_date',
      'successor_cost_booked',
      'cash_consideration',
      'stock_consideration',
      'deferred_consideration',
      'exchange_ratio',
      'notes',
      'metadata',
    ]) {
      expect(updateFnSql).toContain(`p_patch ? '${column}'`);
    }
  });

  it('never stores a scalar null in metadata', () => {
    expect(updateFnSql).toContain(
      "WHEN jsonb_typeof(p_patch->'metadata') = 'object' THEN p_patch->'metadata'",
    );
    expect(updateFnSql).not.toContain("COALESCE(p_patch->'metadata'");
  });
});
