-- Canonicalize both sides of the corporate-action pair check in
-- contract_relationship_vendors_related.
--
-- Lineage discovery (expandVendorLineageIds) now spans the corporate-action
-- family, and contracts keep historical vendor ids, so the write guard must
-- accept any pair whose *canonical* ids are corp-paired. Previously the
-- fallback compared the exact historical ids, so a contract stored under a
-- merged sibling of a corp partner was discoverable by the lineage pipeline
-- but rejected by the trigger (ContractLineageInvariantError).
--
-- The corp-action row's own vendor ids are canonicalized too: a row may
-- predate a later merger of either party.
--
-- NULL handling, grants, and the trigger are unchanged (see
-- 20260730130000_contract_relationship_invariants.sql).

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
DECLARE
    v_canon_a INTEGER;
    v_canon_b INTEGER;
BEGIN
    -- A NULL vendor cannot be shown to be related to anything, so it is not a
    -- pass. Callers that legitimately have no vendor to compare must skip this
    -- check explicitly rather than relying on a permissive answer here.
    IF p_vendor_a IS NULL OR p_vendor_b IS NULL THEN
        RETURN FALSE;
    END IF;

    IF p_vendor_a = p_vendor_b THEN
        RETURN TRUE;
    END IF;

    v_canon_a := public.contract_relationship_canonical_vendor(p_vendor_a);
    v_canon_b := public.contract_relationship_canonical_vendor(p_vendor_b);

    IF v_canon_a = v_canon_b THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1
          FROM corporate_actions ca
         WHERE (public.contract_relationship_canonical_vendor(ca.primary_vendor_id) = v_canon_a
            AND public.contract_relationship_canonical_vendor(ca.secondary_vendor_id) = v_canon_b)
            OR (public.contract_relationship_canonical_vendor(ca.primary_vendor_id) = v_canon_b
            AND public.contract_relationship_canonical_vendor(ca.secondary_vendor_id) = v_canon_a)
    );
END;
$function$;
