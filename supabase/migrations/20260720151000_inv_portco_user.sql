-- inv_portco_user: membership table for EXTERNAL portfolio-company users.
-- These people are NOT members of the investor's organization; they hold
-- org-less identities and reach a single portco company through this row. The
-- investor ACL family (inv_company_acl_user and siblings) stays internal-only
-- and is deliberately left untouched — this table is the external-membership
-- analogue that keeps outside users out of the investor org.

CREATE TABLE IF NOT EXISTS inv_portco_user (
    company_id        BIGINT NOT NULL,
    organization_id   UUID NOT NULL,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, user_id),
    -- Pins the membership's org to the company's org, so an external user can
    -- only be linked to a company inside the org that owns it. inv_company
    -- already carries UNIQUE (id, organization_id) as inv_company_id_org_uq
    -- (added by 20260618120000_inv_portco_reporting.sql), so no new unique here.
    CONSTRAINT inv_portco_user_company_org_fk
        FOREIGN KEY (company_id, organization_id)
        REFERENCES inv_company(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inv_portco_user_org
    ON inv_portco_user(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_portco_user_user
    ON inv_portco_user(user_id);

ALTER TABLE inv_portco_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_portco_user FORCE ROW LEVEL SECURITY;

-- Investors read only their own org's memberships. Every write comes from the
-- service role during provisioning, which bypasses RLS, so no write policy is
-- granted to authenticated users.
DROP POLICY IF EXISTS "org_access_select" ON inv_portco_user;
CREATE POLICY "org_access_select" ON inv_portco_user FOR SELECT
    USING (organization_id = public.user_organization_id());

CREATE POLICY "inv_portco_user_anon_deny" ON inv_portco_user
    FOR ALL TO anon USING (false);

-- Audit mirrors inv_company_acl_user. The module audit log serializes composite
-- primary keys per table, so teach module_audit_trigger_function the new table's
-- company_id:user_id target-id shape before attaching the triggers below.
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
        -- Composite PKs: ACL tables plus inv_portco_user (external membership)
        v_record_id := CASE TG_TABLE_NAME
            WHEN 'inv_fund_acl_user' THEN
                (v_record->>'fund_id') || ':' || (v_record->>'user_id')
            WHEN 'inv_fund_acl_group' THEN
                (v_record->>'fund_id') || ':' || (v_record->>'group_id')
            WHEN 'inv_company_acl_user' THEN
                (v_record->>'company_id') || ':' || (v_record->>'user_id')
            WHEN 'inv_company_acl_group' THEN
                (v_record->>'company_id') || ':' || (v_record->>'group_id')
            WHEN 'inv_portco_user' THEN
                (v_record->>'company_id') || ':' || (v_record->>'user_id')
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

CREATE TRIGGER audit_inv_portco_user_trigger
    AFTER INSERT OR DELETE OR UPDATE ON inv_portco_user
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER module_audit_inv_portco_user_trigger
    AFTER INSERT OR UPDATE OR DELETE ON inv_portco_user
    FOR EACH ROW EXECUTE FUNCTION module_audit_trigger_function();
