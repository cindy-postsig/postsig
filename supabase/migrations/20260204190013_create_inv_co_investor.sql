-- PORTFOLIO_CO_INVESTOR: Co-investor relationships

CREATE TABLE IF NOT EXISTS inv_co_investor (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    financing_round_id    BIGINT NOT NULL REFERENCES inv_financing_round(id) ON DELETE CASCADE,

    -- Identifiers
    external_id           TEXT,

    -- Investor details
    investor_name         TEXT NOT NULL,
    investor_type         TEXT,

    -- Relationship
    relationship          TEXT NOT NULL DEFAULT 'participant',
    has_board_seat        BOOLEAN DEFAULT FALSE,
    is_major_investor     BOOLEAN DEFAULT FALSE,

    -- Investment
    amount_invested       NUMERIC(20,2),
    currency              CHAR(3) DEFAULT 'USD',

    -- Contact
    contact_name          TEXT,
    contact_email         TEXT,

    -- Metadata
    metadata              JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inv_co_investor_round_name_uq UNIQUE (financing_round_id, investor_name),
    CONSTRAINT inv_co_investor_relationship_ck CHECK (relationship IN ('lead', 'co_lead', 'participant', 'follow_on'))
);

CREATE INDEX IF NOT EXISTS idx_inv_co_investor_org ON inv_co_investor(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_co_investor_round ON inv_co_investor(financing_round_id);
CREATE INDEX IF NOT EXISTS idx_inv_co_investor_name ON inv_co_investor(investor_name);
CREATE INDEX IF NOT EXISTS idx_inv_co_investor_lead ON inv_co_investor(financing_round_id, relationship) WHERE relationship IN ('lead', 'co_lead');
