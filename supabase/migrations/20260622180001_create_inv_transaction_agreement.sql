-- PORTFOLIO_TRANSACTION_AGREEMENT: Expected agreements enumerated by a transaction
-- document (e.g. the "Transaction Agreements" defined term in an SPA's definitions).
-- One row per expected agreement; presence vs. missing is computed at read time.

CREATE TABLE IF NOT EXISTS inv_transaction_agreement (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id            BIGINT NOT NULL REFERENCES inv_company(id) ON DELETE CASCADE,
    financing_round_id    BIGINT REFERENCES inv_financing_round(id) ON DELETE SET NULL,
    module_document_id    BIGINT NOT NULL REFERENCES module_documents(id) ON DELETE CASCADE,

    -- Identifiers
    external_id           TEXT,

    -- Agreement details
    defined_name          TEXT NOT NULL,
    document_type         TEXT,
    agreement_date        DATE,

    -- Metadata
    metadata              JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inv_transaction_agreement_org_external_uq UNIQUE (organization_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_transaction_agreement_organization ON inv_transaction_agreement(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_transaction_agreement_company ON inv_transaction_agreement(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_transaction_agreement_document ON inv_transaction_agreement(module_document_id);
CREATE INDEX IF NOT EXISTS idx_inv_transaction_agreement_round ON inv_transaction_agreement(financing_round_id) WHERE financing_round_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_transaction_agreement_external ON inv_transaction_agreement(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_transaction_agreement_doc_type ON inv_transaction_agreement(document_type) WHERE document_type IS NOT NULL;

CREATE TRIGGER set_inv_transaction_agreement_updated_at BEFORE UPDATE ON inv_transaction_agreement
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Row Level Security (org-scoped, matching the inv_* family — see 20260204190018_enable_rls.sql).
ALTER TABLE inv_transaction_agreement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access" ON inv_transaction_agreement;
CREATE POLICY "org_access" ON inv_transaction_agreement FOR ALL
    USING (organization_id = public.user_organization_id())
    WITH CHECK (organization_id = public.user_organization_id());
