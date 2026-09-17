import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.join(
  __dirname,
  '../../supabase/migrations/20260227000000_module_audit_logs.sql',
);

const TARGET_TABLES = [
  'inv_companies',
  'inv_fund',
  'inv_company',
  'inv_security',
  'inv_security_terms',
  'inv_financing_round',
  'inv_round_terms',
  'inv_information_rights',
  'inv_cap_table_snapshot',
  'inv_transaction',
  'inv_co_investor',
  'inv_board_seat',
  'inv_equity_plan',
  'inv_equity_plan_snapshot',
  'inv_fund_acl_user',
  'inv_fund_acl_group',
  'inv_company_acl_user',
  'inv_company_acl_group',
  'module_documents',
];

const EXCLUDED_TABLES = [
  'inv_stages',
  'inv_snapshot_types',
  'module_document_files',
];

let sql: string;

beforeAll(() => {
  sql = fs.readFileSync(MIGRATION_PATH, 'utf-8');
});

function extractTriggerArray(): string {
  const match = sql.match(/SELECT unnest\(ARRAY\[([\s\S]*?)\]\)/);
  expect(match).not.toBeNull();
  return match![1];
}

// Task 1.1: module_audit_logs table

test('table has UUID PK with gen_random_uuid()', () => {
  expect(sql).toMatch(/CREATE TABLE.*module_audit_logs/s);
  expect(sql).toMatch(
    /id\s+UUID\s+PRIMARY KEY\s+DEFAULT\s+gen_random_uuid\(\)/,
  );
});

test('table has nullable organization_id FK to organizations', () => {
  expect(sql).toMatch(
    /organization_id\s+UUID\s+REFERENCES\s+organizations\(id\)/,
  );
});

test('table has nullable user_id FK to users', () => {
  expect(sql).toMatch(/user_id\s+UUID\s+REFERENCES\s+users\(id\)/);
});

test('table has required action, table_name, and record_id columns', () => {
  expect(sql).toMatch(/action\s+TEXT\s+NOT NULL/);
  expect(sql).toMatch(/table_name\s+TEXT\s+NOT NULL/);
  expect(sql).toMatch(/record_id\s+TEXT\s+NOT NULL/);
});

test('table has context_company_id FK to inv_company with ON DELETE SET NULL', () => {
  expect(sql).toMatch(
    /context_company_id\s+BIGINT\s+REFERENCES\s+inv_company\(id\)\s+ON DELETE SET NULL/,
  );
});

test('table has context_fund_id FK to inv_fund with ON DELETE SET NULL', () => {
  expect(sql).toMatch(
    /context_fund_id\s+BIGINT\s+REFERENCES\s+inv_fund\(id\)\s+ON DELETE SET NULL/,
  );
});

test('table has JSONB old_values and new_values columns', () => {
  expect(sql).toMatch(/old_values\s+JSONB/);
  expect(sql).toMatch(/new_values\s+JSONB/);
});

test('table has changed_fields TEXT[] column', () => {
  expect(sql).toMatch(/changed_fields\s+TEXT\[\]/);
});

test('table has source with default web_ui and ip_address', () => {
  expect(sql).toMatch(/source\s+TEXT\s+DEFAULT\s+'web_ui'/);
  expect(sql).toMatch(/ip_address\s+TEXT/);
});

test('table has created_at TIMESTAMPTZ NOT NULL DEFAULT now()', () => {
  expect(sql).toMatch(
    /created_at\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT\s+now\(\)/,
  );
});

test('table has all required indexes', () => {
  expect(sql).toContain('idx_module_audit_logs_org');
  expect(sql).toContain('idx_module_audit_logs_table_record');
  expect(sql).toContain('idx_module_audit_logs_company');
  expect(sql).toContain('idx_module_audit_logs_fund');
  expect(sql).toContain('idx_module_audit_logs_created');
  expect(sql).toContain('idx_module_audit_logs_user');
});

// Task 1.2: module_audit_trigger_function()

test('function is SECURITY DEFINER with search_path set', () => {
  expect(sql).toMatch(
    /CREATE OR REPLACE FUNCTION.*module_audit_trigger_function/s,
  );
  expect(sql).toContain('SECURITY DEFINER');
  expect(sql).toContain("SET search_path TO 'public', 'pg_temp'");
});

test('function extracts user_id from auth.uid()', () => {
  expect(sql).toContain('auth.uid()');
});

test('function extracts organization_id from both column names', () => {
  expect(sql).toMatch(/v_record \? 'organization_id'/);
  expect(sql).toMatch(/v_record \? 'org_id'/);
});

test('function extracts context_company_id with inv_company self-reference', () => {
  expect(sql).toContain("WHEN TG_TABLE_NAME = 'inv_company'");
  expect(sql).toMatch(/v_record \? 'company_id'/);
});

test('function extracts context_fund_id with inv_fund self-reference and designating_fund_id', () => {
  expect(sql).toContain("WHEN TG_TABLE_NAME = 'inv_fund'");
  expect(sql).toMatch(/v_record \? 'fund_id'/);
  expect(sql).toMatch(/v_record \? 'designating_fund_id'/);
});

test('function handles composite PKs for all 4 ACL tables', () => {
  expect(sql).toContain("WHEN 'inv_fund_acl_user'");
  expect(sql).toContain("WHEN 'inv_fund_acl_group'");
  expect(sql).toContain("WHEN 'inv_company_acl_user'");
  expect(sql).toContain("WHEN 'inv_company_acl_group'");
});

test('function computes changed_fields on UPDATE using IS DISTINCT FROM', () => {
  expect(sql).toContain('v_changed_fields');
  expect(sql).toContain('IS DISTINCT FROM');
});

test('function maps TG_OP to CREATE/UPDATE/DELETE', () => {
  expect(sql).toContain("v_action := 'CREATE'");
  expect(sql).toContain("v_action := 'UPDATE'");
  expect(sql).toContain("v_action := 'DELETE'");
});

test('function reads source from current_setting with fallback', () => {
  expect(sql).toContain("current_setting('app.audit_source', true)");
});

test('function reads ip_address from current_setting', () => {
  expect(sql).toContain("current_setting('app.ip_address', true)");
});

test('function applies redact_sensitive_jsonb()', () => {
  expect(sql).toContain('redact_sensitive_jsonb');
});

test('function wraps INSERT in EXCEPTION WHEN OTHERS with RAISE WARNING', () => {
  expect(sql).toContain('EXCEPTION WHEN OTHERS');
  expect(sql).toContain('RAISE WARNING');
});

test('function has self-guard for module_audit_logs table', () => {
  expect(sql).toContain("TG_TABLE_NAME = 'module_audit_logs'");
});

// Task 1.3: triggers on 19 target tables

test('trigger array includes all 19 target tables', () => {
  const triggerArray = extractTriggerArray();
  for (const table of TARGET_TABLES) {
    expect(triggerArray).toContain(`'${table}'`);
  }
});

test('trigger array excludes inv_stages, inv_snapshot_types, module_document_files', () => {
  const triggerArray = extractTriggerArray();
  for (const table of EXCLUDED_TABLES) {
    expect(triggerArray).not.toContain(`'${table}'`);
  }
});

test('trigger array does not include module_audit_logs itself', () => {
  const triggerArray = extractTriggerArray();
  expect(triggerArray).not.toContain("'module_audit_logs'");
});

test('triggers use module_audit_ naming convention', () => {
  expect(sql).toContain('module_audit_%I_trigger');
});

test('triggers use AFTER INSERT OR UPDATE OR DELETE', () => {
  expect(sql).toContain('AFTER INSERT OR UPDATE OR DELETE');
});

test('triggers call module_audit_trigger_function()', () => {
  expect(sql).toContain('EXECUTE FUNCTION module_audit_trigger_function()');
});

// Task 1.4: RLS policies

test('RLS is enabled on module_audit_logs', () => {
  expect(sql).toContain(
    'ALTER TABLE module_audit_logs ENABLE ROW LEVEL SECURITY',
  );
});

test('SELECT policy for authenticated users by organization', () => {
  expect(sql).toContain('module_audit_logs_select');
  expect(sql).toMatch(/FOR SELECT\s+TO authenticated/);
});

test('admin SELECT policy for NULL org_id rows with role 12', () => {
  expect(sql).toContain('module_audit_logs_admin_select_null_org');
  expect(sql).toContain('organization_id IS NULL');
  expect(sql).toContain('ur.role_id = 12');
});

test('anon deny policy blocks all access', () => {
  expect(sql).toContain('module_audit_logs_anon_deny');
  expect(sql).toMatch(/FOR ALL\s+TO anon\s+USING \(false\)/);
});

test('exactly 3 policies defined (no INSERT/UPDATE/DELETE for authenticated)', () => {
  const policyMatches = sql.match(/CREATE POLICY/g);
  expect(policyMatches).toHaveLength(3);
});
