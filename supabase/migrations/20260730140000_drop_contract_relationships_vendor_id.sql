-- Retire contract_relationships.vendor_id.
--
-- The column was written on every lineage save but read by no code path. Vendor
-- identity is derivable from the linked contracts (which carry the matched
-- historical vendor id) and is recorded in the relationship's metadata.vendor_id,
-- so storing it again on the relationship was redundant denormalization that
-- could drift from the contracts it described.
--
-- The application stopped writing it in the preceding change, so nothing
-- populates this column by the time it is dropped.
--
-- Verified before writing this migration: no index and no view depends on the
-- column, so the FK is its only dependent object.

ALTER TABLE public.contract_relationships
    DROP CONSTRAINT IF EXISTS contract_relationships_vendor_id_fkey;

ALTER TABLE public.contract_relationships
    DROP COLUMN IF EXISTS vendor_id;
