DO $$
BEGIN
    -- Check if constraint exists
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'vendor_products_users_product_id_key'
        AND table_name = 'vendor_products_users'
    ) THEN
        -- Drop the constraint if it exists
        ALTER TABLE vendor_products_users
        DROP CONSTRAINT vendor_products_users_product_id_key;
    END IF;
END $$;

-- Add the new composite constraint (will run regardless)
-- If the constraint already exists, this will fail, so we'll check first
DO $$
BEGIN
    -- Check if the new constraint doesn't already exist
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'vendor_products_users_product_id_contract_id_key'
        AND table_name = 'vendor_products_users'
    ) THEN
        -- Add the new constraint
        ALTER TABLE vendor_products_users
        ADD CONSTRAINT vendor_products_users_product_id_contract_id_key
        UNIQUE (product_id, contract_id);
    END IF;
END $$;
