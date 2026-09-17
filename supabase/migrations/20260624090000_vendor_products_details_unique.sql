-- Restore unique constraint on vendor_products_details(product_id, contract_id, year)

-- Step 1: Remove duplicate rows, keeping the one with the highest id per group
DELETE FROM public.vendor_products_details
WHERE id NOT IN (
    SELECT MAX(id)
    FROM public.vendor_products_details
    GROUP BY product_id, contract_id, year
);

-- Step 2: Create unique index on the natural key if one does not already exist
CREATE UNIQUE INDEX IF NOT EXISTS vendor_products_details_product_contract_year_unique
    ON public.vendor_products_details (product_id, contract_id, year);