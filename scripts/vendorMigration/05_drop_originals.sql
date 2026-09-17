-- Migration File 6 (Optional): Drop Original Backup Tables

BEGIN;

DO $$
DECLARE
    _backup_date TEXT;
    _backup_vendors_table TEXT;
    _backup_products_table TEXT;
    _fk_constraint_name_on_products_backup TEXT;
BEGIN
    _backup_date := to_char(current_date, 'YYYYMMDD');
    _backup_vendors_table := 'vendors_original_backup_' || _backup_date;
    _backup_products_table := 'vendor_products_original_backup_' || _backup_date;
    _fk_constraint_name_on_products_backup := _backup_products_table || '_vendor_id_fkey';

    RAISE NOTICE 'Preparing to drop backup tables and dependencies for date: %', _backup_date;
    RAISE NOTICE 'Target vendors backup table: %', _backup_vendors_table;
    RAISE NOTICE 'Target products backup table: %', _backup_products_table;
    RAISE NOTICE 'Target FK constraint on products backup: %', _fk_constraint_name_on_products_backup;

    -- Step 1: Drop the dependent view
    RAISE NOTICE 'Dropping view public.current_vendors...';
    EXECUTE 'DROP VIEW IF EXISTS public.current_vendors';
    RAISE NOTICE 'View public.current_vendors dropped (if it existed).';

    -- Step 2: Drop the foreign key constraint from the backup products table
    RAISE NOTICE 'Dropping FK constraint % from table % ...', _fk_constraint_name_on_products_backup, _backup_products_table;
    EXECUTE 'ALTER TABLE IF EXISTS public.' || quote_ident(_backup_products_table) ||
            ' DROP CONSTRAINT IF EXISTS ' || quote_ident(_fk_constraint_name_on_products_backup);
    RAISE NOTICE 'FK constraint % on table % dropped (if it existed).', _fk_constraint_name_on_products_backup, _backup_products_table;

    -- Step 3: Drop the backup vendors table (which was referenced by the FK)
    RAISE NOTICE 'Dropping table % ...', _backup_vendors_table;
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(_backup_vendors_table);
    RAISE NOTICE 'Table % dropped (if it existed).', _backup_vendors_table;

    -- Step 4: Drop the backup products table
    RAISE NOTICE 'Dropping table % ...', _backup_products_table;
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(_backup_products_table);
    RAISE NOTICE 'Table % dropped (if it existed).', _backup_products_table;

    RAISE NOTICE 'Finished dropping backup tables and dependencies for date: %', _backup_date;

END;
$$;

COMMIT;