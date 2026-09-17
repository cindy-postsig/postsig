-- PORTFOLIO_CAP_TABLE_SNAPSHOT: Historical cap table data

CREATE TABLE IF NOT EXISTS inv_cap_table_snapshot (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id            BIGINT NOT NULL REFERENCES inv_company(id) ON DELETE CASCADE,
    financing_round_id    BIGINT REFERENCES inv_financing_round(id) ON DELETE SET NULL,

    -- Identifiers
    external_id           TEXT,

    -- Snapshot context
    snapshot_date         DATE NOT NULL,
    snapshot_type_id      BIGINT REFERENCES inv_snapshot_types(id) ON DELETE SET NULL,

    -- Share counts
    common_authorized             BIGINT,
    common_outstanding            BIGINT,
    preferred_authorized          BIGINT,
    preferred_outstanding         BIGINT,
    total_outstanding             BIGINT,
    fully_diluted_total           BIGINT NOT NULL,

    -- Option pool
    option_pool_authorized        BIGINT,
    option_pool_outstanding       BIGINT,
    option_pool_available         BIGINT,
    option_pool_fd_percent        NUMERIC(7,6),

    -- Our position
    our_common_shares             BIGINT,
    our_preferred_shares          BIGINT,
    our_total_shares              BIGINT,
    our_ownership_percent         NUMERIC(7,6),
    our_fd_ownership_percent      NUMERIC(7,6),
    our_preferred_pct             NUMERIC(7,6),
    our_voting_pct                NUMERIC(7,6),

    -- Valuation
    share_price                   NUMERIC(20,8),
    implied_valuation             NUMERIC(20,2),

    -- Detail
    cap_table_detail              JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inv_cap_snapshot_company_date_uq UNIQUE (company_id, snapshot_date, snapshot_type_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_cap_snapshot_company ON inv_cap_table_snapshot(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_cap_snapshot_date ON inv_cap_table_snapshot(company_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_cap_snapshot_round ON inv_cap_table_snapshot(financing_round_id) WHERE financing_round_id IS NOT NULL;
