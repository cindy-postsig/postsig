-- PORTFOLIO_COMPANY: Portfolio companies (org-scoped link to global companies)
-- This table links an organization's portfolio to the global companies registry.
-- Core company data (name, domain, industry, etc.) lives in the global `companies` table.
-- This table stores organization-specific portfolio data (status, contacts, notes).
--
-- IMPORT PROCESS:
--   1. Find or create company in global `companies` table (match by domain/name)
--   2. Create inv_company record linking to global company_id
--   3. Store org-specific overrides and portfolio metadata here

CREATE TABLE IF NOT EXISTS inv_company (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Link to global companies registry (REQUIRED)
    company_id            BIGINT NOT NULL REFERENCES inv_companies(id) ON DELETE RESTRICT,

    -- Identifiers
    external_id           TEXT,                    -- Aumni Portfolio Company ID
    public_id             UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

    -- Portfolio status (org-specific, different from global company status)
    status                TEXT NOT NULL DEFAULT 'active',

    -- Organization-specific overrides (use if different from global)
    name_override         TEXT,                    -- If org uses different name
    sector                TEXT,                    -- More specific than global industry

    -- Organization-specific contact for this portfolio company
    contact_person        TEXT,
    contact_email         TEXT,

    -- Portfolio metadata
    investment_thesis     TEXT,
    notes                 TEXT,
    tags                  TEXT[],
    metadata              JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inv_company_org_company_uq UNIQUE (organization_id, company_id),
    CONSTRAINT inv_company_org_external_uq UNIQUE (organization_id, external_id),
    CONSTRAINT inv_company_status_ck CHECK (status IN ('active', 'exited_ipo', 'exited_acquisition', 'exited_merger', 'exited_liquidation', 'written_off', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_inv_company_org ON inv_company(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_company_company ON inv_company(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_company_status ON inv_company(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_company_external ON inv_company(external_id) WHERE external_id IS NOT NULL;
