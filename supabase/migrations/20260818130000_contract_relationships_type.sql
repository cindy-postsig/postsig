-- Type contract_relationships edges so an invoice can carry more than one parent.
--
-- An invoice is frequently billed against several service orders at once. Today
-- lineage detection picks a single parent, so every line sourced from the other
-- service orders reconciles against a parent that never promised it and is
-- reported as a discrepancy.
--
-- Rather than widen the hierarchy to a graph -- which every tree-shaped consumer
-- (topmost-parent walks, amendment trees, strike/cancellation chains, product
-- lineage adjacency) would have to be re-proved against -- the extra parents are
-- recorded as a distinct edge type. NULL keeps its meaning as the one hierarchy
-- edge, so every pre-existing row and every existing traversal is untouched; only
-- code that opts in reads 'billing' edges.
--
-- The CHECK is deliberately a closed set of one: a future edge type has to name
-- itself here, which forces the containment question to be asked again rather
-- than a new type silently leaking into the tree.
--
-- Cardinality is deliberately unchanged. The pre-existing
-- UNIQUE (parent_contract_id, child_contract_id) still holds, so a given pair of
-- contracts carries exactly one edge of one type. That is the intended rule, not
-- an oversight: a 'billing' edge names an *additional* parent, so the pair it
-- describes is by construction a pair that has no hierarchy edge. A pair holding
-- both a hierarchy and a billing edge would assert that the same parent is both
-- the structural parent and a separate billing-only parent, which is meaningless.
-- Widening the constraint to include relationship_type would make that state
-- representable and would additionally need a partial unique index to keep the
-- hierarchy edge single (NULL is not equal to itself in a multi-column UNIQUE).
--
-- One-hierarchy-parent-per-child (across *different* parents) remains app-enforced
-- and is not indexed here, because existing production rows may already violate it.
-- Deferred out of psk-1930; gate the follow-up partial unique index on this
-- returning zero rows against production:
--   SELECT child_contract_id
--     FROM contract_relationships
--    WHERE relationship_type IS NULL AND active
--    GROUP BY 1 HAVING count(*) > 1;

ALTER TABLE "public"."contract_relationships"
ADD COLUMN "relationship_type" text CONSTRAINT "contract_relationships_relationship_type_check"
  CHECK ("relationship_type" IN ('billing'));

COMMENT ON COLUMN "public"."contract_relationships"."relationship_type" IS 'Edge type. NULL = hierarchy edge (the single structural parent; every pre-existing row). ''billing'' = an additional parent of an invoice for billing purposes only -- excluded from hierarchy traversal and from cancellation/strike semantics, included in lineage graph rendering. Follows the existing `active` convention: unset at creation, human-activated before anything traverses it.';
