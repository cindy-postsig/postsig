-- ROLLBACK SCRIPT: Restore database to original state before vendor migration
-- This script reverses all changes made by the vendor migration scripts
-- Run this script ONLY if you need to completely rollback the migration

BEGIN;

-- Step 0: Log the rollback attempt
DO $$
DECLARE
    backup_date TEXT;
    backup_vendors_table TEXT;
    backup_products_table TEXT;
    vendors_exists BOOLEAN := FALSE;
    products_exists BOOLEAN := FALSE;
    backup_vendors_exists BOOLEAN := FALSE;
    backup_products_exists BOOLEAN := FALSE;
    global_vendors_exists BOOLEAN := FALSE;
    global_products_exists BOOLEAN := FALSE;
BEGIN
    backup_date := to_char(current_date, 'YYYYMMDD');
    backup_vendors_table := 'vendors_original_backup_' || backup_date;
    backup_products_table := 'vendor_products_original_backup_' || backup_date;
    
    -- Check what tables exist
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendors' AND table_schema = 'public') INTO vendors_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_products' AND table_schema = 'public') INTO products_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = backup_vendors_table AND table_schema = 'public') INTO backup_vendors_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = backup_products_table AND table_schema = 'public') INTO backup_products_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_vendors' AND table_schema = 'public') INTO global_vendors_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_vendor_products' AND table_schema = 'public') INTO global_products_exists;
    
    RAISE NOTICE 'ROLLBACK ASSESSMENT:';
    RAISE NOTICE 'Current vendors table exists: %', vendors_exists;
    RAISE NOTICE 'Current vendor_products table exists: %', products_exists;
    RAISE NOTICE 'Backup vendors table (%) exists: %', backup_vendors_table, backup_vendors_exists;
    RAISE NOTICE 'Backup products table (%) exists: %', backup_products_table, backup_products_exists;
    RAISE NOTICE 'Global vendors table exists: %', global_vendors_exists;
    RAISE NOTICE 'Global products table exists: %', global_products_exists;
    
    IF NOT backup_vendors_exists AND NOT backup_products_exists THEN
        RAISE EXCEPTION 'CRITICAL: No backup tables found! Cannot safely rollback. Backup tables should be: % and %', 
            backup_vendors_table, backup_products_table;
    END IF;
    
    IF NOT backup_vendors_exists THEN
        RAISE WARNING 'Backup vendors table % not found - will not be able to restore vendors', backup_vendors_table;
    END IF;
    
    IF NOT backup_products_exists THEN
        RAISE WARNING 'Backup products table % not found - will not be able to restore vendor_products', backup_products_table;
    END IF;
END$$;

-- Step 1: Drop the current_vendors view if it exists
DROP VIEW IF EXISTS public.current_vendors;
DO $$ BEGIN RAISE NOTICE 'Dropped current_vendors view'; END $$;

-- Step 2: Remove all foreign key constraints that point to the current tables
-- We need to do this before we can drop/rename tables

-- Drop constraints from dependent tables
ALTER TABLE IF EXISTS public.contracts DROP CONSTRAINT IF EXISTS contracts_vendor_id_fkey;
ALTER TABLE IF EXISTS public.vendor_products_details DROP CONSTRAINT IF EXISTS vendor_products_details_product_id_fkey;
ALTER TABLE IF EXISTS public.contract_relationships DROP CONSTRAINT IF EXISTS contract_relationships_vendor_id_fkey;
ALTER TABLE IF EXISTS public.contract_users DROP CONSTRAINT IF EXISTS contract_users_product_id_fkey;
ALTER TABLE IF EXISTS public.vendor_products_users DROP CONSTRAINT IF EXISTS vendor_products_users_product_id_fkey;
ALTER TABLE IF EXISTS public.vendor_products_users DROP CONSTRAINT IF EXISTS vendor_products_users_product_id_contract_id_key;
ALTER TABLE IF EXISTS public.corporate_actions DROP CONSTRAINT IF EXISTS corporate_actions_primary_vendor_id_fkey;
ALTER TABLE IF EXISTS public.corporate_actions DROP CONSTRAINT IF EXISTS corporate_actions_secondary_vendor_id_fkey;

-- Drop constraint from vendor_products to vendors
ALTER TABLE IF EXISTS public.vendor_products DROP CONSTRAINT IF EXISTS vendor_products_vendor_id_fkey;

DO $$ BEGIN RAISE NOTICE 'Dropped all foreign key constraints'; END $$;

-- Step 3: If current tables exist (post-migration state), drop them
DROP TABLE IF EXISTS public.vendors CASCADE;
DROP TABLE IF EXISTS public.vendor_products CASCADE;
DO $$ BEGIN RAISE NOTICE 'Dropped current vendors and vendor_products tables'; END $$;

-- Step 4: Drop global tables if they still exist (partial migration state)
DROP TABLE IF EXISTS public.global_vendors CASCADE;
DROP TABLE IF EXISTS public.global_vendor_products CASCADE;
DO $$ BEGIN RAISE NOTICE 'Dropped global_vendors and global_vendor_products tables (if they existed)'; END $$;

-- NEW: Step 4b: Drop organization_vendor_settings table
DROP TABLE IF EXISTS public.organization_vendor_settings CASCADE;
DO $$ BEGIN RAISE NOTICE 'Dropped organization_vendor_settings table (if it existed)'; END $$;

-- Step 5: Drop mapping tables
DROP TABLE IF EXISTS public.map_old_vendor_to_global;
DROP TABLE IF EXISTS public.map_old_product_to_global;
DO $$ BEGIN RAISE NOTICE 'Dropped mapping tables'; END $$;

-- Step 6: Restore original tables from backups
DO $$
DECLARE
    backup_date TEXT;
    backup_vendors_table TEXT;
    backup_products_table TEXT;
    backup_vendors_exists BOOLEAN := FALSE;
    backup_products_exists BOOLEAN := FALSE;
BEGIN
    backup_date := to_char(current_date, 'YYYYMMDD');
    backup_vendors_table := 'vendors_original_backup_' || backup_date;
    backup_products_table := 'vendor_products_original_backup_' || backup_date;
    
    -- Check if backup tables exist
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = backup_vendors_table AND table_schema = 'public') INTO backup_vendors_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = backup_products_table AND table_schema = 'public') INTO backup_products_exists;
    
    -- Restore vendors table
    IF backup_vendors_exists THEN
        EXECUTE 'ALTER TABLE public.' || quote_ident(backup_vendors_table) || ' RENAME TO vendors';
        RAISE NOTICE 'Restored vendors table from %', backup_vendors_table;
        
        -- Restore original constraint names (if they exist)
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'vendors' AND constraint_name = 'vendors_original_backup_' || backup_date || '_pkey'
        ) THEN
            EXECUTE 'ALTER TABLE public.vendors RENAME CONSTRAINT vendors_original_backup_' || backup_date || '_pkey TO vendors_pkey';
            RAISE NOTICE 'Renamed primary key constraint for vendors table';
        ELSE
            RAISE NOTICE 'Primary key constraint for vendors table already has correct name or does not exist';
        END IF;
        
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'vendors' AND constraint_name = 'vendors_original_backup_' || backup_date || '_name_key'
        ) THEN
            EXECUTE 'ALTER TABLE public.vendors RENAME CONSTRAINT vendors_original_backup_' || backup_date || '_name_key TO vendors_name_key';
            RAISE NOTICE 'Renamed unique constraint for vendors table';
        ELSE
            RAISE NOTICE 'Unique constraint for vendors table already has correct name or does not exist';
        END IF;
    ELSE
        RAISE EXCEPTION 'Cannot restore vendors table - backup table % does not exist', backup_vendors_table;
    END IF;
    
    -- Restore vendor_products table
    IF backup_products_exists THEN
        EXECUTE 'ALTER TABLE public.' || quote_ident(backup_products_table) || ' RENAME TO vendor_products';
        RAISE NOTICE 'Restored vendor_products table from %', backup_products_table;
        
        -- Restore original constraint names (if they exist)
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'vendor_products' AND constraint_name = 'vendor_products_original_backup_' || backup_date || '_pkey'
        ) THEN
            EXECUTE 'ALTER TABLE public.vendor_products RENAME CONSTRAINT vendor_products_original_backup_' || backup_date || '_pkey TO vendor_products_pkey';
            RAISE NOTICE 'Renamed primary key constraint for vendor_products table';
        ELSE
            RAISE NOTICE 'Primary key constraint for vendor_products table already has correct name or does not exist';
        END IF;
        
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'vendor_products' AND constraint_name = 'vendor_products_original_backup_' || backup_date || '_vendor_id_name_key'
        ) THEN
            EXECUTE 'ALTER TABLE public.vendor_products RENAME CONSTRAINT vendor_products_original_backup_' || backup_date || '_vendor_id_name_key TO vendor_products_vendor_id_name_key';
            RAISE NOTICE 'Renamed unique constraint for vendor_products table';
        ELSE
            RAISE NOTICE 'Unique constraint for vendor_products table already has correct name or does not exist';
        END IF;
        
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'vendor_products' AND constraint_name = 'vendor_products_original_backup_' || backup_date || '_vendor_id_fkey'
        ) THEN
            EXECUTE 'ALTER TABLE public.vendor_products RENAME CONSTRAINT vendor_products_original_backup_' || backup_date || '_vendor_id_fkey TO vendor_products_vendor_id_fkey';
            RAISE NOTICE 'Renamed foreign key constraint for vendor_products table';
        ELSE
            RAISE NOTICE 'Foreign key constraint for vendor_products table already has correct name or does not exist';
        END IF;
    ELSE
        RAISE EXCEPTION 'Cannot restore vendor_products table - backup table % does not exist', backup_products_table;
    END IF;
END$$;

-- Step 7: Check for vendor ID mismatches and handle them
DO $$
DECLARE
    orphaned_contracts INT;
    orphaned_details INT;
    orphaned_relationships INT;
    orphaned_users INT;
    orphaned_vp_users INT;
    orphaned_actions_primary INT;
    orphaned_actions_secondary INT;
BEGIN
    -- Check for orphaned records that would prevent foreign key restoration
    SELECT COUNT(*) INTO orphaned_contracts
    FROM contracts c LEFT JOIN vendors v ON c.vendor_id = v.id
    WHERE c.vendor_id IS NOT NULL AND v.id IS NULL;
    
    SELECT COUNT(*) INTO orphaned_details
    FROM vendor_products_details vpd LEFT JOIN vendor_products vp ON vpd.product_id = vp.id
    WHERE vpd.product_id IS NOT NULL AND vp.id IS NULL;
    
    SELECT COUNT(*) INTO orphaned_relationships
    FROM contract_relationships cr LEFT JOIN vendors v ON cr.vendor_id = v.id
    WHERE cr.vendor_id IS NOT NULL AND v.id IS NULL;
    
    SELECT COUNT(*) INTO orphaned_users
    FROM contract_users cu LEFT JOIN vendor_products vp ON cu.product_id = vp.id
    WHERE cu.product_id IS NOT NULL AND vp.id IS NULL;
    
    SELECT COUNT(*) INTO orphaned_vp_users
    FROM vendor_products_users vpu LEFT JOIN vendor_products vp ON vpu.product_id = vp.id
    WHERE vpu.product_id IS NOT NULL AND vp.id IS NULL;
    
    SELECT COUNT(*) INTO orphaned_actions_primary
    FROM corporate_actions ca LEFT JOIN vendors v ON ca.primary_vendor_id = v.id
    WHERE ca.primary_vendor_id IS NOT NULL AND v.id IS NULL;
    
    SELECT COUNT(*) INTO orphaned_actions_secondary
    FROM corporate_actions ca LEFT JOIN vendors v ON ca.secondary_vendor_id = v.id
    WHERE ca.secondary_vendor_id IS NOT NULL AND v.id IS NULL;
    
    RAISE NOTICE 'ORPHANED RECORDS FOUND:';
    RAISE NOTICE '  Contracts with invalid vendor_id: %', orphaned_contracts;
    RAISE NOTICE '  Product details with invalid product_id: %', orphaned_details;
    RAISE NOTICE '  Contract relationships with invalid vendor_id: %', orphaned_relationships;
    RAISE NOTICE '  Contract users with invalid product_id: %', orphaned_users;
    RAISE NOTICE '  Vendor product users with invalid product_id: %', orphaned_vp_users;
    RAISE NOTICE '  Corporate actions with invalid primary_vendor_id: %', orphaned_actions_primary;
    RAISE NOTICE '  Corporate actions with invalid secondary_vendor_id: %', orphaned_actions_secondary;
    
    -- Clear orphaned records to allow foreign key constraint restoration
    IF orphaned_contracts > 0 THEN
        UPDATE contracts SET vendor_id = NULL 
        WHERE vendor_id NOT IN (SELECT id FROM vendors WHERE id IS NOT NULL);
        RAISE NOTICE 'Cleared % orphaned vendor_id references in contracts', orphaned_contracts;
    END IF;
    
    IF orphaned_details > 0 THEN
        DELETE FROM vendor_products_details 
        WHERE product_id NOT IN (SELECT id FROM vendor_products WHERE id IS NOT NULL);
        RAISE NOTICE 'Deleted % orphaned product detail records', orphaned_details;
    END IF;
    
    IF orphaned_relationships > 0 THEN
        UPDATE contract_relationships SET vendor_id = NULL 
        WHERE vendor_id NOT IN (SELECT id FROM vendors WHERE id IS NOT NULL);
        RAISE NOTICE 'Cleared % orphaned vendor_id references in contract_relationships', orphaned_relationships;
    END IF;
    
    IF orphaned_users > 0 THEN
        DELETE FROM contract_users 
        WHERE product_id NOT IN (SELECT id FROM vendor_products WHERE id IS NOT NULL);
        RAISE NOTICE 'Deleted % orphaned contract user records', orphaned_users;
    END IF;
    
    IF orphaned_vp_users > 0 THEN
        DELETE FROM vendor_products_users 
        WHERE product_id NOT IN (SELECT id FROM vendor_products WHERE id IS NOT NULL);
        RAISE NOTICE 'Deleted % orphaned vendor product user records', orphaned_vp_users;
    END IF;
    
    IF orphaned_actions_primary > 0 THEN
        UPDATE corporate_actions SET primary_vendor_id = NULL 
        WHERE primary_vendor_id NOT IN (SELECT id FROM vendors WHERE id IS NOT NULL);
        RAISE NOTICE 'Cleared % orphaned primary_vendor_id references in corporate_actions', orphaned_actions_primary;
    END IF;
    
    IF orphaned_actions_secondary > 0 THEN
        UPDATE corporate_actions SET secondary_vendor_id = NULL 
        WHERE secondary_vendor_id NOT IN (SELECT id FROM vendors WHERE id IS NOT NULL);
        RAISE NOTICE 'Cleared % orphaned secondary_vendor_id references in corporate_actions', orphaned_actions_secondary;
    END IF;
END$$;

-- Step 8: Restore original foreign key constraints in dependent tables

-- Contracts table
ALTER TABLE public.contracts
    ADD CONSTRAINT contracts_vendor_id_fkey 
    FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;

-- Vendor products details table  
ALTER TABLE public.vendor_products_details
    ADD CONSTRAINT vendor_products_details_product_id_fkey 
    FOREIGN KEY (product_id) REFERENCES public.vendor_products(id) ON DELETE CASCADE;

-- Contract relationships table
ALTER TABLE public.contract_relationships
    ADD CONSTRAINT contract_relationships_vendor_id_fkey 
    FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;

-- Contract users table
ALTER TABLE public.contract_users
    ADD CONSTRAINT contract_users_product_id_fkey 
    FOREIGN KEY (product_id) REFERENCES public.vendor_products(id) ON DELETE CASCADE;

-- Vendor products users table
ALTER TABLE public.vendor_products_users
    ADD CONSTRAINT vendor_products_users_product_id_fkey 
    FOREIGN KEY (product_id) REFERENCES public.vendor_products(id) ON DELETE CASCADE;

-- Restore unique constraint on vendor_products_users
ALTER TABLE public.vendor_products_users
    ADD CONSTRAINT vendor_products_users_product_id_contract_id_key 
    UNIQUE (product_id, contract_id);

-- Corporate actions table (primary vendor)
ALTER TABLE public.corporate_actions
    ADD CONSTRAINT corporate_actions_primary_vendor_id_fkey 
    FOREIGN KEY (primary_vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;

-- Corporate actions table (secondary vendor)
ALTER TABLE public.corporate_actions
    ADD CONSTRAINT corporate_actions_secondary_vendor_id_fkey 
    FOREIGN KEY (secondary_vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;

DO $$ BEGIN RAISE NOTICE 'Restored all foreign key constraints'; END $$;

-- Step 9: Restore the original current_vendors view
-- This assumes the original view definition - you may need to adjust based on your original schema
CREATE OR REPLACE VIEW public.current_vendors AS
WITH RECURSIVE vendor_lineage AS (
    -- Original view logic - this may need adjustment based on your original schema
    SELECT
        v.id AS original_vendor_id,
        COALESCE(v.merged_into_vendor_id, v.id) AS current_vendor_id,
        CASE 
            WHEN v.merged_into_vendor_id IS NOT NULL THEN merged_vendor.name
            ELSE v.name
        END AS current_vendor_name
    FROM
        public.vendors v
    LEFT JOIN
        public.vendors merged_vendor ON v.merged_into_vendor_id = merged_vendor.id
    WHERE
        v.status = 'active'

    UNION ALL

    SELECT
        vl.original_vendor_id,
        COALESCE(next_vendor.merged_into_vendor_id, vl.current_vendor_id) AS current_vendor_id,
        CASE 
            WHEN next_vendor.merged_into_vendor_id IS NOT NULL THEN final_vendor.name
            ELSE next_vendor.name
        END AS current_vendor_name
    FROM
        vendor_lineage vl
    JOIN
        public.vendors next_vendor ON vl.current_vendor_id = next_vendor.id
    LEFT JOIN
        public.vendors final_vendor ON next_vendor.merged_into_vendor_id = final_vendor.id
    WHERE
        next_vendor.merged_into_vendor_id IS NOT NULL
)
SELECT DISTINCT
    original_vendor_id,
    current_vendor_id,
    current_vendor_name
FROM
    vendor_lineage;

DO $$ BEGIN RAISE NOTICE 'Recreated original current_vendors view'; END $$;

-- Step 10: Verify the rollback
DO $$
DECLARE
    vendors_count INT;
    products_count INT;
    contracts_with_vendors INT;
    products_details_count INT;
BEGIN
    SELECT COUNT(*) INTO vendors_count FROM public.vendors;
    SELECT COUNT(*) INTO products_count FROM public.vendor_products;
    SELECT COUNT(*) INTO contracts_with_vendors FROM public.contracts WHERE vendor_id IS NOT NULL;
    SELECT COUNT(*) INTO products_details_count FROM public.vendor_products_details WHERE product_id IS NOT NULL;
    
    RAISE NOTICE 'ROLLBACK VERIFICATION:';
    RAISE NOTICE 'Vendors restored: %', vendors_count;
    RAISE NOTICE 'Vendor products restored: %', products_count;
    RAISE NOTICE 'Contracts with vendor references: %', contracts_with_vendors;
    RAISE NOTICE 'Product details with product references: %', products_details_count;
    
    IF vendors_count = 0 THEN
        RAISE EXCEPTION 'ROLLBACK FAILED: No vendors found in restored table';
    END IF;
    
    IF products_count = 0 THEN
        RAISE WARNING 'No vendor products found in restored table';
    END IF;
    
    RAISE NOTICE 'ROLLBACK COMPLETED SUCCESSFULLY';
END$$;

COMMIT; 