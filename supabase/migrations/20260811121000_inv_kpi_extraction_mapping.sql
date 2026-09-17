-- Per-company label -> KPI memory (PSK-1906). Every confirmed save in the KPI
-- extraction review UI records which sheet label the analyst accepted for a given
-- KPI, along with the unit multiplier they applied (e.g. a sheet in thousands).
--
-- Write-only in v1: the app appends/updates rows here, nothing reads them yet. A
-- later droid phase replays this memory so a company's recurring workbook layout
-- matches without analyst input. The unique key is what makes it a memory rather
-- than a log — one row per (org, company, KPI, sheet, label), refreshed on each
-- confirmation.
CREATE TABLE inv_kpi_extraction_mapping (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    company_id         BIGINT NOT NULL,
    organization_id    UUID NOT NULL,

    -- RESTRICT matches the other KPI-referencing tables (inv_kpi_value,
    -- inv_reporting_request_kpi): deleting a KPI definition that still has
    -- learned mappings should surface the dependency, not silently drop memory.
    kpi_id             BIGINT NOT NULL REFERENCES inv_kpi(id) ON DELETE RESTRICT,

    sheet_name         TEXT NOT NULL,
    label_text         TEXT NOT NULL,

    -- Factor applied to the raw cell value to reach the KPI's canonical unit.
    -- Strictly positive: a zero or negative factor cannot describe a unit.
    unit_multiplier    NUMERIC NOT NULL DEFAULT 1
        CONSTRAINT inv_kpi_extraction_mapping_unit_multiplier_chk
        CHECK (unit_multiplier > 0),

    -- These two travel together — see the trigger below for the upsert contract
    -- that keeps them in sync.
    last_confirmed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_confirmed_by  UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT inv_kpi_extraction_mapping_uq
        UNIQUE (organization_id, company_id, kpi_id, sheet_name, label_text),

    -- Pin the mapping's company to the caller's org (writes run as the service
    -- role and bypass RLS).
    CONSTRAINT inv_kpi_extraction_mapping_company_org_fk
        FOREIGN KEY (company_id, organization_id)
        REFERENCES inv_company(id, organization_id) ON DELETE CASCADE
);

-- The DEFAULT on last_confirmed_at only fires on INSERT, but the unique key makes
-- every re-confirmation an ON CONFLICT DO UPDATE. Stamp it in a trigger so the
-- "refreshed on each confirmation" contract cannot be forgotten by a caller.
-- Named for the table it serves, matching inv_kpi_value_kpi_org_check /
-- inv_kpi_custom_value_scope_check. A generic name in the shared public schema
-- would invite a later migration to CREATE OR REPLACE over it.
--
-- Only the timestamp is stamped here. The trigger cannot supply last_confirmed_by:
-- it has no access to the confirming analyst (writes run as the service role, so
-- auth.uid() is null), and it cannot tell "caller omitted the column" from "the
-- same analyst re-confirmed" — both leave OLD's value in NEW. Nulling it on that
-- ambiguity would erase correct attribution in the common repeat-analyst case.
--
-- So the contract is on the write path, not the trigger: every upsert MUST carry
--     ON CONFLICT (...) DO UPDATE SET last_confirmed_by = EXCLUDED.last_confirmed_by
-- alongside the other updated columns. Omitting it desynchronizes the pair —
-- last_confirmed_at advances to analyst B while last_confirmed_by still names A.
-- No write path exists yet (v1 is write-only from a single app call site); the
-- test for that call site is where this is pinned when it lands.
CREATE OR REPLACE FUNCTION inv_kpi_extraction_mapping_set_last_confirmed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    NEW.last_confirmed_at = NOW();
    RETURN NEW;
END;
$$;

-- No DROP TRIGGER IF EXISTS guard: in this module that guard marks a trigger
-- attached to a pre-existing table (see inv_kpi_value / inv_reporting_request_kpi
-- in 20260720120000_inv_kpi_unify.sql), where an earlier migration may already
-- have created it. This trigger is on the table created above in this same file,
-- which is an unguarded CREATE TABLE — so the guard could never fire.
CREATE TRIGGER set_inv_kpi_extraction_mapping_last_confirmed_at
    BEFORE UPDATE ON inv_kpi_extraction_mapping
    FOR EACH ROW EXECUTE FUNCTION inv_kpi_extraction_mapping_set_last_confirmed_at();

-- A mapping's KPI must be global (organization_id NULL) or belong to the
-- mapping's org. The composite FK pins the company but not the KPI (its org can
-- be NULL, which a composite FK can't express), so enforce it here — same shape
-- as inv_kpi_value_kpi_org_check in 20260720120000_inv_kpi_unify.sql.
CREATE OR REPLACE FUNCTION inv_kpi_extraction_mapping_kpi_org_check()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    kpi_org UUID;
BEGIN
    SELECT organization_id INTO kpi_org FROM inv_kpi WHERE id = NEW.kpi_id;
    IF kpi_org IS NOT NULL AND kpi_org IS DISTINCT FROM NEW.organization_id THEN
        RAISE EXCEPTION 'KPI % belongs to another org, cannot store a mapping under org %',
            NEW.kpi_id, NEW.organization_id;
    END IF;
    RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER inv_kpi_extraction_mapping_kpi_org_trg
    AFTER INSERT OR UPDATE ON inv_kpi_extraction_mapping
    FOR EACH ROW EXECUTE FUNCTION inv_kpi_extraction_mapping_kpi_org_check();

-- Postgres does not index the referencing side of an FK. The unique key's index
-- leads with (organization_id, company_id, ...) so it cannot serve a kpi_id
-- lookup, which leaves the ON DELETE RESTRICT check on every inv_kpi delete to a
-- sequential scan. Matches idx_inv_kpi_value_kpi ON inv_kpi_value (kpi_id) in
-- 20260720120000_inv_kpi_unify.sql, the same kpi_id RESTRICT shape.
CREATE INDEX idx_inv_kpi_extraction_mapping_kpi ON inv_kpi_extraction_mapping (kpi_id);

-- RLS: org-scoped data table gets the org_access policy. Writes come from the
-- service role, which bypasses RLS.
ALTER TABLE inv_kpi_extraction_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access" ON inv_kpi_extraction_mapping;
CREATE POLICY "org_access" ON inv_kpi_extraction_mapping FOR ALL
    USING (organization_id = public.user_organization_id())
    WITH CHECK (organization_id = public.user_organization_id());
