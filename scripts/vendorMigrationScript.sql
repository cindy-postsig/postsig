-- Migration File 1: Setup New Global Tables & Mapping Tables

-- 1. Create the new global_vendors table (intermediate name)
CREATE TABLE global_vendors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE, -- This will be vendors_name_key after rename
    address TEXT,
    email TEXT,
    phone INTEGER,
    domain TEXT,
    description TEXT,
    ict_provider BOOLEAN,
    status public."VendorStatus", -- Added: To preserve vendor status
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE global_vendors IS 'Intermediate consolidated global vendors table.';

-- 2. Create the new global_vendor_products table (intermediate name)
CREATE TABLE global_vendor_products (
    id SERIAL PRIMARY KEY,
    vendor_id INTEGER NOT NULL REFERENCES global_vendors(id) ON DELETE CASCADE, -- FK to global_vendors, name will be like global_vendor_products_vendor_id_fkey
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (vendor_id, name) -- This will be vendor_products_vendor_id_name_key after rename
);
COMMENT ON TABLE global_vendor_products IS 'Intermediate consolidated global vendor products table.';

-- 3. Create permanent mapping table for old 'vendors.id' to 'global_vendors.id'
CREATE TABLE map_old_vendor_to_global (
    old_vendor_id INTEGER PRIMARY KEY,
    global_vendor_id INTEGER NOT NULL REFERENCES global_vendors(id),
    old_vendor_name TEXT
);
COMMENT ON TABLE map_old_vendor_to_global IS 'Permanent mapping from old vendors.id to global_vendors.id.';

-- 4. Create permanent mapping table for old 'vendor_products.id' to 'global_vendor_products.id'
CREATE TABLE map_old_product_to_global (
    old_product_id INTEGER PRIMARY KEY,
    global_product_id INTEGER NOT NULL REFERENCES global_vendor_products(id)
);
COMMENT ON TABLE map_old_product_to_global IS 'Permanent mapping from old vendor_products.id to global_vendor_products.id.';


-- Migration File 2: Populate global_vendors & map_old_vendor_to_global

-- 1. Populate global_vendors with consolidated data from original 'vendors'
INSERT INTO
  global_vendors (name, domain, ict_provider, address, email, phone, description, status)
SELECT
  v_orig.name,
  min(v_orig.domain) as domain,
  bool_or(v_orig.ict_provider) as ict_provider,
  min(v_orig.address) as address,
  min(v_orig.email) as email,
  min(v_orig.phone) as phone,
  min(v_orig.description) as description,
  MIN(v_orig.status::text)::public."VendorStatus" AS status
FROM
  vendors v_orig -- Your original 'vendors' table
GROUP BY
  v_orig.name;

-- 2. Populate the vendor ID mapping table (map_old_vendor_to_global)
INSERT INTO
  map_old_vendor_to_global (old_vendor_id, global_vendor_id, old_vendor_name)
SELECT
  v_orig.id as old_vendor_id,
  gv.id as global_vendor_id,
  v_orig.name as old_vendor_name
FROM
  vendors v_orig -- Original 'vendors' table
  JOIN global_vendors gv ON v_orig.name = gv.name;

CREATE INDEX IF NOT EXISTS idx_map_old_vendor_global_id ON map_old_vendor_to_global (global_vendor_id);
CREATE INDEX IF NOT EXISTS idx_map_old_vendor_name ON map_old_vendor_to_global (old_vendor_name);


-- Migration File 3: Populate global_vendor_products & map_old_product_to_global

-- 1. Populate global_vendor_products
INSERT INTO global_vendor_products (vendor_id, name)
SELECT
    v_map.global_vendor_id,
    op_orig.name
FROM
    vendor_products op_orig -- Original 'vendor_products' table
JOIN
    map_old_vendor_to_global v_map ON op_orig.vendor_id = v_map.old_vendor_id
GROUP BY
    v_map.global_vendor_id,
    op_orig.name;

-- 2. Populate the product ID mapping table (map_old_product_to_global)
INSERT INTO map_old_product_to_global (old_product_id, global_product_id)
SELECT
    op_orig.id AS old_product_id,
    gvp.id AS global_product_id
FROM
    vendor_products op_orig -- Original 'vendor_products'
JOIN
    map_old_vendor_to_global v_map ON op_orig.vendor_id = v_map.old_vendor_id
JOIN
    global_vendor_products gvp ON v_map.global_vendor_id = gvp.vendor_id AND op_orig.name = gvp.name;

CREATE INDEX IF NOT EXISTS idx_map_old_product_global_id ON map_old_product_to_global(global_product_id);


-- Migration File 4: Update Foreign Key Values in Dependent Tables

-- Note: Existing FK constraints on these columns might need to be dropped
-- temporarily if they prevent updating the ID values because they still point
-- to the old 'vendors' or 'vendor_products' tables.
-- This is a common step before mass-updating FK columns.
-- Example:
-- ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_vendor_id_fkey;
-- ALTER TABLE vendor_products_details DROP CONSTRAINT IF EXISTS vendor_products_details_product_id_fkey;
-- ALTER TABLE contract_relationships DROP CONSTRAINT IF EXISTS contract_relationships_vendor_id_fkey;
-- ALTER TABLE contract_users DROP CONSTRAINT IF EXISTS contract_users_product_id_fkey;
-- ALTER TABLE vendor_products_users DROP CONSTRAINT IF EXISTS vendor_products_users_product_id_fkey;
-- ALTER TABLE vendor_products_details DROP CONSTRAINT IF EXISTS vendor_products_details_pkey;
-- These constraints will be correctly re-added in the next migration file.
-- Note: Existing FK constraints on these columns pointing to the *original* vendors/vendor_products
-- tables might need to be dropped temporarily before these UPDATEs if they cause issues.
-- They will be formally dropped in File 5 before the original tables are dropped.

-- 1. Update contracts.vendor_id to use IDs from global_vendors
UPDATE contracts c
SET vendor_id = map.global_vendor_id
FROM map_old_vendor_to_global map
WHERE c.vendor_id = map.old_vendor_id;

-- 2. Update vendor_products_details.product_id to use IDs from global_vendor_products
UPDATE vendor_products_details vpd
SET product_id = map.global_product_id
FROM map_old_product_to_global map
WHERE vpd.product_id = map.old_product_id;

-- 3. Update contract_relationships.vendor_id to use IDs from global_vendors
UPDATE contract_relationships cr
SET vendor_id = map.global_vendor_id
FROM map_old_vendor_to_global map
WHERE cr.vendor_id = map.old_vendor_id;

-- 4. Update contract_users.product_id to use IDs from global_vendor_products
UPDATE contract_users cu
SET product_id = map.global_product_id
FROM map_old_product_to_global map
WHERE cu.product_id = map.old_product_id;

-- 5. Update vendor_products_users.product_id to use IDs from global_vendor_products
UPDATE vendor_products_users vpu
SET product_id = map.global_product_id
FROM map_old_product_to_global map
WHERE vpu.product_id = map.old_product_id;

-- 6. Update corporate_actions.primary_vendor_id to use IDs from global_vendors
UPDATE corporate_actions ca
SET primary_vendor_id = map.global_vendor_id
FROM map_old_vendor_to_global map
WHERE ca.primary_vendor_id = map.old_vendor_id;

-- 7. Update corporate_actions.secondary_vendor_id to use IDs from global_vendors
UPDATE corporate_actions ca
SET secondary_vendor_id = map.global_vendor_id
FROM map_old_vendor_to_global map
WHERE ca.secondary_vendor_id = map.old_vendor_id;


-- Migration File 5: Backup & Drop Originals, Rename Globals to Finals, Update Constraints, Cleanup Maps

BEGIN;

-- Modified Step 1: Backup original tables AND rename their constraints
DO $$
DECLARE
    backup_date TEXT;
    backup_vendors_table TEXT;
    backup_products_table TEXT;
BEGIN
    backup_date := to_char(current_date, 'YYYYMMDD');
    backup_vendors_table := 'vendors_original_backup_' || backup_date;
    backup_products_table := 'vendor_products_original_backup_' || backup_date;
    
    -- Step 1a: Rename original tables to backup names
    EXECUTE 'ALTER TABLE IF EXISTS public.vendors RENAME TO ' || backup_vendors_table;
    EXECUTE 'ALTER TABLE IF EXISTS public.vendor_products RENAME TO ' || backup_products_table;
    
    RAISE NOTICE 'Original tables backed up as % and %', 
        backup_vendors_table, backup_products_table;
    
    -- Step 1b: Rename constraints on backup tables to avoid conflicts
    -- For vendors
    BEGIN
        EXECUTE 'ALTER TABLE public.' || backup_vendors_table || 
                ' RENAME CONSTRAINT vendors_pkey TO ' || backup_vendors_table || '_pkey';
        RAISE NOTICE 'Renamed vendors_pkey to %_pkey on backup table', backup_vendors_table;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error renaming vendors_pkey: %', SQLERRM;
    END;
    
    BEGIN
        EXECUTE 'ALTER TABLE public.' || backup_vendors_table || 
                ' RENAME CONSTRAINT vendors_name_key TO ' || backup_vendors_table || '_name_key';
        RAISE NOTICE 'Renamed vendors_name_key to %_name_key on backup table', backup_vendors_table;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error renaming vendors_name_key: %', SQLERRM;
    END;
    
    -- For vendor_products
    BEGIN
        EXECUTE 'ALTER TABLE public.' || backup_products_table || 
                ' RENAME CONSTRAINT vendor_products_pkey TO ' || backup_products_table || '_pkey';
        RAISE NOTICE 'Renamed vendor_products_pkey to %_pkey on backup table', backup_products_table;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error renaming vendor_products_pkey: %', SQLERRM;
    END;
    
    BEGIN
        EXECUTE 'ALTER TABLE public.' || backup_products_table || 
                ' RENAME CONSTRAINT vendor_products_vendor_id_name_key TO ' || 
                backup_products_table || '_vendor_id_name_key';
        RAISE NOTICE 'Renamed vendor_products_vendor_id_name_key to %_vendor_id_name_key on backup table', 
            backup_products_table;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error renaming vendor_products_vendor_id_name_key: %', SQLERRM;
    END;
    
    BEGIN
        EXECUTE 'ALTER TABLE public.' || backup_products_table || 
                ' RENAME CONSTRAINT vendor_products_vendor_id_fkey TO ' || 
                backup_products_table || '_vendor_id_fkey';
        RAISE NOTICE 'Renamed vendor_products_vendor_id_fkey to %_vendor_id_fkey on backup table', 
            backup_products_table;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error renaming vendor_products_vendor_id_fkey: %', SQLERRM;
    END;
END$$;

-- Step 2: Drop any remaining Foreign Key constraints that might point to the original (now backed-up) tables.
-- This is to ensure the original tables can be dropped cleanly if they weren't dropped by the RENAME.
-- The specific constraint names here are examples; replace with your actual old constraint names if different.
ALTER TABLE IF EXISTS public.contracts DROP CONSTRAINT IF EXISTS contracts_vendor_id_fkey_original;
ALTER TABLE IF EXISTS public.vendor_products_details DROP CONSTRAINT IF EXISTS vendor_products_details_product_id_fkey_original;
ALTER TABLE IF EXISTS public.contract_relationships DROP CONSTRAINT IF EXISTS contract_relationships_vendor_id_fkey_original;
ALTER TABLE IF EXISTS public.contract_users DROP CONSTRAINT IF EXISTS contract_users_product_id_fkey_original;
ALTER TABLE IF EXISTS public.vendor_products_users DROP CONSTRAINT IF EXISTS vendor_products_users_product_id_fkey_original;
-- Added for corporate_actions
ALTER TABLE IF EXISTS public.corporate_actions DROP CONSTRAINT IF EXISTS corporate_actions_primary_vendor_id_fkey_original;
ALTER TABLE IF EXISTS public.corporate_actions DROP CONSTRAINT IF EXISTS corporate_actions_secondary_vendor_id_fkey_original;

ALTER TABLE IF EXISTS public.vendor_products DROP CONSTRAINT IF EXISTS vendor_products_vendor_id_fkey;

-- Also, the FK from the *original* vendor_products (now backed up) to the *original* vendors (now backed up)
ALTER TABLE IF EXISTS public.vendor_products_original_backup_YYYYMMDD
    DROP CONSTRAINT IF EXISTS vendor_products_vendor_id_fkey_original; -- Use actual constraint name if known

-- The ALTER TABLE RENAME effectively "removes" public.vendors and public.vendor_products from their original names.
-- The names 'vendors' and 'vendor_products' are now available.

-- Step 3: Rename 'global_vendors' to 'vendors'
ALTER TABLE public.global_vendors RENAME TO vendors;

-- Step 4: Rename 'global_vendor_products' to 'vendor_products'
ALTER TABLE public.global_vendor_products RENAME TO vendor_products;

-- Step 5: Rename Primary Key (PK) and UNIQUE constraints and their associated INDEXES.
-- For the new 'vendors' table (formerly global_vendors)
ALTER TABLE public.vendors RENAME CONSTRAINT global_vendors_pkey TO vendors_pkey;
ALTER TABLE public.vendors RENAME CONSTRAINT global_vendors_name_key TO vendors_name_key; -- For UNIQUE(name)

-- For the new 'vendor_products' table (formerly global_vendor_products)
ALTER TABLE public.vendor_products RENAME CONSTRAINT global_vendor_products_pkey TO vendor_products_pkey;
ALTER TABLE public.vendor_products RENAME CONSTRAINT global_vendor_products_vendor_id_name_key TO vendor_products_vendor_id_name_key; -- For UNIQUE(vendor_id, name)

-- Step 6: Rename the FK constraint on 'vendor_products.vendor_id' (which now correctly points to 'vendors.id').
-- This constraint was created in File 1 on global_vendor_products referencing global_vendors.
-- Find the system-generated name or the explicitly defined one if applicable.
-- Example (assuming a common pattern for system-generated names):
ALTER TABLE public.vendor_products
  RENAME CONSTRAINT global_vendor_products_vendor_id_fkey TO vendor_products_vendor_id_fkey;
-- If unsure of the exact name, you can look it up (e.g., in pgAdmin or psql \d vendor_products)
-- or, more robustly, drop it if it exists and re-add it with the desired name:
-- ALTER TABLE public.vendor_products DROP CONSTRAINT IF EXISTS <actual_constraint_name_from_file1>;
-- ALTER TABLE public.vendor_products ADD CONSTRAINT vendor_products_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;


-- Step 7: Re-define Foreign Key Constraints in DEPENDENT tables to point to the NEW 'vendors' and 'vendor_products'.
-- The foreign key *values* were updated in File 4.
-- PostgreSQL automatically updates the FK's referenced table when the table is renamed.
-- This step ensures constraint *names* are consistent and constraints are definitely in place.

-- For 'contracts' table:
ALTER TABLE public.contracts
    DROP CONSTRAINT IF EXISTS contracts_vendor_id_fkey, -- Drop if one was pointing to global_vendors or an old one
    ADD CONSTRAINT contracts_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;

-- For 'vendor_products_details' table:
ALTER TABLE public.vendor_products_details
    DROP CONSTRAINT IF EXISTS vendor_products_details_product_id_fkey,
    ADD CONSTRAINT vendor_products_details_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.vendor_products(id) ON DELETE CASCADE;

-- For 'contract_relationships' table:
ALTER TABLE public.contract_relationships
    DROP CONSTRAINT IF EXISTS contract_relationships_vendor_id_fkey,
    ADD CONSTRAINT contract_relationships_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;

-- For 'contract_users' table:
ALTER TABLE public.contract_users
    DROP CONSTRAINT IF EXISTS contract_users_product_id_fkey,
    ADD CONSTRAINT contract_users_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.vendor_products(id) ON DELETE CASCADE;

-- For 'vendor_products_users' table:
ALTER TABLE public.vendor_products_users
    DROP CONSTRAINT IF EXISTS vendor_products_users_product_id_fkey,
    ADD CONSTRAINT vendor_products_users_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.vendor_products(id) ON DELETE CASCADE;

-- For 'corporate_actions' table (primary_vendor_id):
ALTER TABLE public.corporate_actions
    DROP CONSTRAINT IF EXISTS corporate_actions_primary_vendor_id_fkey,
    ADD CONSTRAINT corporate_actions_primary_vendor_id_fkey FOREIGN KEY (primary_vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;

-- For 'corporate_actions' table (secondary_vendor_id):
ALTER TABLE public.corporate_actions
    DROP CONSTRAINT IF EXISTS corporate_actions_secondary_vendor_id_fkey,
    ADD CONSTRAINT corporate_actions_secondary_vendor_id_fkey FOREIGN KEY (secondary_vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;

-- Step 8: Drop the mapping tables
DROP TABLE IF EXISTS public.map_old_product_to_global;
DROP TABLE IF EXISTS public.map_old_vendor_to_global;

COMMIT;


-- Migration File 6 (Optional): Drop Original Backup Tables
-- Ensure YYYYMMDD matches the date/version used in File 5
DROP TABLE IF EXISTS vendors_original_backup_YYYYMMDD;
DROP TABLE IF EXISTS vendor_products_original_backup_YYYYMMDD;

