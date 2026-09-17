-- Validation script to verify rollback was successful
-- Run this after the rollback to ensure everything is restored correctly

DO $$
DECLARE
    -- Table existence checks
    vendors_exists BOOLEAN;
    products_exists BOOLEAN;
    global_vendors_exists BOOLEAN;
    org_settings_exists BOOLEAN;
    global_products_exists BOOLEAN;
    mapping_tables_exist BOOLEAN;
    
    -- Data counts
    vendors_count INT;
    products_count INT;
    
    -- Constraint checks
    vendors_constraints INT;
    products_constraints INT;
    dependent_constraints INT;
    
    -- View check
    view_exists BOOLEAN;
BEGIN
    RAISE NOTICE '=== ROLLBACK VALIDATION REPORT ===';
    
    -- Check table existence
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendors' AND table_schema = 'public') INTO vendors_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_products' AND table_schema = 'public') INTO products_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_vendors' AND table_schema = 'public') INTO global_vendors_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_vendor_settings' AND table_schema = 'public') INTO org_settings_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_vendor_products' AND table_schema = 'public') INTO global_products_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'map_old_vendor_to_global' AND table_schema = 'public') INTO mapping_tables_exist;
    
    RAISE NOTICE 'Table Existence:';
    RAISE NOTICE '  vendors: %', CASE WHEN vendors_exists THEN '✓ EXISTS' ELSE '✗ MISSING' END;
    RAISE NOTICE '  vendor_products: %', CASE WHEN products_exists THEN '✓ EXISTS' ELSE '✗ MISSING' END;
    RAISE NOTICE '  global_vendors: %', CASE WHEN NOT global_vendors_exists THEN '✓ REMOVED' ELSE '✗ STILL EXISTS' END;
    RAISE NOTICE '  global_vendor_products: %', CASE WHEN NOT global_products_exists THEN '✓ REMOVED' ELSE '✗ STILL EXISTS' END;
    RAISE NOTICE '  organization_vendor_settings: %', CASE WHEN NOT org_settings_exists THEN '✓ REMOVED' ELSE '✗ STILL EXISTS' END;
    RAISE NOTICE '  mapping tables: %', CASE WHEN NOT mapping_tables_exist THEN '✓ REMOVED' ELSE '✗ STILL EXISTS' END;
    
    -- Check data counts
    IF vendors_exists THEN
        SELECT COUNT(*) INTO vendors_count FROM vendors;
        RAISE NOTICE 'Data Counts:';
        RAISE NOTICE '  vendors: %', vendors_count;
    END IF;
    
    IF products_exists THEN
        SELECT COUNT(*) INTO products_count FROM vendor_products;
        RAISE NOTICE '  vendor_products: %', products_count;
    END IF;
    
    -- Check constraints
    SELECT COUNT(*) INTO vendors_constraints 
    FROM information_schema.table_constraints 
    WHERE table_name = 'vendors' AND constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY');
    
    SELECT COUNT(*) INTO products_constraints 
    FROM information_schema.table_constraints 
    WHERE table_name = 'vendor_products' AND constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY');
    
    SELECT COUNT(*) INTO dependent_constraints
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu 
        ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND ccu.table_name IN ('vendors', 'vendor_products');
    
    RAISE NOTICE 'Constraints:';
    RAISE NOTICE '  vendors table constraints: %', vendors_constraints;
    RAISE NOTICE '  vendor_products table constraints: %', products_constraints;
    RAISE NOTICE '  dependent table constraints: %', dependent_constraints;
    
    -- Check view
    SELECT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'current_vendors' AND table_schema = 'public') INTO view_exists;
    RAISE NOTICE 'Views:';
    RAISE NOTICE '  current_vendors: %', CASE WHEN view_exists THEN '✓ EXISTS' ELSE '✗ MISSING' END;
    
    -- Final assessment
    RAISE NOTICE '=== ASSESSMENT ===';
    IF vendors_exists AND products_exists AND NOT global_vendors_exists AND NOT global_products_exists AND NOT org_settings_exists THEN
        RAISE NOTICE '✓ ROLLBACK APPEARS SUCCESSFUL';
    ELSE
        RAISE NOTICE '✗ ROLLBACK MAY HAVE ISSUES - CHECK ABOVE DETAILS';
    END IF;
    
END$$; 