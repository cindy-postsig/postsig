-- Manual migration script 1: Populate global_vendors
BEGIN;

-- 1. Calculate the expected number of consolidated vendors for verification
DO $$
DECLARE
    total_vendors INT;
    distinct_vendor_names INT;
    vendors_with_merger_data INT;
BEGIN
    SELECT COUNT(*) INTO total_vendors FROM vendors;
    SELECT COUNT(DISTINCT name) INTO distinct_vendor_names FROM vendors;
    
    -- Check if merger data exists in original schema
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'merged_into_vendor_id' AND table_schema = 'public') THEN
        SELECT COUNT(*) INTO vendors_with_merger_data FROM vendors WHERE merged_into_vendor_id IS NOT NULL;
        RAISE NOTICE 'Original vendor count: %, Distinct vendor names: %, Vendors with merger data: %', 
            total_vendors, distinct_vendor_names, vendors_with_merger_data;
    ELSE
        RAISE NOTICE 'Original vendor count: %, Distinct vendor names: %, No merger fields in original schema', 
            total_vendors, distinct_vendor_names;
        vendors_with_merger_data := 0;
    END IF;
    
    RAISE NOTICE 'Expected consolidation: % vendors will become % global vendors', total_vendors, distinct_vendor_names;
    
    IF distinct_vendor_names = 0 THEN
        RAISE EXCEPTION 'No vendor names found in original table!';
    END IF;
END$$;

-- 2. Populate global_vendors with consolidated data from original 'vendors'
DO $$
BEGIN
    -- Check if merger fields exist in original schema and handle accordingly
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'merged_into_vendor_id' AND table_schema = 'public') THEN
        -- Original schema has merger fields - preserve merger data during consolidation
        RAISE NOTICE 'Original schema has merger fields - preserving merger data during consolidation';
        
        INSERT INTO global_vendors (
            name, domain, address, email, phone, description, status,
            merged_into_vendor_id, merger_effective_date
        )
        SELECT
            v_orig.name,
            MIN(v_orig.domain) AS domain,
            MIN(v_orig.address) AS address,
            MIN(v_orig.email) AS email,
            MIN(v_orig.phone) AS phone,
            MIN(v_orig.description) AS description,
            MIN(v_orig.status::text)::public."VendorStatus" AS status,
            NULL AS merged_into_vendor_id,
            MIN(v_orig.merger_effective_date) AS merger_effective_date
        FROM vendors v_orig
        GROUP BY v_orig.name;
        
    ELSE
        -- Original schema doesn't have merger fields - standard consolidation
        RAISE NOTICE 'Original schema has no merger fields - standard consolidation';
        
        INSERT INTO global_vendors (
            name, domain, address, email, phone, description, status,
            merged_into_vendor_id, merger_effective_date
        )
        SELECT
            v_orig.name,
            MIN(v_orig.domain) AS domain,
            MIN(v_orig.address) AS address,
            MIN(v_orig.email) AS email,
            MIN(v_orig.phone) AS phone,
            MIN(v_orig.description) AS description,
            MIN(v_orig.status::text)::public."VendorStatus" AS status,
            NULL AS merged_into_vendor_id,
            NULL AS merger_effective_date
        FROM vendors v_orig
        GROUP BY v_orig.name;
    END IF;
END$$;

-- 3. Handle merger relationships if they existed in the original schema
DO $$
DECLARE
    merger_updates_count INT := 0;
    original_merger_record RECORD;
BEGIN
    -- Only process merger relationships if they existed in original schema
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'merged_into_vendor_id' AND table_schema = 'public') THEN
        RAISE NOTICE 'Processing merger relationships from original schema...';
        
        -- Iterate through vendors that had merger relationships
        FOR original_merger_record IN 
            SELECT DISTINCT 
                v_merged.name as merged_vendor_name,
                v_target.name as target_vendor_name,
                v_merged.merger_effective_date
            FROM vendors v_merged 
            JOIN vendors v_target ON v_merged.merged_into_vendor_id = v_target.id
            WHERE v_merged.merged_into_vendor_id IS NOT NULL
        LOOP
            -- Update the global vendor to point to the consolidated target vendor
            UPDATE global_vendors gv_merged
            SET 
                merged_into_vendor_id = gv_target.id,
                merger_effective_date = original_merger_record.merger_effective_date
            FROM global_vendors gv_target
            WHERE gv_merged.name = original_merger_record.merged_vendor_name
            AND gv_target.name = original_merger_record.target_vendor_name;
            
            GET DIAGNOSTICS merger_updates_count = ROW_COUNT;
            
            IF merger_updates_count > 0 THEN
                RAISE NOTICE 'Updated merger relationship: % -> %', 
                    original_merger_record.merged_vendor_name, 
                    original_merger_record.target_vendor_name;
            END IF;
        END LOOP;
        
        RAISE NOTICE 'Completed processing merger relationships';
    ELSE
        RAISE NOTICE 'No merger relationships to process (original schema had no merger fields)';
    END IF;
END$$;

-- 4. Verify global_vendors population
DO $$
DECLARE
    global_count INT;
    distinct_vendor_names INT;
    merger_relationships_count INT;
BEGIN
    SELECT COUNT(*) INTO global_count FROM global_vendors;
    SELECT COUNT(DISTINCT name) INTO distinct_vendor_names FROM vendors;
    SELECT COUNT(*) INTO merger_relationships_count FROM global_vendors WHERE merged_into_vendor_id IS NOT NULL;
    
    RAISE NOTICE 'Populated % global vendors from % distinct vendor names', global_count, distinct_vendor_names;
    RAISE NOTICE 'Preserved % merger relationships', merger_relationships_count;
    
    IF global_count = 0 THEN
        RAISE EXCEPTION 'Failed to populate global_vendors table!';
    END IF;
    
    IF global_count != distinct_vendor_names THEN
        RAISE WARNING 'Unexpected count mismatch: % global vendors created but expected % (distinct vendor names)',
            global_count, distinct_vendor_names;
    END IF;
END$$;

-- 5. Populate the vendor ID mapping table (map_old_vendor_to_global)
INSERT INTO map_old_vendor_to_global (old_vendor_id, global_vendor_id, old_vendor_name)
SELECT
    v_orig.id AS old_vendor_id,
    gv.id AS global_vendor_id,
    v_orig.name AS old_vendor_name
FROM vendors v_orig
JOIN global_vendors gv ON v_orig.name = gv.name;

-- 6. Verify mapping table population
DO $$
DECLARE
    original_count INT;
    mapping_count INT;
    missing_mappings INT;
BEGIN
    SELECT COUNT(*) INTO original_count FROM vendors;
    SELECT COUNT(*) INTO mapping_count FROM map_old_vendor_to_global;
    
    -- Check if any original vendors aren't in the mapping table
    SELECT COUNT(*) INTO missing_mappings 
    FROM vendors v
    LEFT JOIN map_old_vendor_to_global m ON v.id = m.old_vendor_id
    WHERE m.old_vendor_id IS NULL;
    
    RAISE NOTICE 'Mapping table populated with % entries from % original vendors', mapping_count, original_count;
    
    IF mapping_count != original_count THEN
        RAISE EXCEPTION 'Not all vendors were mapped! Original: %, Mapped: %, Missing: %', 
            original_count, mapping_count, missing_mappings;
    END IF;
END$$;

COMMIT;