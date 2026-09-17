-- PORTFOLIO_EQUITY_PLAN: Option pools

CREATE TABLE IF NOT EXISTS inv_equity_plan (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id            BIGINT NOT NULL REFERENCES inv_company(id) ON DELETE CASCADE,

    -- Identifiers
    external_id           TEXT,
    public_id             UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

    -- Plan details
    name                  TEXT NOT NULL,
    plan_type             TEXT DEFAULT 'iso',
    adoption_date         DATE,
    expiration_date       DATE,

    -- Metadata
    metadata              JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inv_equity_plan_company_name_uq UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_inv_equity_plan_company ON inv_equity_plan(company_id);
