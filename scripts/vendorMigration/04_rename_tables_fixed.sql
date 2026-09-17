    -- Manual migration script 4: Rename tables and update constraints (FIXED VERSION)

    BEGIN;

    -- Step 1: Backup original tables AND rename their constraints (with dynamic constraint detection)
    DO $$
    DECLARE
        backup_date TEXT;
        backup_vendors_table TEXT;
        backup_products_table TEXT;
        constraint_exists BOOLEAN;
    BEGIN
        backup_date := to_char(current_date, 'YYYYMMDD');
        backup_vendors_table := 'vendors_original_backup_' || backup_date;
        backup_products_table := 'vendor_products_original_backup_' || backup_date;
        
        -- Step 1a: Rename original tables to backup names
        EXECUTE 'ALTER TABLE IF EXISTS public.vendors RENAME TO ' || backup_vendors_table;
        EXECUTE 'ALTER TABLE IF EXISTS public.vendor_products RENAME TO ' || backup_products_table;
        
        RAISE NOTICE 'Original tables backed up as % and %', 
            backup_vendors_table, backup_products_table;
        
        -- Step 1b: Rename constraints on backup tables to avoid conflicts (with existence checks)
        -- For vendors table constraints
        SELECT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = backup_vendors_table 
            AND constraint_name = 'vendors_pkey'
            AND table_schema = 'public'
        ) INTO constraint_exists;
        
        IF constraint_exists THEN
            EXECUTE 'ALTER TABLE public.' || quote_ident(backup_vendors_table) || 
                    ' RENAME CONSTRAINT vendors_pkey TO ' || quote_ident(backup_vendors_table || '_pkey');
            RAISE NOTICE 'Renamed vendors_pkey to %_pkey on backup table', backup_vendors_table;
        ELSE
            RAISE NOTICE 'vendors_pkey constraint not found on backup table (this may be normal)';
        END IF;
        
        SELECT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = backup_vendors_table 
            AND constraint_name = 'vendors_name_key'
            AND table_schema = 'public'
        ) INTO constraint_exists;
        
        IF constraint_exists THEN
            EXECUTE 'ALTER TABLE public.' || quote_ident(backup_vendors_table) || 
                    ' RENAME CONSTRAINT vendors_name_key TO ' || quote_ident(backup_vendors_table || '_name_key');
            RAISE NOTICE 'Renamed vendors_name_key to %_name_key on backup table', backup_vendors_table;
        ELSE
            RAISE NOTICE 'vendors_name_key constraint not found on backup table (this may be normal)';
        END IF;
        
        -- For vendor_products table constraints
        SELECT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = backup_products_table 
            AND constraint_name = 'vendor_products_pkey'
            AND table_schema = 'public'
        ) INTO constraint_exists;
        
        IF constraint_exists THEN
            EXECUTE 'ALTER TABLE public.' || quote_ident(backup_products_table) || 
                    ' RENAME CONSTRAINT vendor_products_pkey TO ' || quote_ident(backup_products_table || '_pkey');
            RAISE NOTICE 'Renamed vendor_products_pkey to %_pkey on backup table', backup_products_table;
        ELSE
            RAISE NOTICE 'vendor_products_pkey constraint not found on backup table (this may be normal)';
        END IF;
        
        SELECT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = backup_products_table 
            AND constraint_name = 'vendor_products_vendor_id_name_key'
            AND table_schema = 'public'
        ) INTO constraint_exists;
        
        IF constraint_exists THEN
            EXECUTE 'ALTER TABLE public.' || quote_ident(backup_products_table) || 
                    ' RENAME CONSTRAINT vendor_products_vendor_id_name_key TO ' || 
                    quote_ident(backup_products_table || '_vendor_id_name_key');
            RAISE NOTICE 'Renamed vendor_products_vendor_id_name_key to %_vendor_id_name_key on backup table', 
                backup_products_table;
        ELSE
            RAISE NOTICE 'vendor_products_vendor_id_name_key constraint not found on backup table (this may be normal)';
        END IF;
        
        SELECT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = backup_products_table 
            AND constraint_name = 'vendor_products_vendor_id_fkey'
            AND table_schema = 'public'
        ) INTO constraint_exists;
        
        IF constraint_exists THEN
            EXECUTE 'ALTER TABLE public.' || quote_ident(backup_products_table) || 
                    ' RENAME CONSTRAINT vendor_products_vendor_id_fkey TO ' || 
                    quote_ident(backup_products_table || '_vendor_id_fkey');
            RAISE NOTICE 'Renamed vendor_products_vendor_id_fkey to %_vendor_id_fkey on backup table', 
                backup_products_table;
        ELSE
            RAISE NOTICE 'vendor_products_vendor_id_fkey constraint not found on backup table (this may be normal)';
        END IF;
    END$$;

    -- Step 2: Drop any remaining Foreign Key constraints (these are likely non-existent, hence the notices)
    -- These steps are defensive and will skip if constraints don't exist
    ALTER TABLE IF EXISTS public.contracts DROP CONSTRAINT IF EXISTS contracts_vendor_id_fkey_original;
    ALTER TABLE IF EXISTS public.vendor_products_details DROP CONSTRAINT IF EXISTS vendor_products_details_product_id_fkey_original;
    ALTER TABLE IF EXISTS public.contract_relationships DROP CONSTRAINT IF EXISTS contract_relationships_vendor_id_fkey_original;
    ALTER TABLE IF EXISTS public.contract_users DROP CONSTRAINT IF EXISTS contract_users_product_id_fkey_original;
    ALTER TABLE IF EXISTS public.vendor_products_users DROP CONSTRAINT IF EXISTS vendor_products_users_product_id_fkey_original;
    ALTER TABLE IF EXISTS public.corporate_actions DROP CONSTRAINT IF EXISTS corporate_actions_primary_vendor_id_fkey_original;
    ALTER TABLE IF EXISTS public.corporate_actions DROP CONSTRAINT IF EXISTS corporate_actions_secondary_vendor_id_fkey_original;

    -- Step 2b: Drop FK constraint from backup products table with dynamic table name
    DO $$
    DECLARE
        backup_date TEXT;
        backup_products_table TEXT;
    BEGIN
        backup_date := to_char(current_date, 'YYYYMMDD');
        backup_products_table := 'vendor_products_original_backup_' || backup_date;
        
        -- Drop FK constraint from backup table if it exists
        EXECUTE 'ALTER TABLE IF EXISTS public.' || quote_ident(backup_products_table) ||
                ' DROP CONSTRAINT IF EXISTS ' || quote_ident(backup_products_table || '_vendor_id_fkey');
        
        RAISE NOTICE 'Attempted to drop FK constraint from backup table %', backup_products_table;
    END$$;

    -- Step 3: Rename 'global_vendors' to 'vendors'
    ALTER TABLE public.global_vendors RENAME TO vendors;

    -- Step 4: Rename 'global_vendor_products' to 'vendor_products'
    ALTER TABLE public.global_vendor_products RENAME TO vendor_products;

    -- Step 5: Rename Primary Key and UNIQUE constraints
    -- For the new 'vendors' table (formerly global_vendors)
    ALTER TABLE public.vendors RENAME CONSTRAINT global_vendors_pkey TO vendors_pkey;

    -- Check if global_vendors_name_key exists before renaming
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'vendors' 
            AND constraint_name = 'global_vendors_name_key'
            AND table_schema = 'public'
        ) THEN
            ALTER TABLE public.vendors RENAME CONSTRAINT global_vendors_name_key TO vendors_name_key;
            RAISE NOTICE 'Renamed global_vendors_name_key to vendors_name_key';
        ELSE
            RAISE NOTICE 'global_vendors_name_key constraint not found - may not exist in schema';
        END IF;
    END$$;

    -- For the new 'vendor_products' table (formerly global_vendor_products)
    ALTER TABLE public.vendor_products RENAME CONSTRAINT global_vendor_products_pkey TO vendor_products_pkey;

    -- Check if global_vendor_products_vendor_id_name_key exists before renaming
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'vendor_products' 
            AND constraint_name = 'global_vendor_products_vendor_id_name_key'
            AND table_schema = 'public'
        ) THEN
            ALTER TABLE public.vendor_products RENAME CONSTRAINT global_vendor_products_vendor_id_name_key TO vendor_products_vendor_id_name_key;
            RAISE NOTICE 'Renamed global_vendor_products_vendor_id_name_key to vendor_products_vendor_id_name_key';
        ELSE
            RAISE NOTICE 'global_vendor_products_vendor_id_name_key constraint not found - may not exist in schema';
        END IF;
    END$$;

    -- Step 6: Rename the FK constraint on 'vendor_products.vendor_id'
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'vendor_products' 
            AND constraint_name = 'global_vendor_products_vendor_id_fkey'
            AND table_schema = 'public'
        ) THEN
            ALTER TABLE public.vendor_products RENAME CONSTRAINT global_vendor_products_vendor_id_fkey TO vendor_products_vendor_id_fkey;
            RAISE NOTICE 'Renamed global_vendor_products_vendor_id_fkey to vendor_products_vendor_id_fkey';
        ELSE
            RAISE NOTICE 'global_vendor_products_vendor_id_fkey constraint not found - will recreate it';
            -- Recreate the constraint if it doesn't exist
            ALTER TABLE public.vendor_products 
            ADD CONSTRAINT vendor_products_vendor_id_fkey 
            FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;
            RAISE NOTICE 'Created vendor_products_vendor_id_fkey constraint';
        END IF;
    END$$;

    -- Step 7: Re-define Foreign Key Constraints in dependent tables
    DO $$
    BEGIN
        RAISE NOTICE 'Recreating foreign key constraints in dependent tables...';
    END$$;

    -- For 'contracts' table:
    ALTER TABLE public.contracts
        DROP CONSTRAINT IF EXISTS contracts_vendor_id_fkey;
    ALTER TABLE public.contracts
        ADD CONSTRAINT contracts_vendor_id_fkey 
        FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;

    -- For 'vendor_products_details' table:
    ALTER TABLE public.vendor_products_details
        DROP CONSTRAINT IF EXISTS vendor_products_details_product_id_fkey;
    ALTER TABLE public.vendor_products_details
        ADD CONSTRAINT vendor_products_details_product_id_fkey 
        FOREIGN KEY (product_id) REFERENCES public.vendor_products(id) ON DELETE CASCADE;

    -- For 'contract_relationships' table:
    ALTER TABLE public.contract_relationships
        DROP CONSTRAINT IF EXISTS contract_relationships_vendor_id_fkey;
    ALTER TABLE public.contract_relationships
        ADD CONSTRAINT contract_relationships_vendor_id_fkey 
        FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;

    -- For 'contract_users' table:
    ALTER TABLE public.contract_users
        DROP CONSTRAINT IF EXISTS contract_users_product_id_fkey;
    ALTER TABLE public.contract_users
        ADD CONSTRAINT contract_users_product_id_fkey 
        FOREIGN KEY (product_id) REFERENCES public.vendor_products(id) ON DELETE CASCADE;

    -- For 'vendor_products_users' table:
    ALTER TABLE public.vendor_products_users
        DROP CONSTRAINT IF EXISTS vendor_products_users_product_id_fkey;
    ALTER TABLE public.vendor_products_users
        ADD CONSTRAINT vendor_products_users_product_id_fkey 
        FOREIGN KEY (product_id) REFERENCES public.vendor_products(id) ON DELETE CASCADE;

    -- For 'corporate_actions' table (primary_vendor_id):
    ALTER TABLE public.corporate_actions
        DROP CONSTRAINT IF EXISTS corporate_actions_primary_vendor_id_fkey;
    ALTER TABLE public.corporate_actions
        ADD CONSTRAINT corporate_actions_primary_vendor_id_fkey 
        FOREIGN KEY (primary_vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;

    -- For 'corporate_actions' table (secondary_vendor_id):
    ALTER TABLE public.corporate_actions
        DROP CONSTRAINT IF EXISTS corporate_actions_secondary_vendor_id_fkey;
    ALTER TABLE public.corporate_actions
        ADD CONSTRAINT corporate_actions_secondary_vendor_id_fkey 
        FOREIGN KEY (secondary_vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;

    -- Step 8: Re-define the UNIQUE constraint on vendor_products_users (product_id, contract_id)
    ALTER TABLE public.vendor_products_users
        DROP CONSTRAINT IF EXISTS vendor_products_users_product_id_contract_id_key;
    ALTER TABLE public.vendor_products_users
        ADD CONSTRAINT vendor_products_users_product_id_contract_id_key 
        UNIQUE (product_id, contract_id);

    -- Step 9: Drop the mapping tables
    DROP TABLE IF EXISTS public.map_old_product_to_global;
    DROP TABLE IF EXISTS public.map_old_vendor_to_global;

    -- Final completion message
    DO $$
    BEGIN
        RAISE NOTICE 'Table renaming and constraint recreation completed successfully';
    END$$;

    COMMIT;