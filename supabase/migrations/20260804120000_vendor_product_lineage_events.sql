-- PSK-1830: vendor product lineage events.
--
-- An addendum can declare that products licensed by earlier contracts in its
-- chain are cancelled and replaced. This table records what a
-- contract *declares*; the effect on the rendered chain is resolved at display
-- time. vendor_products_details is deliberately never mutated — it stays a
-- faithful per-document record.
--
-- action semantics:
--   replace_all_prior  blanket — strikes every product of every chain contract
--                      dated earlier than the declaring contract. product_id is
--                      NULL because no specific product is named.
--   cancel_product     strikes one product_id in earlier-dated chain contracts.
--
-- source/status: extraction writes source='ai', status='pending'. Only
-- status='confirmed' rows affect display, so an AI misread is inert until a
-- human confirms it (queue lives in postsig-hextraction).

CREATE TABLE IF NOT EXISTS public.vendor_product_lineage_events (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_id       integer NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    product_id        integer REFERENCES public.vendor_products(id) ON DELETE CASCADE,

    action            text NOT NULL CHECK (action IN ('replace_all_prior', 'cancel_product')),
    source            text NOT NULL CHECK (source IN ('ai', 'human')),
    status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
    evidence          jsonb,

    created_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
    confirmed_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    confirmed_at      timestamptz,

    -- A blanket replacement names no product; a per-product cancellation must.
    CONSTRAINT vendor_product_lineage_events_product_id_matches_action CHECK (
        (action = 'replace_all_prior' AND product_id IS NULL)
        OR (action = 'cancel_product' AND product_id IS NOT NULL)
    )
);

-- Idempotency target for the extraction step: Inngest retries re-run event
-- creation, and one declaration must not become N rows. Rejected rows are
-- excluded so ops can reject an AI event and a later re-extraction can still
-- raise a fresh one. COALESCE keys the blanket case (product_id NULL) to 0,
-- which is not a valid vendor_products id, so it cannot collide with a
-- cancel_product row.
CREATE UNIQUE INDEX IF NOT EXISTS vendor_product_lineage_events_dedupe
    ON public.vendor_product_lineage_events (contract_id, action, COALESCE(product_id, 0))
    WHERE status <> 'rejected';

-- Display resolution fetches confirmed events for every contract in a chain.
CREATE INDEX IF NOT EXISTS idx_vendor_product_lineage_events_contract
    ON public.vendor_product_lineage_events (contract_id);
CREATE INDEX IF NOT EXISTS idx_vendor_product_lineage_events_organization
    ON public.vendor_product_lineage_events (organization_id);

COMMENT ON TABLE public.vendor_product_lineage_events IS 'Declarations by a contract that earlier chain products are cancelled/replaced (PSK-1830). Resolved at display time; only confirmed rows affect rendering.';
COMMENT ON COLUMN public.vendor_product_lineage_events.contract_id IS 'The declaring contract (typically an addendum)';
COMMENT ON COLUMN public.vendor_product_lineage_events.product_id IS 'Target product for cancel_product; NULL for the blanket replace_all_prior';
COMMENT ON COLUMN public.vendor_product_lineage_events.source IS 'ai = created by extraction, human = created in the ops confirmation queue';
COMMENT ON COLUMN public.vendor_product_lineage_events.status IS 'Only confirmed events affect the lineage view';
COMMENT ON COLUMN public.vendor_product_lineage_events.evidence IS 'Supporting quotes / raw extraction payload backing the declaration';

-- Reads are org-scoped for the authenticated app; writes arrive on the service
-- role (extraction step, ops queue), which bypasses RLS. Mirrors the read-only
-- authenticated posture of the contract version tables.
ALTER TABLE public.vendor_product_lineage_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.vendor_product_lineage_events TO authenticated;

DROP POLICY IF EXISTS "vendor_product_lineage_events_read" ON public.vendor_product_lineage_events;
CREATE POLICY "vendor_product_lineage_events_read" ON public.vendor_product_lineage_events
    FOR SELECT
    TO authenticated
    USING (
        contract_id IN (
            SELECT id FROM contracts_visible_to(
                (SELECT organization_id FROM users WHERE id = auth.uid()),
                auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "vendor_product_lineage_events_anon_deny" ON public.vendor_product_lineage_events;
CREATE POLICY "vendor_product_lineage_events_anon_deny" ON public.vendor_product_lineage_events
    FOR ALL
    TO anon
    USING (false);
