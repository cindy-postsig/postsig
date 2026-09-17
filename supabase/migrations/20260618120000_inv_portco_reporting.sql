-- PORTCO QUARTERLY REPORTING: KPI catalog, reporting submissions, KPI values, documents.
-- A "submission" is what a portfolio company turns in for one quarter and one
-- deliverable type: a 'kpi' submission owns that quarter's KPI values, a
-- 'reporting_pack' submission owns that quarter's uploaded documents. Submissions
-- mirror inv_reporting_request: a request asks for a type, a submission provides
-- it, and a self-serve submission is simply one with no request behind it. The
-- submission carries its own lifecycle (draft / submitted / reopened) so it works
-- with or without a request. Documents are stored for review only and deliberately
-- carry none of the module_documents processing machinery (extraction status,
-- module/doc-type/status FKs, locking).

-- KPI field definitions. Global reference data (no org scope); the catalog is
-- seeded by 20260618140000_seed_inv_kpi_catalog.sql so schema + required reference
-- data land together. New fields ship as follow-up seed migrations.
CREATE TABLE IF NOT EXISTS inv_kpi_catalog (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code          TEXT NOT NULL UNIQUE,
    label         TEXT NOT NULL,
    category      TEXT NOT NULL,
    value_type    TEXT NOT NULL CHECK (value_type IN ('currency', 'percent', 'number', 'text', 'textarea')),
    placeholder   TEXT,
    sort_order    INTEGER NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_kpi_catalog_active ON inv_kpi_catalog(sort_order) WHERE is_active;

-- Reporting document types. Global reference data, mirrors inv_snapshot_types.
CREATE TABLE IF NOT EXISTS inv_reporting_doc_type (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code          TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    sort_order    INTEGER NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO inv_reporting_doc_type (code, display_name, sort_order) VALUES
    ('board_deck',       'Board Deck',          1),
    ('pnl',              'P&L Statement',       2),
    ('balance_sheet',    'Balance Sheet',       3),
    ('cash_flow',        'Cash Flow Statement', 4),
    ('cap_table',        'Cap Table',           5),
    ('customer_pipeline','Customer Pipeline',   6),
    ('other',            'Other',               99)
ON CONFLICT (code) DO NOTHING;

-- inv_company.id is the PK; this unique lets a submission pin (company_id,
-- organization_id) so it can't reference a company from another org.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'inv_company_id_org_uq' AND conrelid = 'inv_company'::regclass
    ) THEN
        ALTER TABLE inv_company ADD CONSTRAINT inv_company_id_org_uq UNIQUE (id, organization_id);
    END IF;
END $$;

-- The per-(company, quarter, type) submission: one quarter's KPI values OR
-- documents, consolidated across however many requests of that type fed it.
-- The lifecycle lives here, not on the request, so self-serve submissions (no
-- request) and requested ones share one source of truth. 'reopened' marks a
-- previously submitted quarter that's editable again (re-open is supported even
-- where the UI doesn't yet expose it).
CREATE TABLE IF NOT EXISTS inv_reporting_submission (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id        BIGINT NOT NULL,

    -- Mirrors inv_reporting_request.request_type: the deliverable this submission
    -- provides. 'kpi' submissions own inv_kpi_value rows; 'reporting_pack'
    -- submissions own inv_reporting_document rows.
    type              TEXT NOT NULL CHECK (type IN ('kpi', 'reporting_pack')),

    period_year       SMALLINT NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
    period_quarter    SMALLINT NOT NULL CHECK (period_quarter BETWEEN 1 AND 4),

    status            TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'submitted', 'reopened')),
    submitted_at      TIMESTAMPTZ,
    submitted_by      UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT inv_reporting_submission_company_period_type_uq
        UNIQUE (company_id, period_year, period_quarter, type),
    -- Targets for the composite FKs on child tables, which pin submission ownership
    -- so a child row can't drift to another org/company (writes come from the
    -- portco app via the service role, which bypasses the org_access RLS below).
    CONSTRAINT inv_reporting_submission_id_org_uq UNIQUE (id, organization_id),
    CONSTRAINT inv_reporting_submission_id_org_company_uq UNIQUE (id, organization_id, company_id),
    -- Pin the submission's company to the same org (replaces a single-column company FK).
    CONSTRAINT inv_reporting_submission_company_org_fk
        FOREIGN KEY (company_id, organization_id)
        REFERENCES inv_company(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inv_reporting_submission_org ON inv_reporting_submission(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_reporting_submission_company ON inv_reporting_submission(company_id, period_year DESC, period_quarter DESC);
CREATE INDEX IF NOT EXISTS idx_inv_reporting_submission_status ON inv_reporting_submission(organization_id, status);

-- KPI values for a 'kpi' submission. EAV against inv_kpi_catalog so the field set
-- can grow without schema changes and stays queryable across the portfolio.
-- value_numeric holds currency/percent/number; value_text holds text/textarea.
CREATE TABLE IF NOT EXISTS inv_kpi_value (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    submission_id     BIGINT NOT NULL,
    kpi_code          TEXT NOT NULL REFERENCES inv_kpi_catalog(code) ON DELETE RESTRICT,

    value_numeric     NUMERIC,
    value_text        TEXT,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT inv_kpi_value_submission_code_uq UNIQUE (submission_id, kpi_code),
    -- Composite FK pins (submission_id, organization_id) to the submission's own
    -- (id, organization_id).
    CONSTRAINT inv_kpi_value_submission_org_fk
        FOREIGN KEY (submission_id, organization_id)
        REFERENCES inv_reporting_submission(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inv_kpi_value_submission ON inv_kpi_value(submission_id);
CREATE INDEX IF NOT EXISTS idx_inv_kpi_value_code ON inv_kpi_value(kpi_code);
CREATE INDEX IF NOT EXISTS idx_inv_kpi_value_org ON inv_kpi_value(organization_id);

-- Uploaded documents for a 'reporting_pack' submission. Stored for review only;
-- the binary lives in the shared 'documents' Storage bucket at
-- file_path = '{organization_id}/reporting/...'.
CREATE TABLE IF NOT EXISTS inv_reporting_document (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    submission_id     BIGINT NOT NULL,
    company_id        BIGINT NOT NULL REFERENCES inv_company(id) ON DELETE CASCADE,
    doc_type_id       BIGINT REFERENCES inv_reporting_doc_type(id) ON DELETE SET NULL,
    -- Set when the document answers an ad-hoc requested type not in the catalog.
    custom_doc_type   TEXT,

    -- Column names mirror module_document_files.
    file_name         TEXT NOT NULL,
    file_path         TEXT NOT NULL,
    file_type         TEXT,
    file_size         BIGINT,
    file_hash         TEXT,
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    uploaded_by       UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Single composite FK pins the document's org AND company to the submission's,
    -- so a service-role write can't attach a document to another org/company's
    -- submission. One FK (not two) keeps the submission->document embed
    -- unambiguous for PostgREST.
    CONSTRAINT inv_reporting_document_submission_fk
        FOREIGN KEY (submission_id, organization_id, company_id)
        REFERENCES inv_reporting_submission(id, organization_id, company_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inv_reporting_document_submission ON inv_reporting_document(submission_id);
CREATE INDEX IF NOT EXISTS idx_inv_reporting_document_company ON inv_reporting_document(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_reporting_document_org ON inv_reporting_document(organization_id);

-- updated_at maintenance (matches existing inv_ / contract tables)
CREATE TRIGGER set_inv_kpi_catalog_updated_at BEFORE UPDATE ON inv_kpi_catalog
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_inv_reporting_submission_updated_at BEFORE UPDATE ON inv_reporting_submission
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_inv_kpi_value_updated_at BEFORE UPDATE ON inv_kpi_value
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_inv_reporting_document_updated_at BEFORE UPDATE ON inv_reporting_document
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- RLS: org-scoped data tables get the org_access policy.
ALTER TABLE inv_reporting_submission ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_kpi_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_reporting_document ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'inv_reporting_submission', 'inv_kpi_value', 'inv_reporting_document'
        ])
    LOOP
        EXECUTE format('
            DROP POLICY IF EXISTS "org_access" ON %I;
            CREATE POLICY "org_access" ON %I FOR ALL
                USING (organization_id = public.user_organization_id())
                WITH CHECK (organization_id = public.user_organization_id());
        ', tbl, tbl);
    END LOOP;
END $$;

-- Catalog and doc-type are non-sensitive global reference data, but RLS must still
-- be enabled (Supabase flags RLS-disabled public tables) — read-only to any
-- authenticated user; seeds run as the migration owner and bypass RLS.
ALTER TABLE inv_kpi_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_reporting_doc_type ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_all" ON inv_kpi_catalog;
CREATE POLICY "read_all" ON inv_kpi_catalog FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "read_all" ON inv_reporting_doc_type;
CREATE POLICY "read_all" ON inv_reporting_doc_type FOR SELECT TO authenticated USING (true);
