-- Fix RLS and anonymous access for investor tables created in 20260123095851
-- 1. Enable RLS on org-scoped tables (investor_equity_plan, investor_equity_plan_version)
-- 2. Add organization-scoped policies for authenticated users
-- 3. Revoke write permissions from anon on all five tables
-- 4. Reference tables (instrument_types, seat_types, transaction_types) are read-only lookups

-- ============================================================================
-- REVOKE WRITE PERMISSIONS FROM ANON ON ALL FIVE TABLES
-- ============================================================================

-- investor_equity_plan: revoke all DML from anon
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.investor_equity_plan FROM anon;

-- investor_equity_plan_version: revoke all DML from anon
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.investor_equity_plan_version FROM anon;

-- investor_instrument_types: revoke all DML from anon (reference table, read-only)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.investor_instrument_types FROM anon;

-- investor_seat_types: revoke all DML from anon (reference table, read-only)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.investor_seat_types FROM anon;

-- investor_transaction_types: revoke all DML from anon (reference table, read-only)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.investor_transaction_types FROM anon;

-- Also revoke SELECT from anon on org-scoped tables (they should not be publicly readable)
REVOKE SELECT ON public.investor_equity_plan FROM anon;
REVOKE SELECT ON public.investor_equity_plan_version FROM anon;

-- ============================================================================
-- ENABLE RLS ON ORG-SCOPED TABLES
-- ============================================================================

ALTER TABLE public.investor_equity_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_equity_plan_version ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLICIES FOR investor_equity_plan
-- Access scoped to user's organization via entity_id -> module_entities -> organization_id
-- ============================================================================

-- Deny all access to anon
CREATE POLICY "investor_equity_plan_anon_deny"
ON public.investor_equity_plan
AS PERMISSIVE
FOR ALL
TO anon
USING (false);

-- SELECT: authenticated users can read plans for entities in their organization
CREATE POLICY "investor_equity_plan_select"
ON public.investor_equity_plan
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
CREATE POLICY "investor_equity_plan_insert"
ON public.investor_equity_plan
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
CREATE POLICY "investor_equity_plan_update"
ON public.investor_equity_plan
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
CREATE POLICY "investor_equity_plan_delete"
ON public.investor_equity_plan
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
-- POLICIES FOR investor_equity_plan_version
-- Access scoped via plan_id -> investor_equity_plan -> entity_id -> module_entities
-- ============================================================================

-- Deny all access to anon
CREATE POLICY "investor_equity_plan_version_anon_deny"
ON public.investor_equity_plan_version
AS PERMISSIVE
FOR ALL
TO anon
USING (false);

-- SELECT: authenticated users can read versions for plans in their organization
CREATE POLICY "investor_equity_plan_version_select"
ON public.investor_equity_plan_version
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
    plan_id IN (
        SELECT iep.id
        FROM investor_equity_plan iep
        JOIN module_entities me ON me.id = iep.entity_id
        WHERE me.organization_id IN (
            SELECT u.organization_id
            FROM users u
            WHERE u.id = auth.uid()
        )
    )
);

-- INSERT: roles 11 (Manager) and 12 (Admin) can insert, scoped to plan's organization
CREATE POLICY "investor_equity_plan_version_insert"
ON public.investor_equity_plan_version
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
    plan_id IN (
        SELECT iep.id
        FROM investor_equity_plan iep
        JOIN module_entities me ON me.id = iep.entity_id
        WHERE me.organization_id IN (
            SELECT u.organization_id
            FROM users u
            WHERE u.id = auth.uid()
        )
        AND user_has_role_in_org(auth.uid(), me.organization_id, ARRAY[11, 12]::int[])
    )
);

-- UPDATE: roles 11 (Manager) and 12 (Admin) can update, scoped to plan's organization
CREATE POLICY "investor_equity_plan_version_update"
ON public.investor_equity_plan_version
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
    plan_id IN (
        SELECT iep.id
        FROM investor_equity_plan iep
        JOIN module_entities me ON me.id = iep.entity_id
        WHERE me.organization_id IN (
            SELECT u.organization_id
            FROM users u
            WHERE u.id = auth.uid()
        )
        AND user_has_role_in_org(auth.uid(), me.organization_id, ARRAY[11, 12]::int[])
    )
)
WITH CHECK (
    plan_id IN (
        SELECT iep.id
        FROM investor_equity_plan iep
        JOIN module_entities me ON me.id = iep.entity_id
        WHERE me.organization_id IN (
            SELECT u.organization_id
            FROM users u
            WHERE u.id = auth.uid()
        )
        AND user_has_role_in_org(auth.uid(), me.organization_id, ARRAY[11, 12]::int[])
    )
);

-- DELETE: only role 12 (Admin) can delete, scoped to plan's organization
CREATE POLICY "investor_equity_plan_version_delete"
ON public.investor_equity_plan_version
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
    plan_id IN (
        SELECT iep.id
        FROM investor_equity_plan iep
        JOIN module_entities me ON me.id = iep.entity_id
        WHERE me.organization_id IN (
            SELECT u.organization_id
            FROM users u
            WHERE u.id = auth.uid()
        )
        AND user_has_role_in_org(auth.uid(), me.organization_id, ARRAY[12]::int[])
    )
);

-- ============================================================================
-- REFERENCE TABLES: Enable RLS and allow read-only access for authenticated
-- These are global lookup tables, not org-scoped, but should not be writable by users
-- ============================================================================

-- investor_instrument_types
ALTER TABLE public.investor_instrument_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "investor_instrument_types_anon_deny"
ON public.investor_instrument_types
AS PERMISSIVE
FOR ALL
TO anon
USING (false);

CREATE POLICY "investor_instrument_types_select"
ON public.investor_instrument_types
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

-- Revoke write from authenticated (only service_role/postgres can write)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.investor_instrument_types FROM authenticated;

-- investor_seat_types
ALTER TABLE public.investor_seat_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "investor_seat_types_anon_deny"
ON public.investor_seat_types
AS PERMISSIVE
FOR ALL
TO anon
USING (false);

CREATE POLICY "investor_seat_types_select"
ON public.investor_seat_types
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

-- Revoke write from authenticated (only service_role/postgres can write)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.investor_seat_types FROM authenticated;

-- investor_transaction_types
ALTER TABLE public.investor_transaction_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "investor_transaction_types_anon_deny"
ON public.investor_transaction_types
AS PERMISSIVE
FOR ALL
TO anon
USING (false);

CREATE POLICY "investor_transaction_types_select"
ON public.investor_transaction_types
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

-- Revoke write from authenticated (only service_role/postgres can write)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.investor_transaction_types FROM authenticated;
