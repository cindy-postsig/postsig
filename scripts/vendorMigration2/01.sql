-- Migration File 1: Setup New Global Tables & Mapping Tables

-- 1. Create the new global_vendors table (intermediate name)
CREATE TABLE global_vendors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE, -- This will be vendors_name_key after rename
    address TEXT,
    email TEXT,
    phone INTEGER,
    domain TEXT,
    description TEXT,
    ict_provider BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE global_vendors IS 'Intermediate consolidated global vendors table.';

-- 2. Create the new global_vendor_products table (intermediate name)
CREATE TABLE global_vendor_products (
    id SERIAL PRIMARY KEY,
    vendor_id INTEGER NOT NULL REFERENCES global_vendors(id) ON DELETE CASCADE, -- FK to global_vendors, name will be like global_vendor_products_vendor_id_fkey
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (vendor_id, name) -- This will be vendor_products_vendor_id_name_key after rename
);
COMMENT ON TABLE global_vendor_products IS 'Intermediate consolidated global vendor products table.';

-- 3. Create permanent mapping table for old 'vendors.id' to 'global_vendors.id'
CREATE TABLE map_old_vendor_to_global (
    old_vendor_id INTEGER PRIMARY KEY,
    global_vendor_id INTEGER NOT NULL REFERENCES global_vendors(id),
    old_vendor_name TEXT
);
COMMENT ON TABLE map_old_vendor_to_global IS 'Permanent mapping from old vendors.id to global_vendors.id.';

-- 4. Create permanent mapping table for old 'vendor_products.id' to 'global_vendor_products.id'
CREATE TABLE map_old_product_to_global (
    old_product_id INTEGER PRIMARY KEY,
    global_product_id INTEGER NOT NULL REFERENCES global_vendor_products(id)
);
COMMENT ON TABLE map_old_product_to_global IS 'Permanent mapping from old vendor_products.id to global_vendor_products.id.';