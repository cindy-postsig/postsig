-- KPI extraction runs (PSK-1906). An analyst triggers extraction on an Excel
-- document already stored in module_documents; an external droid service does the
-- LLM matching against inv_kpi definitions and writes its candidates back here.
--
-- This table is the result-delivery channel, not just a log: Inngest run state is
-- not reliable enough to poll, so the droid persists the outcome on this row and
-- the review UI polls it. `result` is the droid's candidates payload, stored
-- opaquely — its shape is owned by the droid contract, not by this schema.
--
-- status transitions ('queued' -> 'running' -> 'succeeded' | 'failed') are enforced
-- app/droid-side; the CHECK only constrains the vocabulary.

-- Composite-FK target so child tables can pin a document to its organization.
-- id alone is already the primary key; the pair needs its own unique index
-- before it can be referenced.
ALTER TABLE module_documents
    ADD CONSTRAINT module_documents_id_org_uq UNIQUE (id, organization_id);

CREATE TABLE inv_kpi_extraction_run (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id           UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

    module_document_id  BIGINT NOT NULL,

    -- The company is resolved by the analyst at trigger time rather than read from
    -- the document: module_documents.company_id is nullable, and the extraction
    -- always targets one portfolio company.
    company_id          BIGINT NOT NULL,
    organization_id     UUID NOT NULL,

    period_year         INTEGER NOT NULL,
    period_quarter      INTEGER NOT NULL,

    status              TEXT NOT NULL DEFAULT 'queued',
    -- Candidates payload written by the droid on success.
    result              JSONB,
    error               TEXT,

    requested_by        UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT inv_kpi_extraction_run_period_year_chk
        CHECK (period_year BETWEEN 2000 AND 2100),
    CONSTRAINT inv_kpi_extraction_run_period_quarter_chk
        CHECK (period_quarter BETWEEN 1 AND 4),
    CONSTRAINT inv_kpi_extraction_run_status_chk
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),

    -- Pin the run's company to the caller's org (droid writes run as the service
    -- role and bypass RLS).
    CONSTRAINT inv_kpi_extraction_run_company_org_fk
        FOREIGN KEY (company_id, organization_id)
        REFERENCES inv_company(id, organization_id) ON DELETE CASCADE,

    -- Pin the run's document to the same org, for the same reason. Replaces a
    -- plain FK on module_document_id: both columns are NOT NULL, so the pair
    -- covers referential integrity, and the CASCADE is preserved.
    CONSTRAINT inv_kpi_extraction_run_document_org_fk
        FOREIGN KEY (module_document_id, organization_id)
        REFERENCES module_documents(id, organization_id) ON DELETE CASCADE
);

-- Droid picks up work by status; the app polls by cell, then by document.
-- Partial: terminal rows accumulate forever and are never scanned by status, so
-- indexing only the in-flight vocabulary keeps the index small and write-cheap.
CREATE INDEX idx_inv_kpi_extraction_run_status ON inv_kpi_extraction_run (status)
    WHERE status IN ('queued', 'running');
CREATE INDEX idx_inv_kpi_extraction_run_cell
    ON inv_kpi_extraction_run (organization_id, company_id, period_year, period_quarter);
CREATE INDEX idx_inv_kpi_extraction_run_document
    ON inv_kpi_extraction_run (module_document_id);

CREATE TRIGGER set_inv_kpi_extraction_run_updated_at BEFORE UPDATE ON inv_kpi_extraction_run
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- RLS: org-scoped data table gets the org_access policy. Writes come from the
-- service role (app trigger + droid callback), which bypasses RLS.
ALTER TABLE inv_kpi_extraction_run ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access" ON inv_kpi_extraction_run;
CREATE POLICY "org_access" ON inv_kpi_extraction_run FOR ALL
    USING (organization_id = public.user_organization_id())
    WITH CHECK (organization_id = public.user_organization_id());
