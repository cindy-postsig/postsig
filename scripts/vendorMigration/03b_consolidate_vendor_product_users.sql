-- Manual migration script 3b: Consolidate duplicate vendor_products_users entries
-- This script runs after 03_update_f_keys.sql and before 04_rename_tables.sql
-- It consolidates duplicate (product_id, contract_id) rows which resulted from globalizing product_id.

DO $$
DECLARE
  -- No variable declarations needed at this top level for this script
BEGIN

RAISE NOTICE 'Starting consolidation of duplicate vendor_products_users entries...';

-- 1. Create a temporary table to hold consolidated data
CREATE TEMPORARY TABLE temp_consolidated_vendor_products_users (
    product_id INTEGER NOT NULL,
    contract_id INTEGER NOT NULL,
    total_number_of_users INTEGER, -- Sum of number_of_users for duplicates
    created_at TIMESTAMPTZ, -- Take minimum created_at
    updated_at TIMESTAMPTZ -- Take maximum updated_at
);

-- 2. Populate the temporary table with consolidated data
INSERT INTO temp_consolidated_vendor_products_users (product_id, contract_id, total_number_of_users, created_at, updated_at)
SELECT
    product_id,
    contract_id,
    SUM(number_of_users), -- Sum up the number_of_users
    MIN(created_at), -- Take the earliest created_at
    MAX(updated_at) -- Take the latest updated_at
FROM
    vendor_products_users
GROUP BY
    product_id,
    contract_id
HAVING
    COUNT(*) > 1; -- Only select groups with duplicates

RAISE NOTICE 'Identified and consolidated % groups of duplicate vendor_products_users entries', (SELECT COUNT(*) FROM temp_consolidated_vendor_products_users);

-- 3. Delete original duplicate rows from vendor_products_users
-- We delete all rows that are part of a group with duplicates
DELETE FROM vendor_products_users vpu
WHERE EXISTS (
    SELECT 1
    FROM temp_consolidated_vendor_products_users tc
    WHERE vpu.product_id = tc.product_id
      AND vpu.contract_id = tc.contract_id
);

RAISE NOTICE 'Deleted original duplicate vendor_products_users entries.';

-- 4. Insert consolidated rows back into vendor_products_users
-- Note: We need to ensure 'id' is handled by the SERIAL property or similar.
-- If the 'id' column is serial, simply inserting the data should work.
-- If 'id' was the primary key and not serial, this would be more complex.
-- Assuming 'id' is a SERIAL primary key that will be generated on insert.
INSERT INTO vendor_products_users (product_id, contract_id, number_of_users, created_at, updated_at)
SELECT
    product_id,
    contract_id,
    total_number_of_users,
    created_at,
    updated_at
FROM
    temp_consolidated_vendor_products_users;

RAISE NOTICE 'Inserted consolidated vendor_products_users entries.';

-- 5. Drop the temporary table
DROP TABLE temp_consolidated_vendor_products_users;

RAISE NOTICE 'Finished consolidation of duplicate vendor_products_users entries.';

END$$; 