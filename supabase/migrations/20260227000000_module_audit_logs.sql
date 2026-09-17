-- Module Audit Logs: Domain-specific audit logging for investment module tables
-- Coexists with generic audit_log system; adds company/fund context and changed_fields tracking

-- ============================================================================
-- Task 1.1: Create module_audit_logs table
-- ============================================================================

CREATE TABLE IF NOT EXISTS module_audit_logs (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id               UUID REFERENCES users(id) ON DELETE SET NULL,

    action                TEXT NOT NULL,
    table_name            TEXT NOT NULL,
    record_id             TEXT NOT NULL,

    context_company_id    BIGINT REFERENCES inv_company(id) ON DELETE SET NULL,
    context_fund_id       BIGINT REFERENCES inv_fund(id) ON DELETE SET NULL,

    old_values            JSONB,
    new_values            JSONB,
    changed_fields        TEXT[],

    source                TEXT DEFAULT 'web_ui',
    ip_address            TEXT,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_module_audit_logs_org
    ON module_audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_module_audit_logs_table_record
    ON module_audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_module_audit_logs_company
    ON module_audit_logs(context_company_id)
    WHERE context_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_module_audit_logs_fund
    ON module_audit_logs(context_fund_id)
    WHERE context_fund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_module_audit_logs_created
    ON module_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_module_audit_logs_user
    ON module_audit_logs(user_id)
    WHERE user_id IS NOT NULL;

-- ============================================================================
-- Task 1.2: Create module_audit_trigger_function()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.module_audit_trigger_function()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id           UUID;
    v_org_id            UUID;
    v_action            TEXT;
    v_record_id         TEXT;
    v_context_company   BIGINT;
    v_context_fund      BIGINT;
    v_old_values        JSONB;
    v_new_values        JSONB;
    v_changed_fields    TEXT[];
    v_source            TEXT;
    v_ip_address        TEXT;
    v_record            JSONB;
    v_old_record        JSONB;
    redact_keys         TEXT[] := ARRAY[
        'password', 'password_hash', 'totp_secret', 'recovery_codes',
        'token', 'api_key', 'secret', 'ssn', 'email',
        'access_token', 'refresh_token', 'private_key', 'jwt'
    ];
BEGIN
    -- Self-guard: never audit the audit table itself
    IF TG_TABLE_NAME = 'module_audit_logs' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- Extract user context
    v_user_id := auth.uid();
    v_source := COALESCE(NULLIF(current_setting('app.audit_source', true), ''), 'web_ui');
    v_ip_address := current_setting('app.ip_address', true);

    -- Build JSONB records and determine action
    IF TG_OP = 'INSERT' THEN
        v_action := 'CREATE';
        v_record := to_jsonb(NEW);
        v_old_values := NULL;
        v_new_values := public.redact_sensitive_jsonb(v_record, redact_keys);
        v_changed_fields := NULL;

    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'UPDATE';
        v_record := to_jsonb(NEW);
        v_old_record := to_jsonb(OLD);
        v_old_values := public.redact_sensitive_jsonb(v_old_record, redact_keys);
        v_new_values := public.redact_sensitive_jsonb(v_record, redact_keys);

        -- Compute changed_fields: keys where old value IS DISTINCT FROM new value
        SELECT array_agg(key ORDER BY key)
        INTO v_changed_fields
        FROM (
            SELECT key
            FROM jsonb_each(v_record) AS n(key, value)
            LEFT JOIN jsonb_each(v_old_record) AS o(key, value) USING (key)
            WHERE n.value IS DISTINCT FROM o.value
            UNION
            SELECT key
            FROM jsonb_each(v_old_record) AS o(key, value)
            WHERE NOT v_record ? key
        ) changed;

    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'DELETE';
        v_old_record := to_jsonb(OLD);
        v_record := v_old_record; -- use OLD for context extraction
        v_old_values := public.redact_sensitive_jsonb(v_old_record, redact_keys);
        v_new_values := NULL;
        v_changed_fields := NULL;
    END IF;

    -- Extract organization_id (same pattern as existing audit_trigger_function)
    v_org_id := CASE
        WHEN v_record ? 'organization_id' THEN (v_record->>'organization_id')::UUID
        WHEN v_record ? 'org_id' THEN (v_record->>'org_id')::UUID
        ELSE NULL
    END;

    -- Extract record_id: use 'id' if present, else composite key for ACL tables
    IF v_record ? 'id' THEN
        v_record_id := v_record->>'id';
    ELSE
        -- ACL tables: composite PKs
        v_record_id := CASE TG_TABLE_NAME
            WHEN 'inv_fund_acl_user' THEN
                (v_record->>'fund_id') || ':' || (v_record->>'user_id')
            WHEN 'inv_fund_acl_group' THEN
                (v_record->>'fund_id') || ':' || (v_record->>'group_id')
            WHEN 'inv_company_acl_user' THEN
                (v_record->>'company_id') || ':' || (v_record->>'user_id')
            WHEN 'inv_company_acl_group' THEN
                (v_record->>'company_id') || ':' || (v_record->>'group_id')
            ELSE 'unknown'
        END;
    END IF;

    -- Extract context_company_id
    v_context_company := CASE
        WHEN TG_TABLE_NAME = 'inv_company' THEN (v_record->>'id')::BIGINT
        WHEN v_record ? 'company_id' THEN (v_record->>'company_id')::BIGINT
        ELSE NULL
    END;

    -- Extract context_fund_id
    v_context_fund := CASE
        WHEN TG_TABLE_NAME = 'inv_fund' THEN (v_record->>'id')::BIGINT
        WHEN v_record ? 'fund_id' THEN (v_record->>'fund_id')::BIGINT
        WHEN v_record ? 'designating_fund_id' THEN (v_record->>'designating_fund_id')::BIGINT
        ELSE NULL
    END;

    -- Insert audit record, never breaking the triggering transaction
    BEGIN
        INSERT INTO module_audit_logs (
            organization_id,
            user_id,
            action,
            table_name,
            record_id,
            context_company_id,
            context_fund_id,
            old_values,
            new_values,
            changed_fields,
            source,
            ip_address
        ) VALUES (
            v_org_id,
            v_user_id,
            v_action,
            TG_TABLE_NAME,
            v_record_id,
            v_context_company,
            v_context_fund,
            v_old_values,
            v_new_values,
            v_changed_fields,
            v_source,
            v_ip_address
        );
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_notify(
            'module_audit_log_failures',
            json_build_object(
                'schema', TG_TABLE_SCHEMA,
                'table', TG_TABLE_NAME,
                'op', TG_OP,
                'error', SQLERRM
            )::text
        );
        RAISE WARNING 'module_audit_trigger_function failed for %.% %: %',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, SQLERRM;
    END;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$function$;

-- ============================================================================
-- Task 1.3: Attach triggers to 19 target tables
-- ============================================================================

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
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
            'module_documents'
        ])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS module_audit_%I_trigger ON %I;
            CREATE TRIGGER module_audit_%I_trigger
                AFTER INSERT OR UPDATE OR DELETE ON %I
                FOR EACH ROW EXECUTE FUNCTION module_audit_trigger_function();
        ', tbl, tbl, tbl, tbl);
    END LOOP;
END $$;

-- ============================================================================
-- Task 1.4: RLS policies for module_audit_logs
-- ============================================================================

ALTER TABLE module_audit_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read rows within their organization
CREATE POLICY module_audit_logs_select
    ON module_audit_logs
    FOR SELECT
    TO authenticated
    USING (
        organization_id IN (
            SELECT u.organization_id
            FROM users u
            WHERE u.id = auth.uid()
        )
    );

-- Admin users (role 12) can also read rows where organization_id IS NULL
-- (inv_companies audit entries have no org scope)
CREATE POLICY module_audit_logs_admin_select_null_org
    ON module_audit_logs
    FOR SELECT
    TO authenticated
    USING (
        organization_id IS NULL
        AND EXISTS (
            SELECT 1
            FROM user_roles2 ur
            WHERE ur.user_id = auth.uid()
            AND ur.role_id = 12
        )
    );

-- No INSERT/UPDATE/DELETE policies for authenticated users
-- Writes come exclusively from SECURITY DEFINER trigger function

-- Deny all access to anonymous users
CREATE POLICY module_audit_logs_anon_deny
    ON module_audit_logs
    FOR ALL
    TO anon
    USING (false);
