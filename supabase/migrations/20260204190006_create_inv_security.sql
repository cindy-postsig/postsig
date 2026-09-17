-- PORTFOLIO_SECURITY: Securities/share classes

CREATE TABLE IF NOT EXISTS inv_security (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id            BIGINT NOT NULL REFERENCES inv_company(id) ON DELETE CASCADE,

    -- Identifiers
    external_id           TEXT,
    public_id             UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

    -- Security details
    name                  TEXT NOT NULL,
    security_type         TEXT NOT NULL,
    series_name           TEXT,

    -- Flags
    is_valuation_reference BOOLEAN NOT NULL DEFAULT FALSE,

    -- Metadata
    metadata              JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inv_security_org_external_uq UNIQUE (organization_id, external_id),
    CONSTRAINT inv_security_company_name_uq UNIQUE (company_id, name),
    CONSTRAINT inv_security_type_ck CHECK (security_type IN ('common', 'preferred', 'safe', 'convertible_note', 'warrant', 'option'))
);

CREATE INDEX IF NOT EXISTS idx_inv_security_org ON inv_security(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_security_company ON inv_security(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_security_external ON inv_security(external_id) WHERE external_id IS NOT NULL;
