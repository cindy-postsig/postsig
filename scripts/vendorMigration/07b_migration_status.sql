-- MIGRATION STATUS CHECKER: Quick status check for vendor migration (FIXED VERSION)
-- This provides a simple pass/fail status for the migration

DO $$
DECLARE
    migration_complete BOOLEAN := TRUE;
    error_messages TEXT[] := ARRAY[]::TEXT[];
    
    -- Quick checks
    vendors_exists BOOLEAN;
    products_exists BOOLEAN;
    org_settings_exists BOOLEAN;
    global_tables_exist BOOLEAN;
    mapping_tables_exist BOOLEAN;
    view_exists BOOLEAN;
    broken_fks INT;
    duplicate_vendors INT;
    
    -- Individual broken FK counts for better debugging
    broken_contracts INT;
    broken_product_details INT;
    
BEGIN
    RAISE NOTICE '=== VENDOR MIGRATION STATUS CHECK ===';
    
    -- Core table existence
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendors' AND table_schema = 'public') INTO vendors_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_products' AND table_schema = 'public') INTO products_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_vendor_settings' AND table_schema = 'public') INTO org_settings_exists;
    
    IF NOT vendors_exists OR NOT products_exists OR NOT org_settings_exists THEN
        migration_complete := FALSE;
        error_messages := array_append(error_messages, 'Core tables (vendors, vendor_products, or organization_vendor_settings) missing');
    END IF;
    
    -- Global tables should be removed
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name IN ('global_vendors', 'global_vendor_products') 
        AND table_schema = 'public'
    ) INTO global_tables_exist;
    
    IF global_tables_exist THEN
        migration_complete := FALSE;
        error_messages := array_append(error_messages, 'Temporary tables still exist');
    END IF;
    
    -- Mapping tables should be removed
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name LIKE 'map_old_%_to_global' 
        AND table_schema = 'public'
    ) INTO mapping_tables_exist;
    
    IF mapping_tables_exist THEN
        migration_complete := FALSE;
        error_messages := array_append(error_messages, 'Mapping tables still exist');
    END IF;
    
    -- View should exist
    SELECT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'current_vendors' AND table_schema = 'public') INTO view_exists;
    
    IF NOT view_exists THEN
        migration_complete := FALSE;
        error_messages := array_append(error_messages, 'current_vendors view missing');
    END IF;
    
    -- FIXED: Check for broken foreign keys with proper summing
    IF vendors_exists AND products_exists THEN
        -- Check broken contracts
        SELECT COUNT(*) INTO broken_contracts 
        FROM contracts c 
        LEFT JOIN vendors v ON c.vendor_id = v.id 
        WHERE c.vendor_id IS NOT NULL AND v.id IS NULL;
        
        -- Check broken product details
        SELECT COUNT(*) INTO broken_product_details 
        FROM vendor_products_details vpd 
        LEFT JOIN vendor_products vp ON vpd.product_id = vp.id 
        WHERE vpd.product_id IS NOT NULL AND vp.id IS NULL;
        
        -- Sum up all broken FKs
        broken_fks := broken_contracts + broken_product_details;
        
        IF broken_fks > 0 THEN
            migration_complete := FALSE;
            error_messages := array_append(error_messages, 
                'Broken foreign key references (' || broken_contracts::TEXT || 
                ' contracts, ' || broken_product_details::TEXT || ' product details)');
        END IF;
        
        -- Check for duplicate vendor names (this was correct)
        SELECT COUNT(*) INTO duplicate_vendors 
        FROM (SELECT name FROM vendors GROUP BY name HAVING COUNT(*) > 1) dupes;
        
        IF duplicate_vendors > 0 THEN
            migration_complete := FALSE;
            error_messages := array_append(error_messages, 'Duplicate vendor names found (' || duplicate_vendors::TEXT || ')');
        END IF;
    END IF;
    
    -- Report status
    IF migration_complete THEN
        RAISE NOTICE '✅ MIGRATION STATUS: COMPLETE';
        RAISE NOTICE 'All core validation checks passed.';
    ELSE
        RAISE NOTICE '❌ MIGRATION STATUS: INCOMPLETE/FAILED';
        RAISE NOTICE 'Issues detected: %', array_to_string(error_messages, ', ');
        RAISE NOTICE 'Run 07_validate_migration.sql for detailed analysis.';
    END IF;
    
    RAISE NOTICE 'Status check completed at: %', now();
    
END$$;