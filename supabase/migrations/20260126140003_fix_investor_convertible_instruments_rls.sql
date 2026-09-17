-- Re-enable RLS and restore organization-scoped policies for investor_convertible_instruments
-- Migration 20260123095851 disabled RLS and dropped policies; this restores proper security.
-- Policies use user_has_role_in_org() for org-scoped role checks.

-- ============================================================================
-- RE-ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.investor_convertible_instruments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DROP ANY EXISTING POLICIES (in case of partial state)
-- ============================================================================

DROP POLICY IF EXISTS "investor_convertible_instruments_anon_deny" ON public.investor_convertible_instruments;
DROP POLICY IF EXISTS "investor_convertible_instruments_select" ON public.investor_convertible_instruments;
DROP POLICY IF EXISTS "investor_convertible_instruments_insert" ON public.investor_convertible_instruments;
DROP POLICY IF EXISTS "investor_convertible_instruments_update" ON public.investor_convertible_instruments;
DROP POLICY IF EXISTS "investor_convertible_instruments_delete" ON public.investor_convertible_instruments;

-- ============================================================================
-- REVOKE WRITE PERMISSIONS FROM ANON
-- ============================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, SELECT ON public.investor_convertible_instruments FROM anon;

-- ============================================================================
-- CREATE ORGANIZATION-SCOPED POLICIES
-- Access is scoped via entity_id -> module_entities -> organization_id
-- ============================================================================

-- Deny all access to anon
CREATE POLICY "investor_convertible_instruments_anon_deny"
ON public.investor_convertible_instruments
AS PERMISSIVE
FOR ALL
TO anon
USING (false);

-- SELECT: authenticated users can read instruments for entities in their organization
CREATE POLICY "investor_convertible_instruments_select"
ON public.investor_convertible_instruments
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
    entity_id IN (
        SELECT me.id
        FROM module_entities me
        WHERE me.organization_id IN (
            SELECT u.organization_id
            FROM users u
            WHERE u.id = auth.uid()
        )
    )
);

-- INSERT: roles 11 (Manager) and 12 (Admin) can insert, scoped to entity's organization
CREATE POLICY "investor_convertible_instruments_insert"
ON public.investor_convertible_instruments
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
    entity_id IN (
        SELECT me.id
        FROM module_entities me
        WHERE me.organization_id IN (
            SELECT u.organization_id
            FROM users u
            WHERE u.id = auth.uid()
        )
        AND user_has_role_in_org(auth.uid(), me.organization_id, ARRAY[11, 12]::int[])
    )
);

-- UPDATE: roles 11 (Manager) and 12 (Admin) can update, scoped to entity's organization
CREATE POLICY "investor_convertible_instruments_update"
ON public.investor_convertible_instruments
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
    entity_id IN (
        SELECT me.id
        FROM module_entities me
        WHERE me.organization_id IN (
            SELECT u.organization_id
            FROM users u
            WHERE u.id = auth.uid()
        )
        AND user_has_role_in_org(auth.uid(), me.organization_id, ARRAY[11, 12]::int[])
    )
)
WITH CHECK (
    entity_id IN (
        SELECT me.id
        FROM module_entities me
        WHERE me.organization_id IN (
            SELECT u.organization_id
            FROM users u
            WHERE u.id = auth.uid()
        )
        AND user_has_role_in_org(auth.uid(), me.organization_id, ARRAY[11, 12]::int[])
    )
);

-- DELETE: only role 12 (Admin) can delete, scoped to entity's organization
CREATE POLICY "investor_convertible_instruments_delete"
ON public.investor_convertible_instruments
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
    entity_id IN (
        SELECT me.id
        FROM module_entities me
        WHERE me.organization_id IN (
            SELECT u.organization_id
            FROM users u
            WHERE u.id = auth.uid()
        )
        AND user_has_role_in_org(auth.uid(), me.organization_id, ARRAY[12]::int[])
    )
);

-- ============================================================================
-- RESTORE TRIGGERS (if they were dropped)
-- ============================================================================

-- Ensure audit trigger exists
DROP TRIGGER IF EXISTS audit_investor_convertible_instruments_trigger ON public.investor_convertible_instruments;
CREATE TRIGGER audit_investor_convertible_instruments_trigger
    AFTER INSERT OR DELETE OR UPDATE
    ON public.investor_convertible_instruments
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

-- Ensure updated_at trigger exists
DROP TRIGGER IF EXISTS investor_convertible_instruments_updated_at_trigger ON public.investor_convertible_instruments;
DROP TRIGGER IF EXISTS trg_ici_set_updated_at ON public.investor_convertible_instruments;
CREATE TRIGGER investor_convertible_instruments_updated_at_trigger
    BEFORE UPDATE
    ON public.investor_convertible_instruments
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
