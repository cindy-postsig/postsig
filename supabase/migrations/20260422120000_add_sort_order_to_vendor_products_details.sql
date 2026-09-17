-- Add sort_order column to vendor_products_details for controlling product display order
ALTER TABLE "public"."vendor_products_details"
ADD COLUMN "sort_order" integer DEFAULT NULL;

-- Index for efficient ordering within a contract
CREATE INDEX idx_vendor_products_details_contract_sort_order
  ON "public"."vendor_products_details" (contract_id, sort_order NULLS LAST);
