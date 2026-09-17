-- Support annual reporting requests: period_quarter becomes nullable (NULL = full year).
-- NULLS NOT DISTINCT ensures two annual requests for the same company+year+type conflict,
-- matching the same dedup guarantee we have for quarterly requests.

ALTER TABLE inv_reporting_request
    ALTER COLUMN period_quarter DROP NOT NULL;

ALTER TABLE inv_reporting_request
    DROP CONSTRAINT IF EXISTS inv_reporting_request_company_period_type_uq;

ALTER TABLE inv_reporting_request
    ADD CONSTRAINT inv_reporting_request_company_period_type_uq
        UNIQUE NULLS NOT DISTINCT (company_id, period_year, period_quarter, request_type);

-- period_quarter check: must be 1–4 when set, or NULL for annual.
-- The original table-definition check only covered 1–4; drop and recreate it.
ALTER TABLE inv_reporting_request
    DROP CONSTRAINT IF EXISTS inv_reporting_request_period_quarter_check;

ALTER TABLE inv_reporting_request
    ADD CONSTRAINT inv_reporting_request_period_quarter_check
        CHECK (period_quarter IS NULL OR period_quarter BETWEEN 1 AND 4);

DROP INDEX IF EXISTS idx_inv_reporting_request_company;
CREATE INDEX idx_inv_reporting_request_company
    ON inv_reporting_request(company_id, period_year DESC, period_quarter DESC NULLS FIRST);

-- Same nullability change for inv_reporting_submission so annual submissions can be saved.

ALTER TABLE inv_reporting_submission
    ALTER COLUMN period_quarter DROP NOT NULL;

ALTER TABLE inv_reporting_submission
    DROP CONSTRAINT IF EXISTS inv_reporting_submission_period_quarter_check;

ALTER TABLE inv_reporting_submission
    ADD CONSTRAINT inv_reporting_submission_period_quarter_check
        CHECK (period_quarter IS NULL OR period_quarter BETWEEN 1 AND 4);

ALTER TABLE inv_reporting_submission
    DROP CONSTRAINT IF EXISTS inv_reporting_submission_company_period_type_uq;

ALTER TABLE inv_reporting_submission
    ADD CONSTRAINT inv_reporting_submission_company_period_type_uq
        UNIQUE NULLS NOT DISTINCT (company_id, period_year, period_quarter, type);

DROP INDEX IF EXISTS idx_inv_reporting_submission_company;
CREATE INDEX idx_inv_reporting_submission_company
    ON inv_reporting_submission(company_id, period_year DESC, period_quarter DESC NULLS FIRST);

-- RECIPIENTS of a reporting request: the single source of truth for who a request
-- is for, so several people at a portco can be invited to and fill one request.
-- The request's old single-recipient columns (recipient_email/recipient_user_id)
-- are dropped at the end of this migration once their values are seeded here.
-- Access is also granted via inv_company_acl_user during provisioning; this table
-- records "who was asked for THIS request" (per-request), which the per-company ACL
-- cannot express. There is no "primary" recipient — recipients are a flat set
-- ordered by invited_at; the request's owner is its sender (sent_by).

-- Composite org key on the parent so recipient rows can pin (request_id,
-- organization_id) together and never drift across orgs — matching how
-- inv_kpi_value / inv_reporting_document FK against inv_reporting_submission.
ALTER TABLE inv_reporting_request
    DROP CONSTRAINT IF EXISTS inv_reporting_request_id_org_uq;

ALTER TABLE inv_reporting_request
    ADD CONSTRAINT inv_reporting_request_id_org_uq UNIQUE (id, organization_id);

CREATE TABLE IF NOT EXISTS inv_reporting_request_recipient (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    request_id        BIGINT NOT NULL,
    email             TEXT NOT NULL,
    user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    invited_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invited_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT inv_reporting_request_recipient_uq UNIQUE (request_id, email),
    CONSTRAINT inv_reporting_request_recipient_request_org_fk
        FOREIGN KEY (request_id, organization_id)
        REFERENCES inv_reporting_request(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inv_reporting_request_recipient_request ON inv_reporting_request_recipient(request_id);
CREATE INDEX IF NOT EXISTS idx_inv_reporting_request_recipient_user ON inv_reporting_request_recipient(user_id);
CREATE INDEX IF NOT EXISTS idx_inv_reporting_request_recipient_email ON inv_reporting_request_recipient(email);

-- Seed from the existing single recipient on each request so no one loses access
-- when reads switch to this table. Normalize to lowercase to match auth comparisons.
INSERT INTO inv_reporting_request_recipient (organization_id, request_id, email, user_id, invited_at)
SELECT organization_id, id, LOWER(recipient_email), recipient_user_id, COALESCE(sent_at, created_at)
FROM inv_reporting_request
WHERE recipient_email IS NOT NULL AND TRIM(recipient_email) <> ''
ON CONFLICT (request_id, email) DO NOTHING;

ALTER TABLE inv_reporting_request_recipient ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access" ON inv_reporting_request_recipient;
CREATE POLICY "org_access" ON inv_reporting_request_recipient FOR ALL
    USING (organization_id = public.user_organization_id())
    WITH CHECK (organization_id = public.user_organization_id());

-- The denormalized primary recipient on the request is now redundant with this
-- table. Drop it (values seeded above) so there is one source of truth.
ALTER TABLE inv_reporting_request DROP COLUMN IF EXISTS recipient_email;
ALTER TABLE inv_reporting_request DROP COLUMN IF EXISTS recipient_user_id;

-- Align the request side with the submission side: inv_reporting_document already
-- names its ad-hoc doc type custom_doc_type, so rename the request column to match.
-- Postgres rewrites the dependent CHECK constraint expression automatically.
ALTER TABLE inv_reporting_request_document
    RENAME COLUMN custom_label TO custom_doc_type;

-- Narrow inv_reporting_request.status to the states actually used. 'draft' and
-- 'viewed' were never set: a request is created 'sent' and flips to 'submitted'
-- when fulfilled. Per-recipient view tracking is gone, so 'viewed' has no source.
-- Normalize any stray rows, then move the default off 'draft' and tighten the CHECK.
UPDATE inv_reporting_request SET status = 'sent' WHERE status IN ('draft', 'viewed');

ALTER TABLE inv_reporting_request ALTER COLUMN status SET DEFAULT 'sent';

ALTER TABLE inv_reporting_request
    DROP CONSTRAINT IF EXISTS inv_reporting_request_status_check;

ALTER TABLE inv_reporting_request
    ADD CONSTRAINT inv_reporting_request_status_check
        CHECK (status IN ('sent', 'submitted', 'cancelled'));
