-- Org-defined custom KPI metrics. Mirrors the "Add custom KPI" feature: an
-- investor org defines its own metrics that then behave like inv_kpi_catalog
-- fields — requestable via a reporting request and displayable in the KPI table.
--
-- inv_kpi_catalog is global seed data (no org scope); inv_kpi_custom is tenant
-- data, so it gets the module's composite-FK tenancy guard and a real org_access
-- RLS policy (portco submissions write via service role and bypass RLS, so the
-- guard, not RLS, is what pins org/company).
--
-- company_id NULL = applies org-wide (every portco); set = one company only.
CREATE TABLE IF NOT EXISTS inv_kpi_custom (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id        BIGINT,

    label             TEXT NOT NULL,
    category          TEXT NOT NULL,
    value_type        TEXT NOT NULL CHECK (value_type IN ('currency', 'percent', 'number', 'text', 'textarea')),
    unit              TEXT,
    description       TEXT,
    is_flow           BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Lets child tables pin (custom_kpi_id, organization_id) as a composite FK.
    CONSTRAINT inv_kpi_custom_id_org_uq UNIQUE (id, organization_id),
    -- When company-scoped, pin (company_id, organization_id) to a company in the
    -- same org. company_id NULL skips this check (MATCH SIMPLE) — org-wide rows.
    CONSTRAINT inv_kpi_custom_company_org_fk
        FOREIGN KEY (company_id, organization_id)
        REFERENCES inv_company(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inv_kpi_custom_scope
    ON inv_kpi_custom(organization_id, company_id) WHERE is_active;

-- No duplicate metric name within one scope (org-wide, or a given company), but
-- only among ACTIVE rows — soft-deleting a KPI (is_active = FALSE) frees its name
-- so an identically-named one can be recreated.
CREATE UNIQUE INDEX IF NOT EXISTS inv_kpi_custom_active_label_uq
    ON inv_kpi_custom (organization_id, company_id, label)
    NULLS NOT DISTINCT
    WHERE is_active;

CREATE TRIGGER set_inv_kpi_custom_updated_at BEFORE UPDATE ON inv_kpi_custom
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

ALTER TABLE inv_kpi_custom ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access" ON inv_kpi_custom;
CREATE POLICY "org_access" ON inv_kpi_custom FOR ALL
    USING (organization_id = public.user_organization_id())
    WITH CHECK (organization_id = public.user_organization_id());

-- company_id is immutable: the per-write scope checks below only validate child
-- rows, so re-scoping a KPI after values/links exist would silently invalidate
-- them. Re-scoping isn't a product flow (deactivate + recreate instead), so just
-- forbid the change rather than revalidate every child.
CREATE OR REPLACE FUNCTION inv_kpi_custom_company_immutable()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
        RAISE EXCEPTION
            'inv_kpi_custom.company_id is immutable (KPI %); deactivate and recreate to re-scope',
            OLD.id;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inv_kpi_custom_company_immutable_trg ON inv_kpi_custom;
CREATE TRIGGER inv_kpi_custom_company_immutable_trg
    BEFORE UPDATE OF company_id ON inv_kpi_custom
    FOR EACH ROW EXECUTE FUNCTION inv_kpi_custom_company_immutable();

-- A KPI value / request line now points at EITHER a catalog code OR a custom KPI.
-- kpi_code becomes nullable and a CHECK enforces exactly one target is set.

ALTER TABLE inv_kpi_value ALTER COLUMN kpi_code DROP NOT NULL;
ALTER TABLE inv_kpi_value ADD COLUMN IF NOT EXISTS custom_kpi_id BIGINT;
ALTER TABLE inv_kpi_value
    ADD CONSTRAINT inv_kpi_value_custom_org_fk
        FOREIGN KEY (custom_kpi_id, organization_id)
        REFERENCES inv_kpi_custom(id, organization_id) ON DELETE RESTRICT;
ALTER TABLE inv_kpi_value
    ADD CONSTRAINT inv_kpi_value_kpi_target_chk
        CHECK (num_nonnulls(kpi_code, custom_kpi_id) = 1);
-- The existing UNIQUE(submission_id, kpi_code) only constrains catalog rows now
-- (custom rows have kpi_code NULL). Mirror it for custom rows.
CREATE UNIQUE INDEX IF NOT EXISTS inv_kpi_value_submission_custom_uq
    ON inv_kpi_value (submission_id, custom_kpi_id) WHERE custom_kpi_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_kpi_value_custom ON inv_kpi_value(custom_kpi_id);

ALTER TABLE inv_reporting_request_kpi ALTER COLUMN kpi_code DROP NOT NULL;
ALTER TABLE inv_reporting_request_kpi ADD COLUMN IF NOT EXISTS custom_kpi_id BIGINT;
ALTER TABLE inv_reporting_request_kpi
    ADD CONSTRAINT inv_reporting_request_kpi_custom_org_fk
        FOREIGN KEY (custom_kpi_id, organization_id)
        REFERENCES inv_kpi_custom(id, organization_id) ON DELETE RESTRICT;
ALTER TABLE inv_reporting_request_kpi
    ADD CONSTRAINT inv_reporting_request_kpi_target_chk
        CHECK (num_nonnulls(kpi_code, custom_kpi_id) = 1);
CREATE UNIQUE INDEX IF NOT EXISTS inv_reporting_request_kpi_custom_uq
    ON inv_reporting_request_kpi (request_id, custom_kpi_id) WHERE custom_kpi_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_reporting_request_kpi_custom ON inv_reporting_request_kpi(custom_kpi_id);

-- A company-scoped custom KPI (inv_kpi_custom.company_id IS NOT NULL) may only be
-- linked from rows belonging to that same company; org-wide KPIs (company_id NULL)
-- accept any. The composite FKs pin org but not company, and portco writes via the
-- service role bypass RLS, so enforce the company match at the DB layer.
CREATE OR REPLACE FUNCTION inv_kpi_value_custom_scope_check()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    kpi_company BIGINT;
    sub_company BIGINT;
BEGIN
    IF NEW.custom_kpi_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT company_id INTO kpi_company FROM inv_kpi_custom WHERE id = NEW.custom_kpi_id;
    IF kpi_company IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT company_id INTO sub_company
        FROM inv_reporting_submission WHERE id = NEW.submission_id;
    IF sub_company IS DISTINCT FROM kpi_company THEN
        RAISE EXCEPTION
            'custom KPI % is scoped to company %, cannot attach a value under a submission for company %',
            NEW.custom_kpi_id, kpi_company, sub_company;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inv_kpi_value_custom_scope_trg ON inv_kpi_value;
CREATE CONSTRAINT TRIGGER inv_kpi_value_custom_scope_trg
    AFTER INSERT OR UPDATE ON inv_kpi_value
    FOR EACH ROW EXECUTE FUNCTION inv_kpi_value_custom_scope_check();

CREATE OR REPLACE FUNCTION inv_reporting_request_kpi_custom_scope_check()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    kpi_company BIGINT;
    req_company BIGINT;
BEGIN
    IF NEW.custom_kpi_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT company_id INTO kpi_company FROM inv_kpi_custom WHERE id = NEW.custom_kpi_id;
    IF kpi_company IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT company_id INTO req_company
        FROM inv_reporting_request WHERE id = NEW.request_id;
    IF req_company IS DISTINCT FROM kpi_company THEN
        RAISE EXCEPTION
            'custom KPI % is scoped to company %, cannot be requested for company %',
            NEW.custom_kpi_id, kpi_company, req_company;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inv_reporting_request_kpi_custom_scope_trg ON inv_reporting_request_kpi;
CREATE CONSTRAINT TRIGGER inv_reporting_request_kpi_custom_scope_trg
    AFTER INSERT OR UPDATE ON inv_reporting_request_kpi
    FOR EACH ROW EXECUTE FUNCTION inv_reporting_request_kpi_custom_scope_check();
