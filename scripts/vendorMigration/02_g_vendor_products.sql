-- Manual migration script 2: Populate global_vendor_products
BEGIN;

-- 1. Calculate the expected number of consolidated products
DO $$
DECLARE
    total_products INT;
    distinct_product_combinations INT;
BEGIN
    SELECT COUNT(*) INTO total_products FROM vendor_products;
    
    SELECT COUNT(*) INTO distinct_product_combinations 
    FROM (
        SELECT v.name AS vendor_name, vp.name AS product_name
        FROM vendor_products vp
        JOIN vendors v ON vp.vendor_id = v.id
        GROUP BY v.name, vp.name
    ) AS unique_products;
    
    RAISE NOTICE 'Original product count: %, Expected consolidated products: %', 
        total_products, distinct_product_combinations;
    
    IF distinct_product_combinations = 0 THEN
        RAISE WARNING 'No products found in original tables!';
    END IF;
END$$;

-- 2. Populate global_vendor_products
INSERT INTO global_vendor_products (vendor_id, name)
SELECT
    v_map.global_vendor_id,
    op_orig.name
FROM
    vendor_products op_orig
JOIN
    map_old_vendor_to_global v_map ON op_orig.vendor_id = v_map.old_vendor_id
GROUP BY
    v_map.global_vendor_id,
    op_orig.name;

-- 3. Verify global_vendor_products population
DO $$
DECLARE
    global_product_count INT;
    expected_count INT;
BEGIN
    SELECT COUNT(*) INTO global_product_count FROM global_vendor_products;
    
    SELECT COUNT(*) INTO expected_count 
    FROM (
        SELECT v.name AS vendor_name, vp.name AS product_name
        FROM vendor_products vp
        JOIN vendors v ON vp.vendor_id = v.id
        GROUP BY v.name, vp.name
    ) AS unique_products;
    
    RAISE NOTICE 'Populated % global vendor products (expected: %)', 
        global_product_count, expected_count;
    
    IF global_product_count = 0 AND expected_count > 0 THEN
        RAISE EXCEPTION 'Failed to populate global_vendor_products table!';
    END IF;
    
    IF global_product_count != expected_count THEN
        RAISE WARNING 'Product count mismatch: % global products created but expected %',
            global_product_count, expected_count;
    END IF;
END$$;

-- 4. Populate the product ID mapping table
INSERT INTO map_old_product_to_global (old_product_id, global_product_id)
SELECT
    op_orig.id AS old_product_id,
    gvp.id AS global_product_id
FROM
    vendor_products op_orig
JOIN
    map_old_vendor_to_global v_map ON op_orig.vendor_id = v_map.old_vendor_id
JOIN
    global_vendor_products gvp ON v_map.global_vendor_id = gvp.vendor_id AND op_orig.name = gvp.name;

-- 5. Verify product mapping table
DO $$
DECLARE
    original_product_count INT;
    mapping_count INT;
    missing_mappings INT;
BEGIN
    SELECT COUNT(*) INTO original_product_count FROM vendor_products;
    SELECT COUNT(*) INTO mapping_count FROM map_old_product_to_global;
    
    -- Check if any original products aren't in the mapping table
    SELECT COUNT(*) INTO missing_mappings 
    FROM vendor_products vp
    LEFT JOIN map_old_product_to_global m ON vp.id = m.old_product_id
    WHERE m.old_product_id IS NULL;
    
    RAISE NOTICE 'Product mapping table populated with % entries from % original products', 
        mapping_count, original_product_count;
    
    IF mapping_count != original_product_count THEN
        RAISE EXCEPTION 'Not all products were mapped! Original: %, Mapped: %, Missing: %', 
            original_product_count, mapping_count, missing_mappings;
    END IF;
END$$;

COMMIT;