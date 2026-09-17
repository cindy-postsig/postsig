-- PORTFOLIO_FUND: Investment vehicles

CREATE TABLE IF NOT EXISTS inv_fund (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Identifiers
    external_id           TEXT,
    public_id             UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

    -- Fund details
    name                  TEXT NOT NULL,
    short_name            TEXT,
    code                  TEXT,
    status                TEXT NOT NULL DEFAULT 'active',

    -- Characteristics
    vintage_year          SMALLINT CHECK (vintage_year >= 1900 AND vintage_year <= 2100),
    target_size           NUMERIC(20,2),
    committed_capital     NUMERIC(20,2),
    currency              CHAR(3) NOT NULL DEFAULT 'USD',

    -- Metadata
    description           TEXT,
    metadata              JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inv_fund_org_external_uq UNIQUE (organization_id, external_id),
    CONSTRAINT inv_fund_org_code_uq UNIQUE (organization_id, code),
    CONSTRAINT inv_fund_status_ck CHECK (status IN ('active', 'closed', 'raising', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_inv_fund_org ON inv_fund(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_fund_status ON inv_fund(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_fund_external ON inv_fund(external_id) WHERE external_id IS NOT NULL;
