-- PORTFOLIO_EQUITY_PLAN_SNAPSHOT: Point-in-time pool metrics

CREATE TABLE IF NOT EXISTS inv_equity_plan_snapshot (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id               BIGINT NOT NULL REFERENCES inv_equity_plan(id) ON DELETE CASCADE,

    -- Identifiers
    external_id           TEXT,

    -- Snapshot date
    effective_date        DATE NOT NULL,

    -- Pool metrics
    authorized_shares     BIGINT,
    issued_shares         BIGINT,
    outstanding_options   BIGINT,
    exercised_shares      BIGINT,
    cancelled_shares      BIGINT,
    pool_percent_fd       NUMERIC(7,6),

    -- Metadata
    metadata              JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inv_equity_plan_snapshot_plan_date_uq UNIQUE (plan_id, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_inv_equity_plan_snapshot_plan ON inv_equity_plan_snapshot(plan_id);
CREATE INDEX IF NOT EXISTS idx_inv_equity_plan_snapshot_date ON inv_equity_plan_snapshot(plan_id, effective_date DESC);
