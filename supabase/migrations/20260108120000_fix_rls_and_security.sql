-- Migration: Fix RLS, policies, audit triggers, and revoke anon grants
-- Addresses CodeRabbit review comments on PR #1264

--------------------------------------------------------------------------------
-- 1. organization_modules: Add RLS, policies, audit trigger, index
--------------------------------------------------------------------------------

-- Enable RLS
ALTER TABLE public.organization_modules ENABLE ROW LEVEL SECURITY;

-- Create index on organization_id (if not exists)
CREATE INDEX IF NOT EXISTS idx_organization_modules_organization_id
    ON public.organization_modules(organization_id);

-- RLS Policies
CREATE POLICY "organization_modules_select" ON public.organization_modules
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
    );

CREATE POLICY "organization_modules_insert" ON public.organization_modules
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id IN (11, 12)
        )
    );

CREATE POLICY "organization_modules_update" ON public.organization_modules
    FOR UPDATE TO authenticated
    USING (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id IN (11, 12)
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id IN (11, 12)
        )
    );

CREATE POLICY "organization_modules_delete" ON public.organization_modules
    FOR DELETE TO authenticated
    USING (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = 12
        )
    );

CREATE POLICY "organization_modules_anon_deny" ON public.organization_modules
    FOR ALL TO anon
    USING (false);

-- Audit trigger
CREATE TRIGGER audit_organization_modules_trigger
    AFTER INSERT OR DELETE OR UPDATE
    ON public.organization_modules
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

--------------------------------------------------------------------------------
-- 2. user_module_access: Add RLS, policies, audit trigger, indexes; revoke anon grants
--------------------------------------------------------------------------------

-- Enable RLS
ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_module_access_user_id
    ON public.user_module_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_module_access_organization_id
    ON public.user_module_access(organization_id);

-- RLS Policies
CREATE POLICY "user_module_access_select" ON public.user_module_access
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
    );

CREATE POLICY "user_module_access_insert" ON public.user_module_access
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id IN (11, 12)
        )
    );

CREATE POLICY "user_module_access_update" ON public.user_module_access
    FOR UPDATE TO authenticated
    USING (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id IN (11, 12)
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id IN (11, 12)
        )
    );

CREATE POLICY "user_module_access_delete" ON public.user_module_access
    FOR DELETE TO authenticated
    USING (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = 12
        )
    );

CREATE POLICY "user_module_access_anon_deny" ON public.user_module_access
    FOR ALL TO anon
    USING (false);

-- Audit trigger
CREATE TRIGGER audit_user_module_access_trigger
    AFTER INSERT OR DELETE OR UPDATE
    ON public.user_module_access
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

-- Revoke anon grants
REVOKE ALL ON public.user_module_access FROM anon;

--------------------------------------------------------------------------------
-- 3. module_documents: Add RLS, policies, audit trigger
--------------------------------------------------------------------------------

-- Enable RLS
ALTER TABLE public.module_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "module_documents_anon_deny" ON public.module_documents
    FOR ALL TO anon
    USING (false);

CREATE POLICY "module_documents_select" ON public.module_documents
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
    );

CREATE POLICY "module_documents_insert" ON public.module_documents
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
    );

CREATE POLICY "module_documents_update" ON public.module_documents
    FOR UPDATE TO authenticated
    USING (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
        AND (
            user_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM user_roles2 ur
                WHERE ur.user_id = auth.uid() AND ur.role_id IN (11, 12)
            )
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
    );

CREATE POLICY "module_documents_delete" ON public.module_documents
    FOR DELETE TO authenticated
    USING (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id IN (11, 12)
        )
    );

-- Audit trigger
CREATE TRIGGER audit_module_documents_trigger
    AFTER INSERT OR DELETE OR UPDATE
    ON public.module_documents
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

-- Revoke anon grants
REVOKE ALL ON public.module_documents FROM anon;

--------------------------------------------------------------------------------
-- 4. document_field_values: Add RLS with policies joining through module_documents
--------------------------------------------------------------------------------

ALTER TABLE public.document_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_field_values_anon_deny" ON public.document_field_values
    FOR ALL TO anon
    USING (false);

CREATE POLICY "document_field_values_select" ON public.document_field_values
    FOR SELECT TO authenticated
    USING (
        module_document_id IN (
            SELECT md.id FROM module_documents md
            WHERE md.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
    );

CREATE POLICY "document_field_values_insert" ON public.document_field_values
    FOR INSERT TO authenticated
    WITH CHECK (
        module_document_id IN (
            SELECT md.id FROM module_documents md
            WHERE md.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
    );

CREATE POLICY "document_field_values_update" ON public.document_field_values
    FOR UPDATE TO authenticated
    USING (
        module_document_id IN (
            SELECT md.id FROM module_documents md
            WHERE md.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
    )
    WITH CHECK (
        module_document_id IN (
            SELECT md.id FROM module_documents md
            WHERE md.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
    );

CREATE POLICY "document_field_values_delete" ON public.document_field_values
    FOR DELETE TO authenticated
    USING (
        module_document_id IN (
            SELECT md.id FROM module_documents md
            WHERE md.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id IN (11, 12)
        )
    );

-- Revoke anon grants
REVOKE ALL ON public.document_field_values FROM anon;

--------------------------------------------------------------------------------
-- 5. document_types: Add RLS (module-scoped, not org-scoped since no org_id column)
--------------------------------------------------------------------------------

ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_types_anon_deny" ON public.document_types
    FOR ALL TO anon
    USING (false);

-- document_types are shared across orgs (linked to app_modules), allow read for authenticated
CREATE POLICY "document_types_select" ON public.document_types
    FOR SELECT TO authenticated
    USING (true);

-- Only admins can manage document types (service_role handles this typically)
CREATE POLICY "document_types_insert" ON public.document_types
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = 12
        )
    );

CREATE POLICY "document_types_update" ON public.document_types
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = 12
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = 12
        )
    );

CREATE POLICY "document_types_delete" ON public.document_types
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = 12
        )
    );

-- Revoke anon grants
REVOKE ALL ON public.document_types FROM anon;

--------------------------------------------------------------------------------
-- 6. module_document_extractions: Add RLS joining through module_documents
--------------------------------------------------------------------------------

ALTER TABLE public.module_document_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_document_extractions_anon_deny" ON public.module_document_extractions
    FOR ALL TO anon
    USING (false);

CREATE POLICY "module_document_extractions_select" ON public.module_document_extractions
    FOR SELECT TO authenticated
    USING (
        module_document_id IN (
            SELECT md.id FROM module_documents md
            WHERE md.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
    );

CREATE POLICY "module_document_extractions_insert" ON public.module_document_extractions
    FOR INSERT TO authenticated
    WITH CHECK (
        module_document_id IN (
            SELECT md.id FROM module_documents md
            WHERE md.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
    );

CREATE POLICY "module_document_extractions_update" ON public.module_document_extractions
    FOR UPDATE TO authenticated
    USING (
        module_document_id IN (
            SELECT md.id FROM module_documents md
            WHERE md.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
    )
    WITH CHECK (
        module_document_id IN (
            SELECT md.id FROM module_documents md
            WHERE md.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
    );

CREATE POLICY "module_document_extractions_delete" ON public.module_document_extractions
    FOR DELETE TO authenticated
    USING (
        module_document_id IN (
            SELECT md.id FROM module_documents md
            WHERE md.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id IN (11, 12)
        )
    );

-- Revoke anon grants
REVOKE ALL ON public.module_document_extractions FROM anon;

--------------------------------------------------------------------------------
-- 7. module_document_files: Add RLS joining through module_documents
--------------------------------------------------------------------------------

ALTER TABLE public.module_document_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_document_files_anon_deny" ON public.module_document_files
    FOR ALL TO anon
    USING (false);

CREATE POLICY "module_document_files_select" ON public.module_document_files
    FOR SELECT TO authenticated
    USING (
        module_document_id IN (
            SELECT md.id FROM module_documents md
            WHERE md.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
    );

CREATE POLICY "module_document_files_insert" ON public.module_document_files
    FOR INSERT TO authenticated
    WITH CHECK (
        module_document_id IN (
            SELECT md.id FROM module_documents md
            WHERE md.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
    );

CREATE POLICY "module_document_files_update" ON public.module_document_files
    FOR UPDATE TO authenticated
    USING (
        module_document_id IN (
            SELECT md.id FROM module_documents md
            WHERE md.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
    )
    WITH CHECK (
        module_document_id IN (
            SELECT md.id FROM module_documents md
            WHERE md.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
    );

CREATE POLICY "module_document_files_delete" ON public.module_document_files
    FOR DELETE TO authenticated
    USING (
        module_document_id IN (
            SELECT md.id FROM module_documents md
            WHERE md.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id IN (11, 12)
        )
    );

-- Revoke anon grants
REVOKE ALL ON public.module_document_files FROM anon;

--------------------------------------------------------------------------------
-- 8. investor_funds: Revoke conflicting anon grants (anon_deny policy exists)
--------------------------------------------------------------------------------

REVOKE ALL ON public.investor_funds FROM anon;

--------------------------------------------------------------------------------
-- 9. companies: Add DELETE policy (admin-only) and revoke anon SELECT grant
--------------------------------------------------------------------------------

CREATE POLICY "companies_delete" ON public.companies
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = 12
        )
    );

-- Revoke anon grants (conflicts with companies_anon_deny policy)
REVOKE ALL ON public.companies FROM anon;

--------------------------------------------------------------------------------
-- 10. portfolio_company_funds: Add UPDATE policy and revoke anon grants
--------------------------------------------------------------------------------

CREATE POLICY "portfolio_company_funds_update" ON public.portfolio_company_funds
    FOR UPDATE TO authenticated
    USING (
        portfolio_company_id IN (
            SELECT me.id FROM module_entities me
            WHERE me.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id IN (11, 12)
        )
    )
    WITH CHECK (
        portfolio_company_id IN (
            SELECT me.id FROM module_entities me
            WHERE me.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id IN (11, 12)
        )
    );

-- Revoke anon grants (conflicts with portfolio_company_funds_anon_deny policy)
REVOKE ALL ON public.portfolio_company_funds FROM anon;