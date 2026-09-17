-- Add one_time_only flag to vendor_products_details
ALTER TABLE "public"."vendor_products_details"
ADD COLUMN "one_time_only" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "public"."vendor_products_details"."one_time_only" IS 'When true, this product is billed once in the first contract year and excluded from renewal terms';
