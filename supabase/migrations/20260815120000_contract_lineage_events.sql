-- PSK-1845: contract lineage events.
--
-- Vendors often issue a new contract on new paper instead of renewing an
-- existing one. This table records a detected contract-to-contract lineage
-- event; 'replace' is the first action. The table is named agnostically (like
-- vendor_product_lineage_events, migration 20260804120000) so future
-- contract-level event kinds can extend the action CHECK rather than add a
-- table.
--
-- This feature deliberately writes NO contract_relationships edge: a
-- replacement edge would merge the old and new chains and change which products
-- the psk-1830 cancellation events strike. The replacement lineage lives only
-- here.
--
-- status lifecycle (two human gates, both stamped):
--   pending    detection wrote it (source='ai'); invisible to customers.
--   verified   an extractor screened it in postsig-hextraction
--              (screened_by/screened_at). Only verified rows surface to the
--              customer.
--   confirmed  the customer answered "yes, archive the old contract"
--              (resolved_by/resolved_at).
--   rejected   refused at either gate. Terminal.

CREATE TABLE IF NOT EXISTS public.contract_lineage_events (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    old_contract_id   integer NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    new_contract_id   integer NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,

    action            text NOT NULL CHECK (action IN ('replace')),
    source            text NOT NULL CHECK (source IN ('ai', 'human')),
    status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'confirmed', 'rejected')),
    evidence          jsonb,

    created_at        timestamptz NOT NULL DEFAULT now(),
    screened_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
    screened_at       timestamptz,
    resolved_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
    resolved_at       timestamptz,

    CONSTRAINT contract_lineage_events_distinct_contracts CHECK (old_contract_id <> new_contract_id),

    -- Each gate stamps itself on the way through. 'rejected' is deliberately
    -- unconstrained: it is reachable from either gate, so it carries whichever
    -- stamp refused it.
    CONSTRAINT contract_lineage_events_verified_screened
        CHECK (status <> 'verified' OR screened_at IS NOT NULL),
    CONSTRAINT contract_lineage_events_confirmed_resolved
        CHECK (status <> 'confirmed' OR resolved_at IS NOT NULL)
);

-- Idempotency target for the detection step (Inngest retries re-run it), and
-- the permanent suppression record for a refused pair.
--
-- Deliberately NOT partial, unlike vendor_product_lineage_events_dedupe
-- (WHERE status <> 'rejected'). There, rejecting an AI event should let a later
-- re-extraction raise a fresh one. Here a rejection is a human answering "these
-- are not the same contract" — at either the extractor or the customer gate —
-- and re-extraction must never re-prompt for that pair.
CREATE UNIQUE INDEX IF NOT EXISTS contract_lineage_events_dedupe
    ON public.contract_lineage_events (old_contract_id, new_contract_id, action);

-- The customer surfaces (list indicator, detail banner, "Replaced by" flag) all
-- look up events by the old contract.
CREATE INDEX IF NOT EXISTS idx_contract_lineage_events_old_contract
    ON public.contract_lineage_events (old_contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_lineage_events_organization
    ON public.contract_lineage_events (organization_id);

COMMENT ON TABLE public.contract_lineage_events IS 'Detected contract-to-contract lineage events. Screened by an extractor, then resolved by the customer; no contract_relationships edge is written.';
COMMENT ON COLUMN public.contract_lineage_events.old_contract_id IS 'The existing contract proposed for archiving';
COMMENT ON COLUMN public.contract_lineage_events.new_contract_id IS 'The newly extracted contract detected as its replacement';
COMMENT ON COLUMN public.contract_lineage_events.action IS 'Event kind; replace = new_contract supersedes old_contract';
COMMENT ON COLUMN public.contract_lineage_events.source IS 'ai = created by the detection step, human = created manually';
COMMENT ON COLUMN public.contract_lineage_events.status IS 'pending -> verified|rejected (extractor), verified -> confirmed|rejected (customer); only verified rows surface to customers';
COMMENT ON COLUMN public.contract_lineage_events.evidence IS 'matched_products, date_delta_days and the LLM pair-check quotes backing the detection';
COMMENT ON COLUMN public.contract_lineage_events.screened_by IS 'Extractor who moved the event out of pending';
COMMENT ON COLUMN public.contract_lineage_events.resolved_by IS 'Customer user who answered the archive prompt';

-- Reads are scoped to contracts the user can see; writes arrive on the service
-- role (detection step, hextraction queue, customer server actions), which
-- bypasses RLS. Mirrors vendor_product_lineage_events.
ALTER TABLE public.contract_lineage_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.contract_lineage_events TO authenticated;

DROP POLICY IF EXISTS "contract_lineage_events_read" ON public.contract_lineage_events;
CREATE POLICY "contract_lineage_events_read" ON public.contract_lineage_events
    FOR SELECT
    TO authenticated
    USING (
        old_contract_id IN (
            SELECT id FROM contracts_visible_to(
                (SELECT organization_id FROM users WHERE id = auth.uid()),
                auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "contract_lineage_events_anon_deny" ON public.contract_lineage_events;
CREATE POLICY "contract_lineage_events_anon_deny" ON public.contract_lineage_events
    FOR ALL
    TO anon
    USING (false);
