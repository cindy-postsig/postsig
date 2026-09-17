-- Same-org + related-vendor invariants for contract_relationships.
--
-- The application enforces these in saveContractLineage (data/superuser/contracts.ts).
-- This trigger is the backstop: contract_relationships has RLS enabled with zero
-- policies, so every write arrives on the service-role client and a bug upstream
-- would otherwise persist a cross-org or cross-vendor link silently.
--
-- contract_relationship_vendors_related below is the single definition of the
-- rule: vendors are related if they share an id, share a canonical id in the
-- current_vendors merge lineage, or are paired by a corporate_actions row in
-- either direction. areVendorsRelated in the application layer calls it as an
-- RPC rather than reimplementing it.

CREATE OR REPLACE FUNCTION public.contract_relationship_canonical_vendor(p_vendor_id INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    -- current_vendors is WITH RECURSIVE, so it already flattens chained merges
    -- (A->B->C maps A straight to C). A vendor absent from the view (never
    -- touched by a corporate action, or status NULL) is its own canonical id.
    SELECT COALESCE(
        (SELECT cv.current_vendor_id
           FROM current_vendors cv
          WHERE cv.original_vendor_id = p_vendor_id
          LIMIT 1),
        p_vendor_id
    );
$function$;

CREATE OR REPLACE FUNCTION public.contract_relationship_vendors_related(
    p_vendor_a INTEGER,
    p_vendor_b INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- A NULL vendor cannot be shown to be related to anything, so it is not a
    -- pass. Callers that legitimately have no vendor to compare must skip this
    -- check explicitly rather than relying on a permissive answer here: the
    -- trigger below short-circuits on NULL, and assertLineageAllowed warns and
    -- returns. Answering TRUE would have made an unknown vendor indistinguishable
    -- from a verified-related one.
    IF p_vendor_a IS NULL OR p_vendor_b IS NULL THEN
        RETURN FALSE;
    END IF;

    IF p_vendor_a = p_vendor_b THEN
        RETURN TRUE;
    END IF;

    IF public.contract_relationship_canonical_vendor(p_vendor_a)
       = public.contract_relationship_canonical_vendor(p_vendor_b) THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1
          FROM corporate_actions ca
         WHERE (ca.primary_vendor_id = p_vendor_a AND ca.secondary_vendor_id = p_vendor_b)
            OR (ca.primary_vendor_id = p_vendor_b AND ca.secondary_vendor_id = p_vendor_a)
    );
END;
$function$;

-- Both functions are SECURITY DEFINER and read vendors / current_vendors /
-- corporate_actions, so a PUBLIC EXECUTE grant (the default) would let any
-- authenticated or anonymous caller probe vendor relationships through them.
-- Only the service role calls the relatedness RPC from the application; the
-- trigger runs as its own definer and does not need a caller-side grant.
REVOKE ALL ON FUNCTION public.contract_relationship_canonical_vendor(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contract_relationship_vendors_related(INTEGER, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.contract_relationship_vendors_related(INTEGER, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_contract_relationship_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_parent_org    UUID;
    v_child_org     UUID;
    v_parent_vendor INTEGER;
    v_child_vendor  INTEGER;
BEGIN
    -- NULL contract ids carry no org/vendor to compare against.
    IF NEW.parent_contract_id IS NULL OR NEW.child_contract_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT c.organization_id, c.vendor_id
      INTO v_parent_org, v_parent_vendor
      FROM contracts c
     WHERE c.id = NEW.parent_contract_id;

    SELECT c.organization_id, c.vendor_id
      INTO v_child_org, v_child_vendor
      FROM contracts c
     WHERE c.id = NEW.child_contract_id;

    IF v_parent_org IS DISTINCT FROM v_child_org THEN
        RAISE EXCEPTION
            'contract_relationships: cannot link contracts across organizations (parent % is in org %, child % is in org %)',
            NEW.parent_contract_id, v_parent_org, NEW.child_contract_id, v_child_org
            USING ERRCODE = 'check_violation';
    END IF;

    -- A missing vendor on either endpoint leaves nothing to compare. Skipped
    -- here rather than inside the relatedness function, which now reports NULL
    -- as "not related" so an unknown vendor cannot pass as a verified one.
    -- Mirrors assertLineageAllowed, which warns and skips the same case.
    IF v_parent_vendor IS NULL OR v_child_vendor IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT public.contract_relationship_vendors_related(v_parent_vendor, v_child_vendor) THEN
        RAISE EXCEPTION
            'contract_relationships: cannot link contracts with unrelated vendors (parent % has vendor %, child % has vendor %)',
            NEW.parent_contract_id, v_parent_vendor, NEW.child_contract_id, v_child_vendor
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_contract_relationship_invariants_trigger
    ON public.contract_relationships;

CREATE TRIGGER enforce_contract_relationship_invariants_trigger
    BEFORE INSERT OR UPDATE ON public.contract_relationships
    FOR EACH ROW EXECUTE FUNCTION public.enforce_contract_relationship_invariants();
