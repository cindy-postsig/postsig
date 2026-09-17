-- Corporate events: merger, acquisition, spin-off, reorganization.
--
-- A corporate event links one or more predecessor portfolio companies to one
-- or more successor portfolio companies inside an organization. It is a
-- first-class record, not a flag on inv_company: the predecessor's own
-- transactions are never edited, and the valuation view (a later migration)
-- reads the event to stop counting the same invested capital twice.
--
-- inv_corporate_event carries the what and when. inv_corporate_event_party
-- carries who: a `predecessor` row per company that stops being the position,
-- a `successor` row per company that continues it. `cost_allocation_ratio`
-- lives only on successor rows and is the share of every predecessor's cost
-- that flows to that successor (a merger has one successor at 1.0; a spin-off
-- parent keeps 1 minus the sum). The sum-of-ratios rule is enforced by the
-- API that writes these rows; the view caps at 1 defensively.
--
-- `successor_cost_booked` says whether the successor's own transactions
-- already carry the cost (true, the default: the view only excludes the
-- predecessor's allocated share) or not (false: the view also adds the carried
-- cost to the successor).
--
-- Consideration columns are records for audit, not inputs to any rollup. Cash
-- proceeds are booked as `exit_consideration` transactions on the predecessor.
--
-- inv_companies.merged_into_company_id and inv_companies.merger_effective_date
-- (global registry, one direction, no ratio) are superseded by these tables.
-- Nothing reads or writes them; they are left in place untouched.

CREATE TABLE IF NOT EXISTS inv_corporate_event (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    event_type             TEXT NOT NULL,
    event_date             DATE NOT NULL,
    announced_date         DATE,

    successor_cost_booked  BOOLEAN NOT NULL DEFAULT TRUE,

    -- Consideration received by the predecessor's holders (records only)
    cash_consideration     NUMERIC(20,2),
    stock_consideration    NUMERIC(20,2),
    deferred_consideration NUMERIC(20,2),
    exchange_ratio         NUMERIC(20,8),

    notes                  TEXT,
    metadata               JSONB NOT NULL DEFAULT '{}',

    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT inv_corporate_event_type_ck
        CHECK (event_type IN ('merger', 'acquisition', 'spin_off', 'reorganization')),
    -- Lets party rows reference (organization_id, id) so a party can never
    -- point at another organization's event.
    CONSTRAINT inv_corporate_event_org_id_uq UNIQUE (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_inv_corporate_event_org
    ON inv_corporate_event(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_corporate_event_org_date
    ON inv_corporate_event(organization_id, event_date);

-- Same for companies: the party's company must belong to the party's
-- organization, as a constraint rather than an RLS gap.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inv_company_org_id_uq'
    ) THEN
        ALTER TABLE inv_company
            ADD CONSTRAINT inv_company_org_id_uq UNIQUE (organization_id, id);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS inv_corporate_event_party (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    event_id               BIGINT NOT NULL,
    company_id             BIGINT NOT NULL,

    role                   TEXT NOT NULL,
    cost_allocation_ratio  NUMERIC(9,6),

    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT inv_corporate_event_party_role_ck
        CHECK (role IN ('predecessor', 'successor')),
    CONSTRAINT inv_corporate_event_party_ratio_ck
        CHECK (cost_allocation_ratio IS NULL
               OR (cost_allocation_ratio >= 0 AND cost_allocation_ratio <= 1)),
    CONSTRAINT inv_corporate_event_party_ratio_role_ck
        CHECK ((role = 'successor') = (cost_allocation_ratio IS NOT NULL)),
    CONSTRAINT inv_corporate_event_party_uq UNIQUE (event_id, company_id, role),
    CONSTRAINT inv_corporate_event_party_event_fkey
        FOREIGN KEY (organization_id, event_id)
        REFERENCES inv_corporate_event(organization_id, id) ON DELETE CASCADE,
    CONSTRAINT inv_corporate_event_party_company_fkey
        FOREIGN KEY (organization_id, company_id)
        REFERENCES inv_company(organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_inv_corporate_event_party_org
    ON inv_corporate_event_party(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_corporate_event_party_event
    ON inv_corporate_event_party(event_id);
CREATE INDEX IF NOT EXISTS idx_inv_corporate_event_party_company
    ON inv_corporate_event_party(company_id);

-- Row level security: same org_access policy every inv_* table carries
-- (see 20260204190018_enable_rls.sql).
ALTER TABLE inv_corporate_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_corporate_event_party ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access" ON inv_corporate_event;
CREATE POLICY "org_access" ON inv_corporate_event FOR ALL
    USING (organization_id = public.user_organization_id())
    WITH CHECK (organization_id = public.user_organization_id());

DROP POLICY IF EXISTS "org_access" ON inv_corporate_event_party;
CREATE POLICY "org_access" ON inv_corporate_event_party FOR ALL
    USING (organization_id = public.user_organization_id())
    WITH CHECK (organization_id = public.user_organization_id());

-- updated_at maintenance (see 20260204190019_create_triggers.sql).
DROP TRIGGER IF EXISTS update_inv_corporate_event_updated_at ON inv_corporate_event;
CREATE TRIGGER update_inv_corporate_event_updated_at
    BEFORE UPDATE ON inv_corporate_event
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_inv_corporate_event_party_updated_at ON inv_corporate_event_party;
CREATE TRIGGER update_inv_corporate_event_party_updated_at
    BEFORE UPDATE ON inv_corporate_event_party
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
