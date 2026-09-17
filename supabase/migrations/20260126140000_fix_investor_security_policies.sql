-- Fix investor_security RLS policies to use org-scoped role checks
-- The previous policies checked user_id and role_id without scoping to the entity's organization,
-- allowing users with admin/manager roles in ANY organization to modify records.
-- This migration updates policies to use user_has_role_in_org() for proper org-scoped authorization.

-- Drop existing policies
DROP POLICY IF EXISTS "investor_security_delete" ON "public"."investor_security";
DROP POLICY IF EXISTS "investor_security_insert" ON "public"."investor_security";
DROP POLICY IF EXISTS "investor_security_update" ON "public"."investor_security";

-- Recreate DELETE policy with org-scoped role check
-- Only role 12 (Admin) can delete, scoped to the entity's organization
CREATE POLICY "investor_security_delete"
ON "public"."investor_security"
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

-- Recreate INSERT policy with org-scoped role check
-- Roles 11 (Manager) and 12 (Admin) can insert, scoped to the entity's organization
CREATE POLICY "investor_security_insert"
ON "public"."investor_security"
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

-- Recreate UPDATE policy with org-scoped role check
-- Roles 11 (Manager) and 12 (Admin) can update, scoped to the entity's organization
CREATE POLICY "investor_security_update"
ON "public"."investor_security"
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
