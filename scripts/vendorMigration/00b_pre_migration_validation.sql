-- PRE-MIGRATION VALIDATION: Check prerequisites before starting migration
-- Run this BEFORE starting the vendor migration to ensure everything is ready

DO $$
DECLARE
    migration_ready BOOLEAN := TRUE;
    warning_messages TEXT[] := ARRAY[]::TEXT[];
    error_messages TEXT[] := ARRAY[]::TEXT[];
    
    -- Table existence checks
    vendors_exists BOOLEAN;
    products_exists BOOLEAN;
    
    -- Data counts
    vendors_count INT;
    products_count INT;
    distinct_vendor_names INT;
    
    -- Dependency checks
    dependent_tables_exist BOOLEAN;
    
BEGIN
    RAISE NOTICE '=== PRE-MIGRATION VALIDATION ===';
    
    -- Check if original tables exist
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendors' AND table_schema = 'public') INTO vendors_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_products' AND table_schema = 'public') INTO products_exists;
    
    IF NOT vendors_exists THEN
        migration_ready := FALSE;
        error_messages := array_append(error_messages, 'Original vendors table does not exist');
    END IF;
    
    IF NOT products_exists THEN
        migration_ready := FALSE;
        error_messages := array_append(error_messages, 'Original vendor_products table does not exist');
    END IF;
    
    IF vendors_exists THEN
        SELECT COUNT(*) INTO vendors_count FROM vendors;
        SELECT COUNT(DISTINCT name) INTO distinct_vendor_names FROM vendors;
        
        RAISE NOTICE 'Original Data Analysis:';
        RAISE NOTICE '  Total vendors: %', vendors_count;
        RAISE NOTICE '  Distinct vendor names: %', distinct_vendor_names;
        RAISE NOTICE '  Consolidation potential: % vendors can be consolidated into %', vendors_count, distinct_vendor_names;
        
        IF vendors_count = 0 THEN
            migration_ready := FALSE;
            error_messages := array_append(error_messages, 'Vendors table is empty');
        END IF;
        
        IF distinct_vendor_names = 0 THEN
            migration_ready := FALSE;
            error_messages := array_append(error_messages, 'No distinct vendor names found');
        END IF;
    END IF;
    
    IF products_exists THEN
        SELECT COUNT(*) INTO products_count FROM vendor_products;
        RAISE NOTICE '  Total vendor products: %', products_count;
        
        IF products_count = 0 THEN
            warning_messages := array_append(warning_messages, 'Vendor products table is empty');
        END IF;
    END IF;
    
    -- Check if dependent tables exist
    SELECT bool_and(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t.table_name AND table_schema = 'public'))
    INTO dependent_tables_exist
    FROM (VALUES 
        ('contracts'),
        ('vendor_products_details'),
        ('contract_relationships'),
        ('contract_users'),
        ('vendor_products_users'),
        ('corporate_actions')
    ) AS t(table_name);
    
    IF NOT dependent_tables_exist THEN
        warning_messages := array_append(warning_messages, 'Some dependent tables are missing - migration may not update all references');
    END IF;
    
    -- Check if migration tables already exist (previous incomplete migration)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_vendors' AND table_schema = 'public') THEN
        migration_ready := FALSE;
        error_messages := array_append(error_messages, 'global_vendors table already exists - previous migration may be incomplete');
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_vendor_products' AND table_schema = 'public') THEN
        migration_ready := FALSE;
        error_messages := array_append(error_messages, 'global_vendor_products table already exists - previous migration may be incomplete');
    END IF;
    
    -- Final assessment
    RAISE NOTICE '';
    RAISE NOTICE '=== PRE-MIGRATION ASSESSMENT ===';
    
    IF array_length(warning_messages, 1) > 0 THEN
        RAISE NOTICE 'WARNINGS:';
        FOR i IN 1..array_length(warning_messages, 1) LOOP
            RAISE NOTICE '  ⚠️  %', warning_messages[i];
        END LOOP;
    END IF;
    
    IF array_length(error_messages, 1) > 0 THEN
        RAISE NOTICE 'ERRORS:';
        FOR i IN 1..array_length(error_messages, 1) LOOP
            RAISE NOTICE '  ❌ %', error_messages[i];
        END LOOP;
    END IF;
    
    IF migration_ready THEN
        RAISE NOTICE '✅ READY FOR MIGRATION';
        RAISE NOTICE 'All prerequisite checks passed. You can proceed with the vendor migration.';
        RAISE NOTICE 'Next step: Run 00_table_setup.sql';
    ELSE
        RAISE NOTICE '❌ NOT READY FOR MIGRATION';
        RAISE NOTICE 'Please resolve the errors above before proceeding.';
    END IF;
    
END$$; 