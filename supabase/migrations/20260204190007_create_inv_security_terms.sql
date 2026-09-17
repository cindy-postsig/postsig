-- PORTFOLIO_SECURITY_TERMS: Versioned security terms (SCD Type 2)

CREATE TABLE IF NOT EXISTS inv_security_terms (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    security_id           BIGINT NOT NULL REFERENCES inv_security(id) ON DELETE CASCADE,

    -- Identifiers
    external_id           TEXT,

    -- Temporal validity
    effective_date        DATE NOT NULL,
    superseded_date       DATE,

    -- Pricing
    original_issue_price  NUMERIC(20,8),
    conversion_price      NUMERIC(20,8),
    conversion_ratio      NUMERIC(20,10) DEFAULT 1.0,
    par_value             NUMERIC(20,10),

    -- Share counts
    authorized_shares     BIGINT,
    issued_shares         BIGINT,
    outstanding_shares    BIGINT,

    -- Liquidation preferences
    liquidation_multiplier    NUMERIC(5,2) DEFAULT 1.0,
    liquidation_seniority     SMALLINT,
    participation_type        TEXT DEFAULT 'none',
    participation_cap         NUMERIC(5,2),

    -- Dividends
    dividend_rate             NUMERIC(8,6),
    dividend_cumulative       BOOLEAN DEFAULT FALSE,
    dividend_accruing         BOOLEAN DEFAULT FALSE,
    dividend_seniority        SMALLINT,

    -- Anti-dilution
    anti_dilution_type        TEXT DEFAULT 'none',

    -- Convertibles/SAFEs
    valuation_cap             NUMERIC(20,2),
    discount_rate             NUMERIC(5,4),
    interest_rate             NUMERIC(5,4),
    interest_type             TEXT,
    maturity_date             DATE,
    qualified_financing_threshold NUMERIC(20,2),

    -- Raw terms
    raw_terms             JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inv_security_terms_org_external_uq UNIQUE (organization_id, external_id),
    CONSTRAINT inv_security_terms_dates_ck CHECK (superseded_date IS NULL OR superseded_date > effective_date),
    CONSTRAINT inv_security_terms_participation_type_ck CHECK (participation_type IN ('none', 'full', 'capped')),
    CONSTRAINT inv_security_terms_anti_dilution_type_ck CHECK (anti_dilution_type IN ('none', 'broad_based', 'narrow_based', 'full_ratchet'))
);

CREATE INDEX IF NOT EXISTS idx_inv_security_terms_security ON inv_security_terms(security_id);
CREATE INDEX IF NOT EXISTS idx_inv_security_terms_current ON inv_security_terms(security_id) WHERE superseded_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_inv_security_terms_effective ON inv_security_terms(security_id, effective_date DESC);
