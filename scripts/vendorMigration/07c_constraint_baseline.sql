-- CONSTRAINT BASELINE: Define expected constraint counts for validation

DO $$
DECLARE
    -- Expected constraints (define these based on your schema)
    expected_vendors_constraints INT := 2;        -- PRIMARY KEY + UNIQUE(name)
    expected_products_constraints INT := 3;       -- PRIMARY KEY + UNIQUE(vendor_id,name) + FK(vendor_id)
    expected_org_settings_constraints INT := 3;   -- PK + FK to vendors + FK to organizations (NEW)
    expected_dependent_fk_constraints INT := 9;   -- FKs from other tables pointing to vendors/products (INCREMENTED by 1 for org_settings -> vendors FK)
    
    -- Actual constraints (from validation)
    actual_vendors_constraints INT;
    actual_products_constraints INT;
    actual_org_settings_constraints INT; -- NEW
    actual_dependent_fk_constraints INT;
    
BEGIN
    -- Get actual constraint counts
    SELECT COUNT(*) INTO actual_vendors_constraints 
    FROM information_schema.table_constraints 
    WHERE table_name = 'vendors' AND table_schema = 'public' 
    AND constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY');
    
    SELECT COUNT(*) INTO actual_products_constraints 
    FROM information_schema.table_constraints 
    WHERE table_name = 'vendor_products' AND table_schema = 'public' 
    AND constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY');
    
    -- NEW: Count constraints on organization_vendor_settings
    SELECT COUNT(*) INTO actual_org_settings_constraints 
    FROM information_schema.table_constraints 
    WHERE table_name = 'organization_vendor_settings' AND table_schema = 'public' 
    AND constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY'); -- No UNIQUE constraint expected here
    
    SELECT COUNT(*) INTO actual_dependent_fk_constraints
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu 
        ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_schema = 'public'
        AND ccu.table_name IN ('vendors', 'vendor_products');
    
    -- Validate against expected counts
    RAISE NOTICE 'CONSTRAINT VALIDATION AGAINST BASELINE:';
    RAISE NOTICE 'vendors table: % (expected %), %', 
        actual_vendors_constraints, expected_vendors_constraints,
        CASE WHEN actual_vendors_constraints = expected_vendors_constraints THEN '✓ MATCH' ELSE '✗ MISMATCH' END;
        
    RAISE NOTICE 'vendor_products table: % (expected %), %', 
        actual_products_constraints, expected_products_constraints,
        CASE WHEN actual_products_constraints = expected_products_constraints THEN '✓ MATCH' ELSE '✗ MISMATCH' END;
        
    RAISE NOTICE 'organization_vendor_settings table: % (expected %), %', -- NEW
        actual_org_settings_constraints, expected_org_settings_constraints,
        CASE WHEN actual_org_settings_constraints = expected_org_settings_constraints THEN '✓ MATCH' ELSE '✗ MISMATCH' END;
        
    RAISE NOTICE 'dependent FK constraints: % (expected %), %', 
        actual_dependent_fk_constraints, expected_dependent_fk_constraints,
        CASE WHEN actual_dependent_fk_constraints = expected_dependent_fk_constraints THEN '✓ MATCH' ELSE '✗ MISMATCH' END;
        
    -- Alert on mismatches
    IF actual_vendors_constraints != expected_vendors_constraints THEN
        RAISE WARNING 'vendors table constraint count mismatch - investigate missing/extra constraints';
    END IF;
    
    IF actual_products_constraints != expected_products_constraints THEN
        RAISE WARNING 'vendor_products table constraint count mismatch - investigate missing/extra constraints';
    END IF;
    
    -- NEW: Warning for organization_vendor_settings
    IF actual_org_settings_constraints != expected_org_settings_constraints THEN
        RAISE WARNING 'organization_vendor_settings table constraint count mismatch - investigate missing/extra constraints';
    END IF;
    
    IF actual_dependent_fk_constraints != expected_dependent_fk_constraints THEN
        RAISE WARNING 'dependent FK constraint count mismatch - some tables may not be properly linked';
    END IF;
    
END$$; 