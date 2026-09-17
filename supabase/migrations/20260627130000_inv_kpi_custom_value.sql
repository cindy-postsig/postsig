-- Investor-authored values for custom KPIs. This is the MAIN custom-KPI workflow:
-- the investor adds a metric inline (inv_kpi_custom) and types its value per period
-- here, from their own analysis of reporting materials — no portco round-trip.
--
-- Distinct from inv_kpi_value, which holds PORTCO-submitted values hanging off an
-- inv_reporting_submission. A custom KPI may ALSO be requested from a portco later
-- (inv_kpi_value.custom_kpi_id, the exclusive arc); those submitted values live
-- there, while these investor-authored ones live here. Display reconciles the two.
--
-- `source` records provenance ("Backed by …"); it's stored now but not yet surfaced
-- in the UI.
CREATE TABLE IF NOT EXISTS inv_kpi_custom_value (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id        BIGINT NOT NULL,
    custom_kpi_id     BIGINT NOT NULL,

    period_year       SMALLINT NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
    period_quarter    SMALLINT CHECK (period_quarter IS NULL OR period_quarter BETWEEN 1 AND 4),

    value_numeric     NUMERIC,
    value_text        TEXT,
    source            TEXT,

    created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One authored value per metric, per company, per period (annual = NULL quarter).
    CONSTRAINT inv_kpi_custom_value_uq
        UNIQUE NULLS NOT DISTINCT (custom_kpi_id, company_id, period_year, period_quarter),
    -- Pin the value's KPI to the same org as the value (composite-FK tenancy guard).
    CONSTRAINT inv_kpi_custom_value_kpi_org_fk
        FOREIGN KEY (custom_kpi_id, organization_id)
        REFERENCES inv_kpi_custom(id, organization_id) ON DELETE CASCADE,
    -- Pin the value's company to the same org (can't author against another org's company).
    CONSTRAINT inv_kpi_custom_value_company_org_fk
        FOREIGN KEY (company_id, organization_id)
        REFERENCES inv_company(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inv_kpi_custom_value_company
    ON inv_kpi_custom_value(company_id, custom_kpi_id);
CREATE INDEX IF NOT EXISTS idx_inv_kpi_custom_value_org
    ON inv_kpi_custom_value(organization_id);

CREATE TRIGGER set_inv_kpi_custom_value_updated_at BEFORE UPDATE ON inv_kpi_custom_value
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

ALTER TABLE inv_kpi_custom_value ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access" ON inv_kpi_custom_value;
CREATE POLICY "org_access" ON inv_kpi_custom_value FOR ALL
    USING (organization_id = public.user_organization_id())
    WITH CHECK (organization_id = public.user_organization_id());

-- A company-scoped custom KPI may only hold values for that same company; org-wide
-- KPIs (inv_kpi_custom.company_id IS NULL) accept any company. The composite FKs pin
-- org but not company, so enforce the company match at the DB layer.
CREATE OR REPLACE FUNCTION inv_kpi_custom_value_scope_check()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    kpi_company BIGINT;
BEGIN
    SELECT company_id INTO kpi_company FROM inv_kpi_custom WHERE id = NEW.custom_kpi_id;
    IF kpi_company IS NOT NULL AND kpi_company IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION
            'custom KPI % is scoped to company %, cannot store a value for company %',
            NEW.custom_kpi_id, kpi_company, NEW.company_id;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inv_kpi_custom_value_scope_trg ON inv_kpi_custom_value;
CREATE CONSTRAINT TRIGGER inv_kpi_custom_value_scope_trg
    AFTER INSERT OR UPDATE ON inv_kpi_custom_value
    FOR EACH ROW EXECUTE FUNCTION inv_kpi_custom_value_scope_check();
