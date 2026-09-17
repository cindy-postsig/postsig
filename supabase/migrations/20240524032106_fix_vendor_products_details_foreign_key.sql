-- Drop the existing constraint if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'vendor_products_details_product_id_fkey'
    ) THEN
        ALTER TABLE "public"."vendor_products_details"
        DROP CONSTRAINT "vendor_products_details_product_id_fkey";
    END IF;
END $$;

-- Add the new constraint
ALTER TABLE "public"."vendor_products_details"
ADD CONSTRAINT "vendor_products_details_product_id_fkey"
FOREIGN KEY (product_id)
REFERENCES vendor_products(id)
ON UPDATE CASCADE
ON DELETE CASCADE
NOT VALID;

-- Validate the new constraint
ALTER TABLE "public"."vendor_products_details"
VALIDATE CONSTRAINT "vendor_products_details_product_id_fkey";
