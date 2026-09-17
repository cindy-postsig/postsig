-- PORTFOLIO_FINANCING_ROUND: Funding events

CREATE TABLE IF NOT EXISTS inv_financing_round (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id            BIGINT NOT NULL REFERENCES inv_company(id) ON DELETE CASCADE,

    -- Identifiers
    external_id           TEXT,
    public_id             UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

    -- Round details
    name                  TEXT NOT NULL,
    stage_id              BIGINT REFERENCES inv_stages(id) ON DELETE SET NULL,

    -- Dates
    announced_date        DATE,
    initial_close_date    DATE,
    final_close_date      DATE,

    -- Economics
    pre_money_valuation   NUMERIC(20,2),
    currency              CHAR(3) NOT NULL DEFAULT 'USD',

    -- Notes
    notes                 TEXT,
    metadata              JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inv_financing_round_org_external_uq UNIQUE (organization_id, external_id),
    CONSTRAINT inv_financing_round_dates_ck CHECK (
        initial_close_date IS NULL OR final_close_date IS NULL OR final_close_date >= initial_close_date
    )
);

CREATE INDEX IF NOT EXISTS idx_inv_financing_round_org ON inv_financing_round(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_financing_round_company ON inv_financing_round(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_financing_round_external ON inv_financing_round(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_financing_round_date ON inv_financing_round(final_close_date);
