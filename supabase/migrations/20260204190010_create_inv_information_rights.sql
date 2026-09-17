-- PORTFOLIO_INFORMATION_RIGHTS: Reporting schedules

CREATE TABLE IF NOT EXISTS inv_information_rights (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id            BIGINT NOT NULL REFERENCES inv_company(id) ON DELETE CASCADE,
    financing_round_id    BIGINT REFERENCES inv_financing_round(id) ON DELETE SET NULL,

    -- Identifiers
    external_id           TEXT,

    -- Temporal validity
    effective_date        DATE NOT NULL,
    expiration_date       DATE,

    -- Major Investor Status
    major_investor_threshold NUMERIC(20,2),
    is_major_investor     BOOLEAN NOT NULL DEFAULT FALSE,

    -- Monthly Reporting
    monthly_balance_sheet           BOOLEAN DEFAULT FALSE,
    monthly_cap_table               BOOLEAN DEFAULT FALSE,
    monthly_income_cash_flows       BOOLEAN DEFAULT FALSE,
    monthly_stockholders_equity     BOOLEAN DEFAULT FALSE,
    monthly_timing_days             SMALLINT,

    -- Quarterly Reporting
    quarterly_balance_sheet         BOOLEAN DEFAULT FALSE,
    quarterly_cap_table             BOOLEAN DEFAULT FALSE,
    quarterly_income_cash_flows     BOOLEAN DEFAULT FALSE,
    quarterly_stockholders_equity   BOOLEAN DEFAULT FALSE,
    quarterly_timing_days           SMALLINT,

    -- Year-End Reporting
    year_end_balance_sheet          BOOLEAN DEFAULT FALSE,
    year_end_cap_table              BOOLEAN DEFAULT FALSE,
    year_end_income_cash_flows      BOOLEAN DEFAULT FALSE,
    year_end_stockholders_equity    BOOLEAN DEFAULT FALSE,
    year_end_budget_business_plan   BOOLEAN DEFAULT FALSE,
    year_end_timing_days            SMALLINT,

    -- Audit Requirements
    audited_monthly                 BOOLEAN DEFAULT FALSE,
    audited_quarterly               BOOLEAN DEFAULT FALSE,
    audited_year_end                BOOLEAN DEFAULT FALSE,

    -- Scope
    info_rights_for_all             BOOLEAN DEFAULT FALSE,
    info_rights_for_major           BOOLEAN DEFAULT TRUE,

    -- Additional Rights
    cap_table_access                BOOLEAN DEFAULT FALSE,
    inspection_rights               BOOLEAN DEFAULT FALSE,

    -- Contact
    reporting_contact_name          TEXT,
    reporting_contact_email         TEXT,

    -- Metadata
    notes                           TEXT,
    metadata                        JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_info_rights_company ON inv_information_rights(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_info_rights_round ON inv_information_rights(financing_round_id) WHERE financing_round_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_info_rights_active ON inv_information_rights(company_id) WHERE expiration_date IS NULL;
