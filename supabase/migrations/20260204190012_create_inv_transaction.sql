-- PORTFOLIO_TRANSACTION: Single source of truth for money/share movement

CREATE TABLE IF NOT EXISTS inv_transaction (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Core references
    fund_id               BIGINT NOT NULL REFERENCES inv_fund(id) ON DELETE RESTRICT,
    company_id            BIGINT NOT NULL REFERENCES inv_company(id) ON DELETE RESTRICT,
    security_id           BIGINT NOT NULL REFERENCES inv_security(id) ON DELETE RESTRICT,
    financing_round_id    BIGINT REFERENCES inv_financing_round(id) ON DELETE SET NULL,

    -- Identifiers
    external_id           TEXT,
    public_id             UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

    -- Transaction details
    transaction_type      TEXT NOT NULL,
    transaction_date      DATE NOT NULL,
    settlement_date       DATE,

    -- Atomic facts (signed values)
    units                 NUMERIC(20,6) NOT NULL,
    amount                NUMERIC(20,2) NOT NULL,
    currency              CHAR(3) NOT NULL DEFAULT 'USD',

    -- Metadata
    signatory             TEXT,
    counterparty_name     TEXT,
    notes                 TEXT,
    metadata              JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inv_transaction_org_external_uq UNIQUE (organization_id, external_id),
    CONSTRAINT inv_transaction_type_ck CHECK (transaction_type IN ('purchase', 'sale', 'conversion', 'exercise', 'distribution', 'transfer_in', 'transfer_out', 'write_off'))
);

CREATE INDEX IF NOT EXISTS idx_inv_transaction_org ON inv_transaction(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_transaction_fund ON inv_transaction(fund_id);
CREATE INDEX IF NOT EXISTS idx_inv_transaction_company ON inv_transaction(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_transaction_security ON inv_transaction(security_id);
CREATE INDEX IF NOT EXISTS idx_inv_transaction_round ON inv_transaction(financing_round_id) WHERE financing_round_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_transaction_date ON inv_transaction(transaction_date);
CREATE INDEX IF NOT EXISTS idx_inv_transaction_external ON inv_transaction(external_id) WHERE external_id IS NOT NULL;
