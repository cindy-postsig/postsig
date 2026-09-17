-- Migration file for schema changes only
-- Creates all necessary tables and constraints

BEGIN;

-- 1. Create the new global_vendors table (intermediate name)
CREATE TABLE IF NOT EXISTS global_vendors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    address TEXT,
    email TEXT,
    phone INTEGER,
    domain TEXT,
    description TEXT,
    status public."VendorStatus",
    merged_into_vendor_id INTEGER,
    merger_effective_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE global_vendors IS 'Intermediate consolidated global vendors table.';

-- Add self-referencing foreign key constraint for merger tracking
ALTER TABLE global_vendors 
ADD CONSTRAINT global_vendors_merged_into_vendor_id_fkey 
FOREIGN KEY (merged_into_vendor_id) REFERENCES global_vendors(id) ON DELETE SET NULL;

-- Enable RLS on the global_vendors table
ALTER TABLE global_vendors ENABLE ROW LEVEL SECURITY;

-- Policies for global_vendors table
-- Allow authenticated users to view global_vendors
CREATE POLICY "Authenticated users can view global_vendors"
ON global_vendors FOR SELECT
TO authenticated
USING (true);

-- 2. Create the new global_vendor_products table (intermediate name)
CREATE TABLE IF NOT EXISTS global_vendor_products (
    id SERIAL PRIMARY KEY,
    vendor_id INTEGER NOT NULL REFERENCES global_vendors(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (vendor_id, name)
);
COMMENT ON TABLE global_vendor_products IS 'Intermediate consolidated global vendor products table.';

-- Enable RLS on the global_vendor_products table
ALTER TABLE global_vendor_products ENABLE ROW LEVEL SECURITY;

-- Policies for global_vendor_products table
CREATE POLICY "Authenticated users can view global_vendor_products"
ON global_vendor_products FOR SELECT
TO authenticated
USING (true);

-- NEW: Create the organization_vendor_settings table
CREATE TABLE IF NOT EXISTS organization_vendor_settings (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    vendor_id INTEGER NOT NULL REFERENCES global_vendors(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (organization_id, vendor_id)
);
COMMENT ON TABLE organization_vendor_settings IS 'Stores organization-specific settings/metadata for global vendors, as a JSONB object.';

-- Enable RLS on the organization_vendor_settings table
ALTER TABLE organization_vendor_settings ENABLE ROW LEVEL SECURITY;

-- Policies for organization_vendor_settings table
CREATE POLICY "Authenticated users can view org vendor settings"
ON organization_vendor_settings FOR SELECT
TO authenticated
USING (true);

-- 3. Create permanent mapping table for old 'vendors.id' to 'global_vendors.id'
CREATE TABLE IF NOT EXISTS map_old_vendor_to_global (
    old_vendor_id INTEGER PRIMARY KEY,
    global_vendor_id INTEGER NOT NULL REFERENCES global_vendors(id),
    old_vendor_name TEXT
);
COMMENT ON TABLE map_old_vendor_to_global IS 'Permanent mapping from old vendors.id to global_vendors.id.';

-- 4. Create permanent mapping table for old 'vendor_products.id' to 'global_vendor_products.id'
CREATE TABLE IF NOT EXISTS map_old_product_to_global (
    old_product_id INTEGER PRIMARY KEY,
    global_product_id INTEGER NOT NULL REFERENCES global_vendor_products(id)
);
COMMENT ON TABLE map_old_product_to_global IS 'Permanent mapping from old vendor_products.id to global_vendor_products.id.';

-- 5. Create required indexes
CREATE INDEX IF NOT EXISTS idx_map_old_vendor_global_id ON map_old_vendor_to_global (global_vendor_id);
CREATE INDEX IF NOT EXISTS idx_map_old_vendor_name ON map_old_vendor_to_global (old_vendor_name);
CREATE INDEX IF NOT EXISTS idx_map_old_product_global_id ON map_old_product_to_global(global_product_id);
CREATE INDEX IF NOT EXISTS idx_global_vendors_merged_into ON global_vendors(merged_into_vendor_id);

COMMIT;