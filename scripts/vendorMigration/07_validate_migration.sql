-- MIGRATION VALIDATION SCRIPT: Verify vendor migration completed successfully
-- This script validates that the migration preserved data integrity and completed correctly
-- Run this after completing all migration scripts (01-06)

DO $$
DECLARE
    -- Table existence checks
    vendors_exists BOOLEAN;
    products_exists BOOLEAN;
    backup_vendors_exists BOOLEAN;
    backup_products_exists BOOLEAN;
    global_vendors_exists BOOLEAN;
    org_vendor_settings_exists BOOLEAN;
    global_products_exists BOOLEAN;
    mapping_tables_exist BOOLEAN;
    
    -- Schema validation for merger fields
    merged_into_column_exists BOOLEAN;
    merger_date_column_exists BOOLEAN;
    self_referencing_constraint_exists BOOLEAN;
    
    -- Data counts - current state
    current_vendors_count INT;
    current_products_count INT;
    current_contracts_with_vendors INT;
    current_product_details INT;
    current_contract_relationships INT;
    current_contract_users INT;
    current_vendor_product_users INT;
    current_corporate_actions_primary INT;
    current_corporate_actions_secondary INT;
    current_org_vendor_settings_count INT;
    
    -- Data counts - backup state (for comparison)
    backup_vendors_count INT;
    backup_products_count INT;
    backup_distinct_vendor_names INT;
    backup_distinct_product_combinations INT;
    backup_merger_relationships INT;
    
    -- Constraint validation
    vendors_constraints INT;
    products_constraints INT;
    dependent_fk_constraints INT;
    broken_fk_references INT;
    
    -- Critical constraint validation
    vendor_products_details_pkey_exists BOOLEAN;
    vendors_merger_fkey_exists BOOLEAN;
    
    -- View validation
    current_vendors_view_exists BOOLEAN;
    current_vendors_view_count INT;
    
    -- Migration-specific validations
    duplicate_vendor_names INT;
    duplicate_product_combinations INT;
    orphaned_contracts INT;
    orphaned_product_details INT;
    orphaned_org_vendor_settings_to_vendors INT;
    orphaned_org_vendor_settings_to_orgs INT;
    
    -- Merger-specific validations
    merger_relationships_count INT;
    broken_merger_references INT;
    circular_merger_references INT;
    
    -- Backup table names
    backup_date TEXT;
    backup_vendors_table TEXT;
    backup_products_table TEXT;
    
    -- Overall assessment
    validation_passed BOOLEAN := TRUE;
    
BEGIN
    backup_date := to_char(current_date, 'YYYYMMDD');
    backup_vendors_table := 'vendors_original_backup_' || backup_date;
    backup_products_table := 'vendor_products_original_backup_' || backup_date;
    
    RAISE NOTICE '=== VENDOR MIGRATION VALIDATION REPORT ===';
    RAISE NOTICE 'Validation Date: %', now();
    RAISE NOTICE 'Expected Backup Tables: %, %', backup_vendors_table, backup_products_table;
    RAISE NOTICE '';
    
    -- ============================================================================
    -- SECTION 1: TABLE EXISTENCE VALIDATION
    -- ============================================================================
    
    RAISE NOTICE '1. TABLE EXISTENCE VALIDATION';
    RAISE NOTICE '-----------------------------';
    
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendors' AND table_schema = 'public') INTO vendors_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_products' AND table_schema = 'public') INTO products_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = backup_vendors_table AND table_schema = 'public') INTO backup_vendors_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = backup_products_table AND table_schema = 'public') INTO backup_products_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_vendors' AND table_schema = 'public') INTO global_vendors_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_vendor_settings' AND table_schema = 'public') INTO org_vendor_settings_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_vendor_products' AND table_schema = 'public') INTO global_products_exists;
    
    mapping_tables_exist := (
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'map_old_vendor_to_global' AND table_schema = 'public') OR
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'map_old_product_to_global' AND table_schema = 'public')
    );
    
    RAISE NOTICE 'Current Tables:';
    RAISE NOTICE '   vendors: %', CASE WHEN vendors_exists THEN '✓ EXISTS' ELSE '✗ MISSING' END;
    RAISE NOTICE '   vendor_products: %', CASE WHEN products_exists THEN '✓ EXISTS' ELSE '✗ MISSING' END;
    RAISE NOTICE '   organization_vendor_settings: %', CASE WHEN org_vendor_settings_exists THEN '✓ EXISTS' ELSE '✗ MISSING' END;
    
    RAISE NOTICE 'Backup Tables:';
    RAISE NOTICE '   %: %', backup_vendors_table, CASE WHEN backup_vendors_exists THEN '✓ EXISTS' ELSE '✗ MISSING' END;
    RAISE NOTICE '   %: %', backup_products_table, CASE WHEN backup_products_exists THEN '✓ EXISTS' ELSE '✗ MISSING' END;
    
    RAISE NOTICE 'Migration Tables (should be removed):';
    RAISE NOTICE '   global_vendors: %', CASE WHEN global_vendors_exists THEN '✗ STILL EXISTS' ELSE '✓ REMOVED' END;
    RAISE NOTICE '   global_vendor_products: %', CASE WHEN global_products_exists THEN '✗ STILL EXISTS' ELSE '✓ REMOVED' END;
    RAISE NOTICE '   mapping tables: %', CASE WHEN mapping_tables_exist THEN '✗ STILL EXIST' ELSE '✓ REMOVED' END;
    
    IF NOT vendors_exists OR NOT products_exists OR NOT org_vendor_settings_exists THEN
        validation_passed := FALSE;
        RAISE NOTICE '❌ CRITICAL: Current tables missing!';
    END IF;
    
    IF global_vendors_exists OR global_products_exists OR mapping_tables_exist THEN
        validation_passed := FALSE;
        RAISE NOTICE '❌ WARNING: Migration tables still exist - cleanup incomplete!';
    END IF;
    
    RAISE NOTICE '';
    
    -- ============================================================================
    -- SECTION 2: SCHEMA VALIDATION (MERGER FIELDS)
    -- ============================================================================
    
    RAISE NOTICE '2. SCHEMA VALIDATION (MERGER FIELDS)';
    RAISE NOTICE '-----------------------------------';
    
    -- Check for merger columns
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vendors' 
        AND column_name = 'merged_into_vendor_id' 
        AND table_schema = 'public'
    ) INTO merged_into_column_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vendors' 
        AND column_name = 'merger_effective_date' 
        AND table_schema = 'public'
    ) INTO merger_date_column_exists;
    
    -- Check for self-referencing constraint
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = 'vendors'
          AND kcu.column_name = 'merged_into_vendor_id'
          AND ccu.table_name = 'vendors'
          AND tc.table_schema = 'public'
    ) INTO self_referencing_constraint_exists;
    
    RAISE NOTICE 'Merger Field Schema:';
    RAISE NOTICE '   merged_into_vendor_id column: %', CASE WHEN merged_into_column_exists THEN '✓ EXISTS' ELSE '✗ MISSING' END;
    RAISE NOTICE '   merger_effective_date column: %', CASE WHEN merger_date_column_exists THEN '✓ EXISTS' ELSE '✗ MISSING' END;
    RAISE NOTICE '   self-referencing FK constraint: %', CASE WHEN self_referencing_constraint_exists THEN '✓ EXISTS' ELSE '✗ MISSING' END;
    
    IF NOT merged_into_column_exists OR NOT merger_date_column_exists THEN
        validation_passed := FALSE;
        RAISE NOTICE '❌ CRITICAL: Merger fields missing from schema!';
    END IF;
    
    IF NOT self_referencing_constraint_exists THEN
        validation_passed := FALSE;
        RAISE NOTICE '❌ CRITICAL: Self-referencing constraint missing!';
    END IF;
    
    RAISE NOTICE '';
    
    -- ============================================================================
    -- SECTION 3: DATA COUNT VALIDATION
    -- ============================================================================
    
    RAISE NOTICE '3. DATA COUNT VALIDATION';
    RAISE NOTICE '------------------------';
    
    -- Current state counts
    SELECT COUNT(*) INTO current_vendors_count FROM vendors;
    SELECT COUNT(*) INTO current_products_count FROM vendor_products;
    SELECT COUNT(*) INTO current_contracts_with_vendors FROM contracts WHERE vendor_id IS NOT NULL;
    SELECT COUNT(*) INTO current_product_details FROM vendor_products_details WHERE product_id IS NOT NULL;
    SELECT COUNT(*) INTO current_contract_relationships FROM contract_relationships WHERE vendor_id IS NOT NULL;
    SELECT COUNT(*) INTO current_contract_users FROM contract_users WHERE product_id IS NOT NULL;
    SELECT COUNT(*) INTO current_vendor_product_users FROM vendor_products_users WHERE product_id IS NOT NULL;
    SELECT COUNT(*) INTO current_corporate_actions_primary FROM corporate_actions WHERE primary_vendor_id IS NOT NULL;
    SELECT COUNT(*) INTO current_corporate_actions_secondary FROM corporate_actions WHERE secondary_vendor_id IS NOT NULL;
    SELECT COUNT(*) INTO current_org_vendor_settings_count FROM organization_vendor_settings;
    
    -- Backup state counts (for comparison)
    IF backup_vendors_exists THEN
        EXECUTE 'SELECT COUNT(*) FROM ' || quote_ident(backup_vendors_table) INTO backup_vendors_count;
        EXECUTE 'SELECT COUNT(DISTINCT name) FROM ' || quote_ident(backup_vendors_table) INTO backup_distinct_vendor_names;
        
        -- Check for merger relationships in backup if the column exists
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = backup_vendors_table AND column_name = 'merged_into_vendor_id' AND table_schema = 'public') THEN
            EXECUTE 'SELECT COUNT(*) FROM ' || quote_ident(backup_vendors_table) || ' WHERE merged_into_vendor_id IS NOT NULL' INTO backup_merger_relationships;
        ELSE
            backup_merger_relationships := 0;
        END IF;
    ELSE
        backup_vendors_count := 0;
        backup_distinct_vendor_names := 0;
        backup_merger_relationships := 0;
    END IF;
    
    IF backup_products_exists THEN
        EXECUTE 'SELECT COUNT(*) FROM ' || quote_ident(backup_products_table) INTO backup_products_count;
        -- Calculate expected products based on distinct vendor_name + product_name combinations
        EXECUTE 'SELECT COUNT(*) FROM (
            SELECT DISTINCT v.name as vendor_name, vp.name as product_name
            FROM ' || quote_ident(backup_products_table) || ' vp
            JOIN ' || quote_ident(backup_vendors_table) || ' v ON vp.vendor_id = v.id
        ) AS distinct_combinations' INTO backup_distinct_product_combinations;
    ELSE
        backup_products_count := 0;
        backup_distinct_product_combinations := 0;
    END IF;
    
    RAISE NOTICE 'Vendor Consolidation:';
    RAISE NOTICE '   Original vendors: %', backup_vendors_count;
    RAISE NOTICE '   Distinct vendor names: %', backup_distinct_vendor_names;
    RAISE NOTICE '   Current vendors: %', current_vendors_count;
    
    IF backup_vendors_count > 0 THEN
        RAISE NOTICE '   Consolidation ratio: %.2f%%', 
            ROUND(((backup_vendors_count - current_vendors_count)::DECIMAL / backup_vendors_count * 100), 2);
    END IF;
    
    -- Check for duplicate vendor names (should be 0)
    SELECT COUNT(*) FROM (
        SELECT name FROM vendors GROUP BY name HAVING COUNT(*) > 1
    ) duplicates INTO duplicate_vendor_names;
    
    RAISE NOTICE '   Duplicate vendor names in current: %', 
        CASE WHEN duplicate_vendor_names = 0 THEN '✓ NONE' ELSE duplicate_vendor_names::TEXT END;
    
    RAISE NOTICE 'Product Consolidation:';
    RAISE NOTICE '   Original products: %', backup_products_count;
    RAISE NOTICE '   Expected consolidated products: %', backup_distinct_product_combinations;
    RAISE NOTICE '   Current products: %', current_products_count;
    RAISE NOTICE '   Consolidation success: %', 
        CASE WHEN current_products_count = backup_distinct_product_combinations THEN '✓ MATCH' 
             ELSE '✗ MISMATCH' END;
    
    -- Check for duplicate product combinations (should be 0)
    SELECT COUNT(*) FROM (
        SELECT vendor_id, name FROM vendor_products GROUP BY vendor_id, name HAVING COUNT(*) > 1
    ) duplicates INTO duplicate_product_combinations;
    
    RAISE NOTICE '   Duplicate product combinations in current: %', duplicate_product_combinations;
    
    RAISE NOTICE 'Merger Relationships:';
    SELECT COUNT(*) INTO merger_relationships_count FROM vendors WHERE merged_into_vendor_id IS NOT NULL;
    RAISE NOTICE '   Original merger relationships: %', backup_merger_relationships;
    RAISE NOTICE '   Current merger relationships: %', merger_relationships_count;
    RAISE NOTICE '   Merger preservation: %', 
        CASE WHEN merger_relationships_count = backup_merger_relationships THEN '✓ PRESERVED' 
             ELSE '⚠ CHANGED/NOT APPLICABLE' END;
    
    RAISE NOTICE 'Organization Vendor Settings:';
    RAISE NOTICE '   organization_vendor_settings records: %', current_org_vendor_settings_count;
    
    RAISE NOTICE '';
    
    -- ============================================================================
    -- SECTION 4: FOREIGN KEY INTEGRITY VALIDATION
    -- ============================================================================
    
    RAISE NOTICE '4. FOREIGN KEY INTEGRITY VALIDATION';
    RAISE NOTICE '-----------------------------------';
    
    RAISE NOTICE 'Dependent Table Records:';
    RAISE NOTICE '   contracts with vendor_id: %', current_contracts_with_vendors;
    RAISE NOTICE '   vendor_products_details with product_id: %', current_product_details;
    RAISE NOTICE '   contract_relationships with vendor_id: %', current_contract_relationships;
    RAISE NOTICE '   contract_users with product_id: %', current_contract_users;
    RAISE NOTICE '   vendor_products_users with product_id: %', current_vendor_product_users;
    RAISE NOTICE '   corporate_actions with primary_vendor_id: %', current_corporate_actions_primary;
    RAISE NOTICE '   corporate_actions with secondary_vendor_id: %', current_corporate_actions_secondary;
    
    -- Check for broken foreign key references
    SELECT (
        (SELECT COUNT(*) FROM contracts c 
         LEFT JOIN vendors v ON c.vendor_id = v.id 
         WHERE c.vendor_id IS NOT NULL AND v.id IS NULL) +
        
        (SELECT COUNT(*) FROM vendor_products_details vpd 
         LEFT JOIN vendor_products vp ON vpd.product_id = vp.id 
         WHERE vpd.product_id IS NOT NULL AND vp.id IS NULL) +
        
        (SELECT COUNT(*) FROM contract_relationships cr 
         LEFT JOIN vendors v ON cr.vendor_id = v.id 
         WHERE cr.vendor_id IS NOT NULL AND v.id IS NULL) +
        
        (SELECT COUNT(*) FROM contract_users cu 
         LEFT JOIN vendor_products vp ON cu.product_id = vp.id 
         WHERE cu.product_id IS NOT NULL AND vp.id IS NULL) +
        
        (SELECT COUNT(*) FROM vendor_products_users vpu 
         LEFT JOIN vendor_products vp ON vpu.product_id = vp.id 
         WHERE vpu.product_id IS NOT NULL AND vp.id IS NULL) +
        
        (SELECT COUNT(*) FROM corporate_actions ca 
         LEFT JOIN vendors v ON ca.primary_vendor_id = v.id 
         WHERE ca.primary_vendor_id IS NOT NULL AND v.id IS NULL) +
        
        (SELECT COUNT(*) FROM corporate_actions ca 
         LEFT JOIN vendors v ON ca.secondary_vendor_id = v.id 
         WHERE ca.secondary_vendor_id IS NOT NULL AND v.id IS NULL)
    ) INTO broken_fk_references;
    
    -- New: Check broken FKs for organization_vendor_settings
    SELECT COUNT(*) INTO orphaned_org_vendor_settings_to_vendors
    FROM organization_vendor_settings ovs LEFT JOIN vendors v ON ovs.vendor_id = v.id
    WHERE v.id IS NULL;
    SELECT COUNT(*) INTO orphaned_org_vendor_settings_to_orgs
    FROM organization_vendor_settings ovs LEFT JOIN organizations o ON ovs.organization_id = o.id
    WHERE o.id IS NULL;
    
    -- Check for broken merger references (self-referencing)
    SELECT COUNT(*) INTO broken_merger_references
    FROM vendors v
    LEFT JOIN vendors v_target ON v.merged_into_vendor_id = v_target.id
    WHERE v.merged_into_vendor_id IS NOT NULL AND v_target.id IS NULL;
    
    -- Check for circular merger references (vendors that reference themselves in the chain)
    WITH RECURSIVE merger_chain AS (
        SELECT id, merged_into_vendor_id, name, 1 as depth, ARRAY[id] as path
        FROM vendors
        WHERE merged_into_vendor_id IS NOT NULL
        
        UNION ALL
        
        SELECT mc.id, v.merged_into_vendor_id, mc.name, mc.depth + 1, mc.path || v.id
        FROM merger_chain mc
        JOIN vendors v ON mc.merged_into_vendor_id = v.id
        WHERE v.merged_into_vendor_id IS NOT NULL 
        AND mc.depth < 10  -- Prevent infinite recursion
        AND NOT (v.id = ANY(mc.path))  -- Detect cycles
    )
    SELECT COUNT(DISTINCT mc.id) INTO circular_merger_references
    FROM merger_chain mc
    JOIN vendors v ON mc.merged_into_vendor_id = v.id
    WHERE v.id = ANY(mc.path);
    
    RAISE NOTICE 'Foreign Key Integrity:';
    RAISE NOTICE '   Broken FK references: %', 
        CASE WHEN broken_fk_references = 0 THEN '✓ NONE' ELSE broken_fk_references::TEXT END;
    RAISE NOTICE '   Broken merger references: %', 
        CASE WHEN broken_merger_references = 0 THEN '✓ NONE' ELSE broken_merger_references::TEXT END;
    RAISE NOTICE '   Circular merger references: %', 
        CASE WHEN circular_merger_references = 0 THEN '✓ NONE' ELSE circular_merger_references::TEXT END;
    RAISE NOTICE '   Orphaned organization_vendor_settings (to vendors): %', 
        CASE WHEN orphaned_org_vendor_settings_to_vendors = 0 THEN '✓ NONE' ELSE orphaned_org_vendor_settings_to_vendors::TEXT END;
    RAISE NOTICE '   Orphaned organization_vendor_settings (to organizations): %', 
        CASE WHEN orphaned_org_vendor_settings_to_orgs = 0 THEN '✓ NONE' ELSE orphaned_org_vendor_settings_to_orgs::TEXT END;
    
    IF broken_fk_references > 0 OR broken_merger_references > 0 OR circular_merger_references > 0 OR orphaned_org_vendor_settings_to_vendors > 0 OR orphaned_org_vendor_settings_to_orgs > 0 THEN
        validation_passed := FALSE;
    END IF;
    
    RAISE NOTICE '';
    
    -- ============================================================================
    -- SECTION 5: CONSTRAINT VALIDATION
    -- ============================================================================
    
    RAISE NOTICE '5. CONSTRAINT VALIDATION';
    RAISE NOTICE '------------------------';
    
    SELECT COUNT(*) INTO vendors_constraints
    FROM information_schema.table_constraints
    WHERE table_name = 'vendors' AND table_schema = 'public';
    
    SELECT COUNT(*) INTO products_constraints
    FROM information_schema.table_constraints
    WHERE table_name = 'vendor_products' AND table_schema = 'public';
    
    SELECT COUNT(*) INTO dependent_fk_constraints
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name IN ('vendors', 'vendor_products')
      AND tc.table_schema = 'public';
    
    RAISE NOTICE 'Constraint Counts:';
    RAISE NOTICE '   vendors table constraints: %', vendors_constraints;
    RAISE NOTICE '   vendor_products table constraints: %', products_constraints;
    RAISE NOTICE '   dependent FK constraints: %', dependent_fk_constraints;
    
    -- ============================================================================
    -- CRITICAL CONSTRAINT VALIDATION
    -- ============================================================================
    
    RAISE NOTICE '';
    RAISE NOTICE 'Critical Constraint Validation:';
    
    -- Check for vendor_products_details primary key
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'vendor_products_details' 
        AND constraint_name = 'vendor_products_details_pkey'
        AND constraint_type = 'PRIMARY KEY'
        AND table_schema = 'public'
    ) INTO vendor_products_details_pkey_exists;
    
    -- Check for vendors self-referencing foreign key
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'vendors' 
        AND constraint_name = 'vendors_merged_into_vendor_id_fkey'
        AND constraint_type = 'FOREIGN KEY'
        AND table_schema = 'public'
    ) INTO vendors_merger_fkey_exists;
    
    RAISE NOTICE '   vendor_products_details_pkey: %', 
        CASE WHEN vendor_products_details_pkey_exists THEN '✓ EXISTS' ELSE '✗ MISSING' END;
    RAISE NOTICE '   vendors_merged_into_vendor_id_fkey: %', 
        CASE WHEN vendors_merger_fkey_exists THEN '✓ EXISTS' ELSE '✗ MISSING' END;
    
    IF NOT vendor_products_details_pkey_exists OR NOT vendors_merger_fkey_exists THEN
        validation_passed := FALSE;
        RAISE NOTICE '❌ CRITICAL: Essential constraints are missing!';
        
        IF NOT vendor_products_details_pkey_exists THEN
            RAISE NOTICE '    Missing: vendor_products_details table PRIMARY KEY constraint';
            RAISE NOTICE '    Impact: Table lacks primary key, violating database best practices';
        END IF;
        
        IF NOT vendors_merger_fkey_exists THEN
            RAISE NOTICE '    Missing: vendors self-referencing foreign key for merger tracking';
            RAISE NOTICE '    Impact: Merger relationships not properly constrained';
        END IF;
    END IF;
    
    RAISE NOTICE '';
    
    -- ============================================================================
    -- SECTION 6: VIEW VALIDATION
    -- ============================================================================
    
    RAISE NOTICE '6. VIEW VALIDATION';
    RAISE NOTICE '-----------------';
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_name = 'current_vendors' AND table_schema = 'public'
    ) INTO current_vendors_view_exists;
    
    IF current_vendors_view_exists THEN
        SELECT COUNT(*) INTO current_vendors_view_count FROM current_vendors;
        RAISE NOTICE 'current_vendors view: ✓ EXISTS (% records)', current_vendors_view_count;
    ELSE
        current_vendors_view_count := 0;
        RAISE NOTICE 'current_vendors view: ✗ MISSING';
        validation_passed := FALSE;
    END IF;
    
    RAISE NOTICE '';
    
    -- ============================================================================
    -- SECTION 7: DATA QUALITY VALIDATION
    -- ============================================================================
    
    RAISE NOTICE '7. DATA QUALITY VALIDATION';
    RAISE NOTICE '--------------------------';
    
    -- Check for orphaned records
    SELECT COUNT(*) INTO orphaned_contracts
    FROM contracts c
    LEFT JOIN vendors v ON c.vendor_id = v.id
    WHERE c.vendor_id IS NOT NULL AND v.id IS NULL;
    
    SELECT COUNT(*) INTO orphaned_product_details
    FROM vendor_products_details vpd
    LEFT JOIN vendor_products vp ON vpd.product_id = vp.id
    WHERE vpd.product_id IS NOT NULL AND vp.id IS NULL;
    
    RAISE NOTICE 'Data Quality:';
    RAISE NOTICE '   Orphaned contracts: %', 
        CASE WHEN orphaned_contracts = 0 THEN '✓ NONE' ELSE orphaned_contracts::TEXT END;
    RAISE NOTICE '   Orphaned product details: %', 
        CASE WHEN orphaned_product_details = 0 THEN '✓ NONE' ELSE orphaned_product_details::TEXT END;
    RAISE NOTICE '   Orphaned org_vendor_settings (to vendors): %', 
        CASE WHEN orphaned_org_vendor_settings_to_vendors = 0 THEN '✓ NONE' ELSE orphaned_org_vendor_settings_to_vendors::TEXT END;
    RAISE NOTICE '   Orphaned org_vendor_settings (to organizations): %', 
        CASE WHEN orphaned_org_vendor_settings_to_orgs = 0 THEN '✓ NONE' ELSE orphaned_org_vendor_settings_to_orgs::TEXT END;
    
    IF current_org_vendor_settings_count = 0 AND backup_vendors_count > 0 THEN 
        RAISE WARNING 'organization_vendor_settings is empty but there were vendors. Check if population script ran correctly or if user/org links are missing.';
    END IF;
    
    IF orphaned_contracts > 0 OR orphaned_product_details > 0 OR orphaned_org_vendor_settings_to_vendors > 0 OR orphaned_org_vendor_settings_to_orgs > 0 THEN
        validation_passed := FALSE;
    END IF;
    
    RAISE NOTICE '';
    
    -- ============================================================================
    -- SECTION 8: OVERALL MIGRATION ASSESSMENT
    -- ============================================================================
    
    RAISE NOTICE '8. OVERALL MIGRATION ASSESSMENT';
    RAISE NOTICE '===============================';
    
    IF validation_passed THEN
        RAISE NOTICE '✅ MIGRATION SUCCESSFUL';
        RAISE NOTICE 'All validation checks passed. The vendor migration completed successfully.';
        RAISE NOTICE 'Merger tracking functionality is fully operational.';
    ELSE
        RAISE NOTICE '❌ MIGRATION ISSUES DETECTED';
        RAISE NOTICE 'One or more validation checks failed. Review the details above.';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE 'Validation completed at: %', now();
    
END$$;