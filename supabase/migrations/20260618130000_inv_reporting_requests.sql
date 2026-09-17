-- PORTCO REPORTING REQUESTS: the VC-initiated ask that a submission answers.
-- A request is either a KPI request (selects catalog fields to populate a form)
-- or a reporting-pack request (names the documents wanted, including ad-hoc types
-- not in inv_reporting_doc_type). It pairs with the same-type inv_reporting_submission
-- for its (company, quarter). public_id is the link token (/r/{public_id}).
-- Recipient is anchored on email; recipient_user_id + invite_id fill in once the
-- invite is accepted.

CREATE TABLE IF NOT EXISTS inv_reporting_request (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id        BIGINT NOT NULL REFERENCES inv_company(id) ON DELETE CASCADE,

    request_type      TEXT NOT NULL CHECK (request_type IN ('kpi', 'reporting_pack')),
    period_year       SMALLINT NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
    period_quarter    SMALLINT NOT NULL CHECK (period_quarter BETWEEN 1 AND 4),

    message           TEXT,
    recipient_email   TEXT NOT NULL,
    recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    invite_id         BIGINT REFERENCES app_invites(id) ON DELETE SET NULL,
    submission_id     BIGINT,

    status            TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'sent', 'viewed', 'submitted', 'cancelled')),
    due_date          DATE,
    sent_by           UUID REFERENCES users(id) ON DELETE SET NULL,
    sent_at           TIMESTAMPTZ,
    submitted_at      TIMESTAMPTZ,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One outstanding request per company+quarter+type; re-requesting upserts
    -- (and reopens) the same row instead of minting a duplicate.
    CONSTRAINT inv_reporting_request_company_period_type_uq
        UNIQUE (company_id, period_year, period_quarter, request_type),
    -- Pin the linked submission to the request's org so a write can't link a
    -- request to another tenant's submission. SET NULL targets submission_id only
    -- (organization_id is NOT NULL) when the submission is deleted.
    CONSTRAINT inv_reporting_request_submission_org_fk
        FOREIGN KEY (submission_id, organization_id)
        REFERENCES inv_reporting_submission(id, organization_id)
        ON DELETE SET NULL (submission_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_reporting_request_org ON inv_reporting_request(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_reporting_request_company ON inv_reporting_request(company_id, period_year DESC, period_quarter DESC);
CREATE INDEX IF NOT EXISTS idx_inv_reporting_request_recipient ON inv_reporting_request(recipient_email);
CREATE INDEX IF NOT EXISTS idx_inv_reporting_request_status ON inv_reporting_request(organization_id, status);

-- KPI fields chosen for a KPI request; these populate the recipient's form.
CREATE TABLE IF NOT EXISTS inv_reporting_request_kpi (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    request_id        BIGINT NOT NULL REFERENCES inv_reporting_request(id) ON DELETE CASCADE,
    kpi_code          TEXT NOT NULL REFERENCES inv_kpi_catalog(code) ON DELETE RESTRICT,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT inv_reporting_request_kpi_uq UNIQUE (request_id, kpi_code)
);

CREATE INDEX IF NOT EXISTS idx_inv_reporting_request_kpi_request ON inv_reporting_request_kpi(request_id);

-- Documents asked for in a reporting-pack request. doc_type_id references the
-- known catalog; custom_label carries an ad-hoc type the VC wants that isn't in
-- inv_reporting_doc_type. Exactly one of the two must be set.
CREATE TABLE IF NOT EXISTS inv_reporting_request_document (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    request_id        BIGINT NOT NULL REFERENCES inv_reporting_request(id) ON DELETE CASCADE,
    -- RESTRICT (not SET NULL): doc types are seeded reference data, and SET NULL
    -- would violate the doc_type/custom_label CHECK below when custom_label is null.
    doc_type_id       BIGINT REFERENCES inv_reporting_doc_type(id) ON DELETE RESTRICT,
    custom_label      TEXT,
    note              TEXT,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT inv_reporting_request_document_type_chk
        CHECK (doc_type_id IS NOT NULL OR custom_label IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_inv_reporting_request_document_request ON inv_reporting_request_document(request_id);

CREATE TRIGGER set_inv_reporting_request_updated_at BEFORE UPDATE ON inv_reporting_request
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

ALTER TABLE inv_reporting_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_reporting_request_kpi ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_reporting_request_document ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'inv_reporting_request',
            'inv_reporting_request_kpi',
            'inv_reporting_request_document'
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
