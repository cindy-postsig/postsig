import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from '@jest/globals';

const MIGRATIONS_DIR = path.join(__dirname, '../../supabase/migrations');
const TYPES_PATH = path.join(__dirname, '../../database.types.ts');

/**
 * Located by name, not by timestamp: a migration gets renamed whenever one
 * already sitting on that second lands first, and this suite is about what the
 * migration declares rather than when it runs.
 */
function readCreditsMigration(): string {
  const matches = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('_contract_product_credits.sql'));
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one contract_product_credits migration, found ${matches.length}`,
    );
  }
  return fs.readFileSync(path.join(MIGRATIONS_DIR, matches[0]), 'utf8');
}

const sql = readCreditsMigration();
const types = fs.readFileSync(TYPES_PATH, 'utf8');

/**
 * Credits are financial rows on a tenant's contract, so the guarantees below
 * are the ones that cannot be re-added later without a backfill: tenancy is
 * enforced by a constraint rather than by RLS alone, the amount cannot be
 * stored signed, and every change is audited.
 */
describe('contract_product_credits migration', () => {
  it('creates the table', () => {
    expect(sql).toMatch(/create table public\.contract_product_credits/);
  });

  it('enforces the positive-magnitude convention in the database', () => {
    // The negative sign is presentation. A signed row here would be rendered
    // as a charge by the display, which negates whatever it is given.
    expect(sql).toContain('check (amount >= 0)');
  });

  it('rejects a year below the first year of the term', () => {
    expect(sql).toContain('check (year >= 1)');
  });

  it('binds the row to a tenant with a composite foreign key', () => {
    // A cross-org reference must be a constraint violation, not an RLS gap.
    expect(sql).toMatch(
      /foreign key \(organization_id, contract_id\) references public\.contracts\(organization_id, id\) on delete cascade/,
    );
  });

  it('cascades from the product it credits', () => {
    expect(sql).toMatch(
      /foreign key \(product_id\) references public\.vendor_products\(id\) on delete cascade/,
    );
  });

  it('audits every change, which is what stands in for a versions table', () => {
    expect(sql).toContain('audit_contract_product_credits_trigger');
    expect(sql).toContain('execute function audit_trigger_function()');
  });

  it('enables row level security', () => {
    expect(sql).toContain(
      'alter table public.contract_product_credits enable row level security',
    );
  });

  it('scopes reads to contracts the user can already see', () => {
    expect(sql).toContain('"contract_product_credits_read"');
    expect(sql).toContain('contracts_visible_to(');
  });

  it('grants authenticated select and no write', () => {
    expect(sql).toContain(
      'grant select on public.contract_product_credits to authenticated',
    );
    expect(sql).not.toMatch(
      /grant (insert|update|delete)[^;]*contract_product_credits/,
    );
  });

  it('denies anon outright', () => {
    expect(sql).toContain('"contract_product_credits_anon_deny"');
  });

  it('indexes the contract it hangs off', () => {
    expect(sql).toContain('idx_contract_product_credits_contract');
  });

  it('carries updated_at, which the generic edit save path stamps', () => {
    expect(sql).toMatch(/updated_at timestamptz not null default now\(\)/);
  });

  it('is reflected in the hand-maintained generated types', () => {
    expect(types).toContain('contract_product_credits: {');
  });
});
