-- The contract set is fetched with PostgREST embeds, which join each child
-- table once per contract row. Without an index on the child's contract
-- column every one of those joins scans the whole table: on production
-- vendor_products_details had been scanned 935k times (6.1 billion tuples)
-- and contract_docs 1.16 million times (3.7 billion tuples).
--
-- idx_vendor_products_details_contract_sort_order was created by
-- 20260422120000 but is absent from production; the definition is repeated
-- verbatim so the same name means the same index everywhere.

CREATE INDEX IF NOT EXISTS idx_vendor_products_details_contract_sort_order
  ON public.vendor_products_details (contract_id, sort_order NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_contract_docs_contract
  ON public.contract_docs (contract_id);

CREATE INDEX IF NOT EXISTS idx_contract_relationships_child
  ON public.contract_relationships (child_contract_id);

CREATE INDEX IF NOT EXISTS idx_activities_contract
  ON public.activities (contract_id);
