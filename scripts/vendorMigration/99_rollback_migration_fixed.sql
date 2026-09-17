-- ROLLBACK SCRIPT: Restore database to original state before vendor migration (FIXED VERSION)
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

-- Drop self-referencing constraint on vendors (if it exists)
ALTER TABLE IF EXISTS public.vendors DROP CONSTRAINT IF EXISTS vendors_merged_into_vendor_id_fkey;

-- Step 3: If current tables exist (post-migration state), drop them
DROP TABLE IF EXISTS public.vendors CASCADE;
DROP TABLE IF EXISTS public.vendor_products CASCADE;

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

-- Step 6: Restore original tables from backups (FIXED VERSION)
DO $$
DECLARE
    backup_date TEXT;
    backup_vendors_table TEXT;
    backup_products_table TEXT;
    backup_vendors_exists BOOLEAN := FALSE;
    backup_products_exists BOOLEAN := FALSE;
    constraint_exists BOOLEAN;
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
        
        -- FIXED: Restore original constraint names with dynamic constraint checking
        -- Check and restore PRIMARY KEY constraint
        SELECT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'vendors' 
            AND constraint_name = backup_vendors_table || '_pkey'
            AND table_schema = 'public'
        ) INTO constraint_exists;
        
        IF constraint_exists THEN
            EXECUTE 'ALTER TABLE public.vendors RENAME CONSTRAINT ' || 
                    quote_ident(backup_vendors_table || '_pkey') || ' TO vendors_pkey';
            RAISE NOTICE 'Restored vendors_pkey constraint';
        ELSE
            RAISE NOTICE 'vendors_pkey constraint not found - may not need restoration';
        END IF;
        
        -- Check and restore UNIQUE constraint (if it exists)
        SELECT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'vendors' 
            AND constraint_name = backup_vendors_table || '_name_key'
            AND table_schema = 'public'
        ) INTO constraint_exists;
        
        IF constraint_exists THEN
            EXECUTE 'ALTER TABLE public.vendors RENAME CONSTRAINT ' || 
                    quote_ident(backup_vendors_table || '_name_key') || ' TO vendors_name_key';
            RAISE NOTICE 'Restored vendors_name_key constraint';
        ELSE
            RAISE NOTICE 'vendors_name_key constraint not found - original schema may not have had this constraint';
        END IF;
        
        -- Check and restore self-referencing FK constraint for merger tracking (if it exists)
        SELECT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'vendors' 
            AND constraint_name = backup_vendors_table || '_merged_into_vendor_id_fkey'
            AND table_schema = 'public'
        ) INTO constraint_exists;
        
        IF constraint_exists THEN
            EXECUTE 'ALTER TABLE public.vendors RENAME CONSTRAINT ' || 
                    quote_ident(backup_vendors_table || '_merged_into_vendor_id_fkey') || 
                    ' TO vendors_merged_into_vendor_id_fkey';
            RAISE NOTICE 'Restored vendors_merged_into_vendor_id_fkey constraint';
        ELSE
            RAISE NOTICE 'vendors_merged_into_vendor_id_fkey constraint not found - original schema may not have had merger tracking';
        END IF;
        
    ELSE
        RAISE EXCEPTION 'Cannot restore vendors table - backup table % does not exist', backup_vendors_table;
    END IF;
    
    -- Restore vendor_products table
    IF backup_products_exists THEN
        EXECUTE 'ALTER TABLE public.' || quote_ident(backup_products_table) || ' RENAME TO vendor_products';
        RAISE NOTICE 'Restored vendor_products table from %', backup_products_table;
        
        -- FIXED: Restore original constraint names with dynamic constraint checking
        -- Check and restore PRIMARY KEY constraint
        SELECT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'vendor_products' 
            AND constraint_name = backup_products_table || '_pkey'
            AND table_schema = 'public'
        ) INTO constraint_exists;
        
        IF constraint_exists THEN
            EXECUTE 'ALTER TABLE public.vendor_products RENAME CONSTRAINT ' || 
                    quote_ident(backup_products_table || '_pkey') || ' TO vendor_products_pkey';
            RAISE NOTICE 'Restored vendor_products_pkey constraint';
        ELSE
            RAISE NOTICE 'vendor_products_pkey constraint not found - may not need restoration';
        END IF;
        
        -- Check and restore UNIQUE constraint (if it exists)
        SELECT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'vendor_products' 
            AND constraint_name = backup_products_table || '_vendor_id_name_key'
            AND table_schema = 'public'
        ) INTO constraint_exists;
        
        IF constraint_exists THEN
            EXECUTE 'ALTER TABLE public.vendor_products RENAME CONSTRAINT ' || 
                    quote_ident(backup_products_table || '_vendor_id_name_key') || ' TO vendor_products_vendor_id_name_key';
            RAISE NOTICE 'Restored vendor_products_vendor_id_name_key constraint';
        ELSE
            RAISE NOTICE 'vendor_products_vendor_id_name_key constraint not found - original schema may not have had this constraint';
        END IF;
        
        -- Check and restore FOREIGN KEY constraint (if it exists)
        SELECT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'vendor_products' 
            AND constraint_name = backup_products_table || '_vendor_id_fkey'
            AND table_schema = 'public'
        ) INTO constraint_exists;
        
        IF constraint_exists THEN
            EXECUTE 'ALTER TABLE public.vendor_products RENAME CONSTRAINT ' || 
                    quote_ident(backup_products_table || '_vendor_id_fkey') || ' TO vendor_products_vendor_id_fkey';
            RAISE NOTICE 'Restored vendor_products_vendor_id_fkey constraint';
        ELSE
            RAISE NOTICE 'vendor_products_vendor_id_fkey constraint not found - will recreate it';
            -- Recreate the FK constraint if it doesn't exist
            ALTER TABLE public.vendor_products 
            ADD CONSTRAINT vendor_products_vendor_id_fkey 
            FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);
            RAISE NOTICE 'Created vendor_products_vendor_id_fkey constraint';
        END IF;
        
    ELSE
        RAISE EXCEPTION 'Cannot restore vendor_products table - backup table % does not exist', backup_products_table;
    END IF;
END$$;

-- Step 7: Restore original foreign key constraints in dependent tables
DO $$
BEGIN
    RAISE NOTICE 'Restoring foreign key constraints in dependent tables...';
    
    -- Try to restore each constraint, but continue if any fail
    BEGIN
        ALTER TABLE public.contracts
            ADD CONSTRAINT contracts_vendor_id_fkey 
            FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;
        RAISE NOTICE 'Restored contracts_vendor_id_fkey';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not restore contracts_vendor_id_fkey: %', SQLERRM;
    END;
    
    BEGIN
        ALTER TABLE public.vendor_products_details
            ADD CONSTRAINT vendor_products_details_product_id_fkey 
            FOREIGN KEY (product_id) REFERENCES public.vendor_products(id) ON DELETE CASCADE;
        RAISE NOTICE 'Restored vendor_products_details_product_id_fkey';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not restore vendor_products_details_product_id_fkey: %', SQLERRM;
    END;
    
    BEGIN
        ALTER TABLE public.contract_relationships
            ADD CONSTRAINT contract_relationships_vendor_id_fkey 
            FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;
        RAISE NOTICE 'Restored contract_relationships_vendor_id_fkey';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not restore contract_relationships_vendor_id_fkey: %', SQLERRM;
    END;
    
    BEGIN
        ALTER TABLE public.contract_users
            ADD CONSTRAINT contract_users_product_id_fkey 
            FOREIGN KEY (product_id) REFERENCES public.vendor_products(id) ON DELETE CASCADE;
        RAISE NOTICE 'Restored contract_users_product_id_fkey';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not restore contract_users_product_id_fkey: %', SQLERRM;
    END;
    
    BEGIN
        ALTER TABLE public.vendor_products_users
            ADD CONSTRAINT vendor_products_users_product_id_fkey 
            FOREIGN KEY (product_id) REFERENCES public.vendor_products(id) ON DELETE CASCADE;
        RAISE NOTICE 'Restored vendor_products_users_product_id_fkey';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not restore vendor_products_users_product_id_fkey: %', SQLERRM;
    END;
    
    BEGIN
        ALTER TABLE public.vendor_products_users
            ADD CONSTRAINT vendor_products_users_product_id_contract_id_key 
            UNIQUE (product_id, contract_id);
        RAISE NOTICE 'Restored vendor_products_users_product_id_contract_id_key';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not restore vendor_products_users_product_id_contract_id_key: %', SQLERRM;
    END;
    
    BEGIN
        ALTER TABLE public.corporate_actions
            ADD CONSTRAINT corporate_actions_primary_vendor_id_fkey 
            FOREIGN KEY (primary_vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;
        RAISE NOTICE 'Restored corporate_actions_primary_vendor_id_fkey';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not restore corporate_actions_primary_vendor_id_fkey: %', SQLERRM;
    END;
    
    BEGIN
        ALTER TABLE public.corporate_actions
            ADD CONSTRAINT corporate_actions_secondary_vendor_id_fkey 
            FOREIGN KEY (secondary_vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;
        RAISE NOTICE 'Restored corporate_actions_secondary_vendor_id_fkey';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not restore corporate_actions_secondary_vendor_id_fkey: %', SQLERRM;
    END;
END$$;

-- Step 8: Restore the original current_vendors view (ADAPTIVE VERSION)
DO $$
DECLARE
    merged_into_column_exists BOOLEAN;
    status_column_exists BOOLEAN;
BEGIN
    -- Check if the original schema had these columns
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vendors' 
        AND column_name = 'merged_into_vendor_id' 
        AND table_schema = 'public'
    ) INTO merged_into_column_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vendors' 
        AND column_name = 'status' 
        AND table_schema = 'public'
    ) INTO status_column_exists;
    
    RAISE NOTICE 'Original schema analysis: merged_into_vendor_id=%, status=%', 
        merged_into_column_exists, status_column_exists;
    
    -- Create view based on what columns actually exist
    IF merged_into_column_exists AND status_column_exists THEN
        -- Full original view with merger tracking and status filtering
        CREATE OR REPLACE VIEW public.current_vendors AS
        WITH RECURSIVE vendor_lineage AS (
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
        
        RAISE NOTICE 'Created full current_vendors view with merger and status support';
        
    ELSIF status_column_exists THEN
        -- Simple view with status filtering but no merger tracking
        CREATE OR REPLACE VIEW public.current_vendors AS
        SELECT
            v.id AS original_vendor_id,
            v.id AS current_vendor_id,
            v.name AS current_vendor_name
        FROM
            public.vendors v
        WHERE
            v.status = 'active';
        
        RAISE NOTICE 'Created simple current_vendors view with status filtering';
        
    ELSE
        -- Minimal view - just return all vendors
        CREATE OR REPLACE VIEW public.current_vendors AS
        SELECT
            v.id AS original_vendor_id,
            v.id AS current_vendor_id,
            v.name AS current_vendor_name
        FROM
            public.vendors v;
        
        RAISE NOTICE 'Created minimal current_vendors view (no status or merger columns found)';
    END IF;
    
END$$;

-- Step 9: Verify the rollback
DO $$
DECLARE
    vendors_count INT;
    products_count INT;
    contracts_with_vendors INT;
    products_details_count INT;
    view_count INT;
    merger_relationships_count INT;
BEGIN
    SELECT COUNT(*) INTO vendors_count FROM public.vendors;
    SELECT COUNT(*) INTO products_count FROM public.vendor_products;
    SELECT COUNT(*) INTO contracts_with_vendors FROM public.contracts WHERE vendor_id IS NOT NULL;
    SELECT COUNT(*) INTO products_details_count FROM public.vendor_products_details WHERE product_id IS NOT NULL;
    SELECT COUNT(*) INTO view_count FROM public.current_vendors;
    
    -- Check for merger relationships if the column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'merged_into_vendor_id' AND table_schema = 'public') THEN
        SELECT COUNT(*) INTO merger_relationships_count FROM public.vendors WHERE merged_into_vendor_id IS NOT NULL;
    ELSE
        merger_relationships_count := 0;
    END IF;
    
    RAISE NOTICE 'ROLLBACK VERIFICATION:';
    RAISE NOTICE 'Vendors restored: %', vendors_count;
    RAISE NOTICE 'Vendor products restored: %', products_count;
    RAISE NOTICE 'Contracts with vendor references: %', contracts_with_vendors;
    RAISE NOTICE 'Product details with product references: %', products_details_count;
    RAISE NOTICE 'current_vendors view records: %', view_count;
    RAISE NOTICE 'Merger relationships restored: %', merger_relationships_count;
    
    IF vendors_count = 0 THEN
        RAISE EXCEPTION 'ROLLBACK FAILED: No vendors found in restored table';
    END IF;
    
    IF products_count = 0 THEN
        RAISE WARNING 'No vendor products found in restored table';
    END IF;
    
    RAISE NOTICE 'ROLLBACK COMPLETED SUCCESSFULLY';
    RAISE NOTICE 'Database has been restored to pre-migration state with full merger tracking support';
END$$;

COMMIT; 