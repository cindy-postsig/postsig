-- Manual migration script 3: Update Foreign Key Values in Dependent Tables
BEGIN;

-- 1. Identify tables with foreign keys to vendors and vendor_products
DO $$
DECLARE
    fk_record RECORD;
BEGIN
    RAISE NOTICE 'Tables with foreign keys to vendors or vendor_products:';
    
    FOR fk_record IN
        SELECT tc.table_schema, tc.table_name, kcu.column_name, 
               ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name IN ('vendors', 'vendor_products')
          AND tc.table_schema = 'public'
    LOOP
        RAISE NOTICE 'Table: %, Column: %, References: %', 
            fk_record.table_name, fk_record.column_name, fk_record.foreign_table_name;
    END LOOP;
END$$;

-- 2. Log current counts before update
DO $$
DECLARE
    contracts_count INT;
    products_details_count INT;
    relationships_count INT;
    users_count INT;
    products_users_count INT;
    corp_actions_primary_count INT;
    corp_actions_secondary_count INT;
    self_referencing_count INT;
BEGIN
    SELECT COUNT(*) INTO contracts_count FROM contracts WHERE vendor_id IS NOT NULL;
    SELECT COUNT(*) INTO products_details_count FROM vendor_products_details WHERE product_id IS NOT NULL;
    SELECT COUNT(*) INTO relationships_count FROM contract_relationships WHERE vendor_id IS NOT NULL;
    SELECT COUNT(*) INTO users_count FROM contract_users WHERE product_id IS NOT NULL;
    SELECT COUNT(*) INTO products_users_count FROM vendor_products_users WHERE product_id IS NOT NULL;
    SELECT COUNT(*) INTO corp_actions_primary_count FROM corporate_actions WHERE primary_vendor_id IS NOT NULL;
    SELECT COUNT(*) INTO corp_actions_secondary_count FROM corporate_actions WHERE secondary_vendor_id IS NOT NULL;
    SELECT COUNT(*) INTO self_referencing_count FROM vendors WHERE merged_into_vendor_id IS NOT NULL;
    
    RAISE NOTICE 'Before update - Records to migrate:';
    RAISE NOTICE 'contracts.vendor_id: %', contracts_count;
    RAISE NOTICE 'vendor_products_details.product_id: %', products_details_count;
    RAISE NOTICE 'contract_relationships.vendor_id: %', relationships_count;
    RAISE NOTICE 'contract_users.product_id: %', users_count;
    RAISE NOTICE 'vendor_products_users.product_id: %', products_users_count;
    RAISE NOTICE 'corporate_actions.primary_vendor_id: %', corp_actions_primary_count;
    RAISE NOTICE 'corporate_actions.secondary_vendor_id: %', corp_actions_secondary_count;
    RAISE NOTICE 'vendors.merged_into_vendor_id (self-referencing): %', self_referencing_count;
END$$;

-- 3. Drop constraints temporarily (including self-referencing constraint)
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_vendor_id_fkey;
ALTER TABLE vendor_products_details DROP CONSTRAINT IF EXISTS vendor_products_details_product_id_fkey;
ALTER TABLE contract_relationships DROP CONSTRAINT IF EXISTS contract_relationships_vendor_id_fkey;
ALTER TABLE contract_users DROP CONSTRAINT IF EXISTS contract_users_product_id_fkey;
ALTER TABLE vendor_products_users DROP CONSTRAINT IF EXISTS vendor_products_users_product_id_fkey;
ALTER TABLE vendor_products_users DROP CONSTRAINT IF EXISTS vendor_products_users_product_id_contract_id_key;
ALTER TABLE vendor_products_details DROP CONSTRAINT IF EXISTS vendor_products_details_pkey;
ALTER TABLE corporate_actions DROP CONSTRAINT IF EXISTS corporate_actions_primary_vendor_id_fkey;
ALTER TABLE corporate_actions DROP CONSTRAINT IF EXISTS corporate_actions_secondary_vendor_id_fkey;

-- Drop self-referencing constraint on vendors table (critical for vendor ID updates)
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_merged_into_vendor_id_fkey;

-- 4. Update contracts.vendor_id to use IDs from global_vendors
UPDATE contracts c
SET vendor_id = map.global_vendor_id
FROM map_old_vendor_to_global map
WHERE c.vendor_id = map.old_vendor_id;

-- 5. Update vendor_products_details.product_id to use IDs from global_vendor_products
UPDATE vendor_products_details vpd
SET product_id = map.global_product_id
FROM map_old_product_to_global map
WHERE vpd.product_id = map.old_product_id;

-- 6. Update contract_relationships.vendor_id to use IDs from global_vendors
UPDATE contract_relationships cr
SET vendor_id = map.global_vendor_id
FROM map_old_vendor_to_global map
WHERE cr.vendor_id = map.old_vendor_id;

-- 7. Update contract_users.product_id to use IDs from global_vendor_products
UPDATE contract_users cu
SET product_id = map.global_product_id
FROM map_old_product_to_global map
WHERE cu.product_id = map.old_product_id;

-- 8. Update vendor_products_users.product_id to use IDs from global_vendor_products
UPDATE vendor_products_users vpu
SET product_id = map.global_product_id
FROM map_old_product_to_global map
WHERE vpu.product_id = map.old_product_id;

-- 9. Update corporate_actions.primary_vendor_id to use IDs from global_vendors
UPDATE corporate_actions ca
SET primary_vendor_id = map.global_vendor_id
FROM map_old_vendor_to_global map
WHERE ca.primary_vendor_id = map.old_vendor_id;

-- 10. Update corporate_actions.secondary_vendor_id to use IDs from global_vendors
UPDATE corporate_actions ca
SET secondary_vendor_id = map.global_vendor_id
FROM map_old_vendor_to_global map
WHERE ca.secondary_vendor_id = map.old_vendor_id;

-- 11. Update vendors.merged_into_vendor_id to use IDs from global_vendors (self-referencing)
-- This is critical for preserving merger relationships in the consolidated schema
DO $$
DECLARE
    merger_updates_count INT;
BEGIN
    -- Only update if the column exists (it should after our migration)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'merged_into_vendor_id' AND table_schema = 'public') THEN
        UPDATE vendors v
        SET merged_into_vendor_id = map.global_vendor_id
        FROM map_old_vendor_to_global map
        WHERE v.merged_into_vendor_id = map.old_vendor_id;
        
        GET DIAGNOSTICS merger_updates_count = ROW_COUNT;
        RAISE NOTICE 'Updated % self-referencing merger relationships', merger_updates_count;
    ELSE
        RAISE NOTICE 'No merged_into_vendor_id column found - skipping self-referencing updates';
    END IF;
END$$;

-- 12. Verify updates
DO $$
DECLARE
    contracts_found INT;
    contracts_null INT;
    contracts_unmapped INT;
    products_details_found INT;
    products_details_null INT;
    products_details_unmapped INT;
    relationships_found INT;
    relationships_null INT;
    relationships_unmapped INT;
    users_found INT;
    users_null INT;
    users_unmapped INT;
    products_users_found INT;
    products_users_null INT;
    products_users_unmapped INT;
    corp_actions_primary_found INT;
    corp_actions_primary_null INT;
    corp_actions_primary_unmapped INT;
    corp_actions_secondary_found INT;
    corp_actions_secondary_null INT;
    corp_actions_secondary_unmapped INT;
    merger_found INT;
    merger_null INT;
    merger_unmapped INT;
BEGIN
    -- Count contracts with NULL or unmapped vendor_id
    SELECT COUNT(*) INTO contracts_found FROM contracts;
    SELECT COUNT(*) INTO contracts_null FROM contracts WHERE vendor_id IS NULL;
    SELECT COUNT(*) INTO contracts_unmapped 
    FROM contracts c
    LEFT JOIN global_vendors gv ON c.vendor_id = gv.id
    WHERE c.vendor_id IS NOT NULL AND gv.id IS NULL;
    
    -- Count vendor_products_details with NULL or unmapped product_id
    SELECT COUNT(*) INTO products_details_found FROM vendor_products_details;
    SELECT COUNT(*) INTO products_details_null FROM vendor_products_details WHERE product_id IS NULL;
    SELECT COUNT(*) INTO products_details_unmapped 
    FROM vendor_products_details vpd
    LEFT JOIN global_vendor_products gvp ON vpd.product_id = gvp.id
    WHERE vpd.product_id IS NOT NULL AND gvp.id IS NULL;
    
    -- Count contract_relationships with NULL or unmapped vendor_id
    SELECT COUNT(*) INTO relationships_found FROM contract_relationships;
    SELECT COUNT(*) INTO relationships_null FROM contract_relationships WHERE vendor_id IS NULL;
    SELECT COUNT(*) INTO relationships_unmapped
    FROM contract_relationships cr
    LEFT JOIN global_vendors gv ON cr.vendor_id = gv.id
    WHERE cr.vendor_id IS NOT NULL AND gv.id IS NULL;

    -- Count contract_users with NULL or unmapped product_id
    SELECT COUNT(*) INTO users_found FROM contract_users;
    SELECT COUNT(*) INTO users_null FROM contract_users WHERE product_id IS NULL;
    SELECT COUNT(*) INTO users_unmapped
    FROM contract_users cu
    LEFT JOIN global_vendor_products gvp ON cu.product_id = gvp.id
    WHERE cu.product_id IS NOT NULL AND gvp.id IS NULL;

    -- Count vendor_products_users with NULL or unmapped product_id
    SELECT COUNT(*) INTO products_users_found FROM vendor_products_users;
    SELECT COUNT(*) INTO products_users_null FROM vendor_products_users WHERE product_id IS NULL;
    SELECT COUNT(*) INTO products_users_unmapped
    FROM vendor_products_users vpu
    LEFT JOIN global_vendor_products gvp ON vpu.product_id = gvp.id
    WHERE vpu.product_id IS NOT NULL AND gvp.id IS NULL;

    -- Count corporate_actions (primary_vendor_id) with NULL or unmapped vendor_id
    SELECT COUNT(*) INTO corp_actions_primary_found FROM corporate_actions;
    SELECT COUNT(*) INTO corp_actions_primary_null FROM corporate_actions WHERE primary_vendor_id IS NULL;
    SELECT COUNT(*) INTO corp_actions_primary_unmapped
    FROM corporate_actions ca
    LEFT JOIN global_vendors gv ON ca.primary_vendor_id = gv.id
    WHERE ca.primary_vendor_id IS NOT NULL AND gv.id IS NULL;

    -- Count corporate_actions (secondary_vendor_id) with NULL or unmapped vendor_id
    SELECT COUNT(*) INTO corp_actions_secondary_found FROM corporate_actions WHERE secondary_vendor_id IS NOT NULL;
    SELECT COUNT(*) INTO corp_actions_secondary_null FROM corporate_actions WHERE secondary_vendor_id IS NULL;
    SELECT COUNT(*) INTO corp_actions_secondary_unmapped
    FROM corporate_actions ca
    LEFT JOIN global_vendors gv ON ca.secondary_vendor_id = gv.id
    WHERE ca.secondary_vendor_id IS NOT NULL AND gv.id IS NULL;

    -- Count self-referencing merger relationships
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'merged_into_vendor_id' AND table_schema = 'public') THEN
        SELECT COUNT(*) INTO merger_found FROM vendors;
        SELECT COUNT(*) INTO merger_null FROM vendors WHERE merged_into_vendor_id IS NULL;
        SELECT COUNT(*) INTO merger_unmapped
        FROM vendors v
        LEFT JOIN global_vendors gv ON v.merged_into_vendor_id = gv.id
        WHERE v.merged_into_vendor_id IS NOT NULL AND gv.id IS NULL;
    ELSE
        merger_found := 0;
        merger_null := 0;
        merger_unmapped := 0;
    END IF;

    -- Report results
    RAISE NOTICE 'Verification results after FK updates:';
    RAISE NOTICE 'contracts: % total, % with null vendor_id, % with unmapped vendor_id', 
        contracts_found, contracts_null, contracts_unmapped;
    RAISE NOTICE 'vendor_products_details: % total, % with null product_id, % with unmapped product_id', 
        products_details_found, products_details_null, products_details_unmapped;
    RAISE NOTICE 'contract_relationships: % total, % with null vendor_id, % with unmapped vendor_id',
        relationships_found, relationships_null, relationships_unmapped;
    RAISE NOTICE 'contract_users: % total, % with null product_id, % with unmapped product_id',
        users_found, users_null, users_unmapped;
    RAISE NOTICE 'vendor_products_users: % total, % with null product_id, % with unmapped product_id',
        products_users_found, products_users_null, products_users_unmapped;
    RAISE NOTICE 'corporate_actions (primary_vendor_id): % total rows, % with null primary_vendor_id, % with unmapped primary_vendor_id',
        corp_actions_primary_found, corp_actions_primary_null, corp_actions_primary_unmapped;
    RAISE NOTICE 'corporate_actions (secondary_vendor_id): % non-null, % with null secondary_vendor_id, % with unmapped secondary_vendor_id',
        corp_actions_secondary_found, corp_actions_secondary_null, corp_actions_secondary_unmapped;
    RAISE NOTICE 'vendors (merged_into_vendor_id): % total rows, % with null merged_into_vendor_id, % with unmapped merged_into_vendor_id',
        merger_found, merger_null, merger_unmapped;
    
    -- Raise exceptions for any unmapped references
    IF contracts_unmapped > 0 THEN
        RAISE WARNING 'Found % contracts with vendor_id values that do not exist in global_vendors', contracts_unmapped;
    END IF;
    
    IF products_details_unmapped > 0 THEN
        RAISE WARNING 'Found % vendor_products_details with product_id values that do not exist in global_vendor_products', 
            products_details_unmapped;
    END IF;

    IF relationships_unmapped > 0 THEN
        RAISE WARNING 'Found % contract_relationships with vendor_id values that do not exist in global_vendors', relationships_unmapped;
    END IF;

    IF users_unmapped > 0 THEN
        RAISE WARNING 'Found % contract_users with product_id values that do not exist in global_vendor_products', users_unmapped;
    END IF;

    IF products_users_unmapped > 0 THEN
        RAISE WARNING 'Found % vendor_products_users with product_id values that do not exist in global_vendor_products', products_users_unmapped;
    END IF;

    IF corp_actions_primary_unmapped > 0 THEN
        RAISE WARNING 'Found % corporate_actions with primary_vendor_id values that do not exist in global_vendors', corp_actions_primary_unmapped;
    END IF;

    IF corp_actions_secondary_unmapped > 0 THEN
        RAISE WARNING 'Found % corporate_actions with secondary_vendor_id values that do not exist in global_vendors', corp_actions_secondary_unmapped;
    END IF;

    IF merger_unmapped > 0 THEN
        RAISE WARNING 'Found % vendors with merged_into_vendor_id values that do not exist in global_vendors', merger_unmapped;
    END IF;
END$$;

COMMIT;