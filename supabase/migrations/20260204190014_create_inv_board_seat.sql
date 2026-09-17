-- PORTFOLIO_BOARD_SEAT: Board representation

CREATE TABLE IF NOT EXISTS inv_board_seat (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id            BIGINT NOT NULL REFERENCES inv_company(id) ON DELETE CASCADE,

    -- Identifiers
    external_id           TEXT,

    -- Seat details
    seat_type             TEXT NOT NULL,

    -- Holder
    holder_name           TEXT NOT NULL,
    holder_title          TEXT,

    -- Designating party
    designating_fund_id   BIGINT REFERENCES inv_fund(id) ON DELETE SET NULL,
    designating_security_id BIGINT REFERENCES inv_security(id) ON DELETE SET NULL,

    -- Temporal
    effective_date        DATE NOT NULL,
    end_date              DATE,

    -- Details
    committee_memberships TEXT[],

    -- Metadata
    metadata              JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inv_board_seat_dates_ck CHECK (end_date IS NULL OR end_date >= effective_date),
    CONSTRAINT inv_board_seat_type_ck CHECK (seat_type IN ('investor_designated', 'common_designated', 'independent', 'observer', 'executive'))
);

CREATE INDEX IF NOT EXISTS idx_inv_board_seat_company ON inv_board_seat(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_board_seat_active ON inv_board_seat(company_id) WHERE end_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_inv_board_seat_holder ON inv_board_seat(holder_name);
CREATE INDEX IF NOT EXISTS idx_inv_board_seat_fund ON inv_board_seat(designating_fund_id) WHERE designating_fund_id IS NOT NULL;
