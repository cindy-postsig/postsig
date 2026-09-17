-- Global company registry
-- This is the canonical source for company master data.
-- Portfolio companies (inv_company) link here via required FK.
-- NOT organization-scoped - companies are global entities.

CREATE TABLE IF NOT EXISTS inv_companies (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Identifiers
    public_id             UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

    -- Core company data
    name                  TEXT NOT NULL,
    legal_name            TEXT,
    domain                TEXT UNIQUE,              -- Primary dedup key

    -- Characteristics
    description           TEXT,
    industry              TEXT,
    headquarters          TEXT,
    founded_year          SMALLINT CHECK (founded_year >= 1800 AND founded_year <= 2100),
    legal_jurisdiction    TEXT,
    entity_type           TEXT,                     -- Corporation, LLC, etc.

    -- Contact
    address               TEXT,
    phone                 TEXT,
    email                 TEXT,

    -- Status
    status                TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'merged', 'acquired', 'dissolved')),

    -- M&A tracking
    merged_into_company_id BIGINT REFERENCES inv_companies(id) ON DELETE SET NULL,
    merger_effective_date  DATE,

    -- Metadata
    metadata              JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE inv_companies IS 'Global company registry - canonical source for company master data';
COMMENT ON COLUMN inv_companies.domain IS 'Primary key for deduplication during import';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inv_companies_name ON inv_companies(name);
CREATE INDEX IF NOT EXISTS idx_inv_companies_domain ON inv_companies(domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_companies_status ON inv_companies(status);
CREATE INDEX IF NOT EXISTS idx_inv_companies_industry ON inv_companies(industry) WHERE industry IS NOT NULL;
