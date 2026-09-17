-- DETAILED CONSTRAINT ANALYSIS: See exactly what constraints exist

DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    RAISE NOTICE 'DETAILED CONSTRAINT ANALYSIS:';
    RAISE NOTICE '============================';
    
    -- vendors table constraints
    RAISE NOTICE '';
    RAISE NOTICE 'VENDORS TABLE CONSTRAINTS:';
    FOR constraint_record IN
        SELECT constraint_name, constraint_type, column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu USING (constraint_name, table_schema)
        WHERE tc.table_name = 'vendors' AND tc.table_schema = 'public'
        ORDER BY constraint_type, constraint_name
    LOOP
        RAISE NOTICE '  % (%) on column: %', 
            constraint_record.constraint_name, 
            constraint_record.constraint_type, 
            constraint_record.column_name;
    END LOOP;
    
    -- vendor_products table constraints
    RAISE NOTICE '';
    RAISE NOTICE 'VENDOR_PRODUCTS TABLE CONSTRAINTS:';
    FOR constraint_record IN
        SELECT constraint_name, constraint_type, column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu USING (constraint_name, table_schema)
        WHERE tc.table_name = 'vendor_products' AND tc.table_schema = 'public'
        ORDER BY constraint_type, constraint_name
    LOOP
        RAISE NOTICE '  % (%) on column: %', 
            constraint_record.constraint_name, 
            constraint_record.constraint_type, 
            constraint_record.column_name;
    END LOOP;
    
    -- NEW: organization_vendor_settings table constraints
    RAISE NOTICE '';
    RAISE NOTICE 'ORGANIZATION_VENDOR_SETTINGS TABLE CONSTRAINTS:';
    FOR constraint_record IN
        SELECT constraint_name, constraint_type, column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu USING (constraint_name, table_schema)
        WHERE tc.table_name = 'organization_vendor_settings' AND tc.table_schema = 'public'
        ORDER BY constraint_type, constraint_name
    LOOP
        RAISE NOTICE '  % (%) on column: %', 
            constraint_record.constraint_name, 
            constraint_record.constraint_type, 
            constraint_record.column_name;
    END LOOP;
    
    -- Dependent FK constraints (tables that reference vendors/vendor_products)
    RAISE NOTICE '';
    RAISE NOTICE 'DEPENDENT FOREIGN KEY CONSTRAINTS:';
    FOR constraint_record IN
        SELECT tc.table_name, tc.constraint_name, kcu.column_name, ccu.table_name AS referenced_table
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu USING (constraint_name, table_schema)
        JOIN information_schema.constraint_column_usage ccu USING (constraint_name, table_schema)
        WHERE tc.constraint_type = 'FOREIGN KEY' 
            AND tc.table_schema = 'public'
            AND ccu.table_name IN ('vendors', 'vendor_products')
        ORDER BY tc.table_name, tc.constraint_name
    LOOP
        RAISE NOTICE '  %.% (%) -> %', 
            constraint_record.table_name,
            constraint_record.column_name,
            constraint_record.constraint_name, 
            constraint_record.referenced_table;
    END LOOP;
    
END$$; 