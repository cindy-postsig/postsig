-- PORTFOLIO_ROUND_TERMS: Legal provisions per round (SCD Type 2)

CREATE TABLE IF NOT EXISTS inv_round_terms (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    financing_round_id    BIGINT NOT NULL REFERENCES inv_financing_round(id) ON DELETE CASCADE,

    -- Identifiers
    external_id           TEXT,

    -- Temporal validity
    effective_date        DATE NOT NULL,
    superseded_date       DATE,

    -- Major Investor Provisions
    major_investor_threshold_amount   NUMERIC(20,2),
    major_investor_threshold_shares   BIGINT,
    major_investor_threshold_ownership_pct NUMERIC(7,6),
    named_major_investors             TEXT[],

    -- Pro-Rata Rights
    pro_rata_rights_all               BOOLEAN,
    pro_rata_rights_major             BOOLEAN,
    standard_pro_rata_formulation     BOOLEAN,

    -- Governance Provisions
    drag_along                        BOOLEAN,
    pay_to_play                       BOOLEAN,
    do_insurance                      BOOLEAN,
    rofr_cosale                       BOOLEAN,
    investors_subject_to_rofr         BOOLEAN,
    registration_rights_preferred     BOOLEAN,
    redemption_rights                 BOOLEAN,

    -- Vesting & Employment
    employee_vesting_protocol         BOOLEAN,
    founder_vesting_applied           BOOLEAN,

    -- Closing Mechanics
    milestone_closings                BOOLEAN,
    subsequent_closing_window_days    SMALLINT,
    required_closing_payments         TEXT,

    -- Counsel & Fees
    investor_counsel_fee_cap          NUMERIC(20,2),
    issuer_pays_investor_counsel      BOOLEAN,

    -- QSBS
    qsbs_covenant_given               BOOLEAN,
    qsbs_rep_made                     BOOLEAN,

    -- Cap Table Snapshot
    pre_money_fd_shares               BIGINT,
    post_money_fd_shares              BIGINT,
    option_pool_percent               NUMERIC(5,4),

    -- Raw terms
    raw_terms                         JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inv_round_terms_dates_ck CHECK (superseded_date IS NULL OR superseded_date > effective_date)
);

CREATE INDEX IF NOT EXISTS idx_inv_round_terms_round ON inv_round_terms(financing_round_id);
CREATE INDEX IF NOT EXISTS idx_inv_round_terms_current ON inv_round_terms(financing_round_id) WHERE superseded_date IS NULL;
