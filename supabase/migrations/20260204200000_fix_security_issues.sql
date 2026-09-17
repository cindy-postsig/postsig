-- Security and Quality Fixes Migration
-- Addresses missing indexes, RLS policy hardening, audit triggers, and constraint updates

-- ============================================================================
-- SECTION 1: Missing Indexes for organization_id
-- ============================================================================

-- inv_board_seat: Add organization_id index for RLS policy performance
CREATE INDEX IF NOT EXISTS idx_inv_board_seat_organization
  ON inv_board_seat(organization_id);

-- inv_equity_plan: Add organization_id index for RLS policy performance
CREATE INDEX IF NOT EXISTS idx_inv_equity_plan_organization
  ON inv_equity_plan(organization_id);

-- inv_equity_plan_snapshot: Add organization_id index for RLS policy performance
CREATE INDEX IF NOT EXISTS idx_inv_equity_plan_snapshot_organization
  ON inv_equity_plan_snapshot(organization_id);

-- ACL tables: Add indexes for organization_id and user_id
CREATE INDEX IF NOT EXISTS idx_inv_fund_acl_user_org
  ON inv_fund_acl_user(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_fund_acl_user_user
  ON inv_fund_acl_user(user_id);
CREATE INDEX IF NOT EXISTS idx_inv_fund_acl_group_org
  ON inv_fund_acl_group(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_company_acl_user_org
  ON inv_company_acl_user(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_company_acl_user_user
  ON inv_company_acl_user(user_id);
CREATE INDEX IF NOT EXISTS idx_inv_company_acl_group_org
  ON inv_company_acl_group(organization_id);

-- ============================================================================
-- SECTION 2: Separate RLS Policies for inv_equity_plan
-- Replace single FOR ALL policy with role-based granular policies
-- ============================================================================

-- Drop existing policy
DROP POLICY IF EXISTS "org_access" ON inv_equity_plan;

-- SELECT: All org members can read
CREATE POLICY "inv_equity_plan_select" ON inv_equity_plan
  FOR SELECT TO authenticated
  USING (organization_id = public.user_organization_id());

-- INSERT: Roles 11 (Manager), 12 (Admin)
CREATE POLICY "inv_equity_plan_insert" ON inv_equity_plan
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND user_has_role_in_org(auth.uid(), organization_id, ARRAY[11, 12]::int[])
  );

-- UPDATE: Roles 11 (Manager), 12 (Admin)
CREATE POLICY "inv_equity_plan_update" ON inv_equity_plan
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND user_has_role_in_org(auth.uid(), organization_id, ARRAY[11, 12]::int[])
  )
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND user_has_role_in_org(auth.uid(), organization_id, ARRAY[11, 12]::int[])
  );

-- DELETE: Role 12 (Admin) only
CREATE POLICY "inv_equity_plan_delete" ON inv_equity_plan
  FOR DELETE TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND user_has_role_in_org(auth.uid(), organization_id, ARRAY[12]::int[])
  );

-- Deny anonymous access
CREATE POLICY "inv_equity_plan_anon_deny" ON inv_equity_plan
  FOR ALL TO anon USING (false);

-- ============================================================================
-- SECTION 3: ACL Tables - Audit Triggers and Anon Deny Policies
-- ============================================================================

-- Register audit triggers for ACL tables
CREATE TRIGGER audit_inv_fund_acl_user_trigger
  AFTER INSERT OR DELETE OR UPDATE ON inv_fund_acl_user
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_inv_fund_acl_group_trigger
  AFTER INSERT OR DELETE OR UPDATE ON inv_fund_acl_group
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_inv_company_acl_user_trigger
  AFTER INSERT OR DELETE OR UPDATE ON inv_company_acl_user
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_inv_company_acl_group_trigger
  AFTER INSERT OR DELETE OR UPDATE ON inv_company_acl_group
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Add anon deny policies for ACL tables
CREATE POLICY "inv_fund_acl_user_anon_deny" ON inv_fund_acl_user
  FOR ALL TO anon USING (false);

CREATE POLICY "inv_fund_acl_group_anon_deny" ON inv_fund_acl_group
  FOR ALL TO anon USING (false);

CREATE POLICY "inv_company_acl_user_anon_deny" ON inv_company_acl_user
  FOR ALL TO anon USING (false);

CREATE POLICY "inv_company_acl_group_anon_deny" ON inv_company_acl_group
  FOR ALL TO anon USING (false);

-- ============================================================================
-- SECTION 4: Fix check_portfolio_org_consistency() Trigger
-- Add explicit NULL check for parent_org_id
-- ============================================================================

CREATE OR REPLACE FUNCTION check_portfolio_org_consistency()
RETURNS TRIGGER AS $$
DECLARE
    parent_org_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'inv_security' THEN
        SELECT organization_id INTO parent_org_id FROM inv_company WHERE id = NEW.company_id;
        IF parent_org_id IS NULL THEN
            RAISE EXCEPTION 'Missing parent company for security';
        END IF;
        IF parent_org_id != NEW.organization_id THEN
            RAISE EXCEPTION 'Security organization_id must match company organization_id';
        END IF;
    ELSIF TG_TABLE_NAME = 'inv_transaction' THEN
        SELECT organization_id INTO parent_org_id FROM inv_fund WHERE id = NEW.fund_id;
        IF parent_org_id IS NULL THEN
            RAISE EXCEPTION 'Missing parent fund for transaction';
        END IF;
        IF parent_org_id != NEW.organization_id THEN
            RAISE EXCEPTION 'Transaction organization_id must match fund organization_id';
        END IF;
        -- Also check company organization matches
        SELECT organization_id INTO parent_org_id FROM inv_company WHERE id = NEW.company_id;
        IF parent_org_id IS NULL THEN
            RAISE EXCEPTION 'Missing parent company for transaction';
        END IF;
        IF parent_org_id != NEW.organization_id THEN
            RAISE EXCEPTION 'Transaction organization_id must match company organization_id';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 5: Add 'exit' Transaction Type
-- ============================================================================

ALTER TABLE inv_transaction DROP CONSTRAINT IF EXISTS inv_transaction_type_ck;
ALTER TABLE inv_transaction ADD CONSTRAINT inv_transaction_type_ck CHECK (
  transaction_type IN (
    'purchase', 'sale', 'conversion', 'exercise', 'distribution',
    'transfer_in', 'transfer_out', 'write_off', 'exit'
  )
);
