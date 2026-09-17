-- Drop dependent foreign key constraints first
DO $$
BEGIN
    -- Drop foreign key constraints that depend on vendor_products.id
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'vendor_products_details_product_id_fkey'
        AND table_name = 'vendor_products_details'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "public"."vendor_products_details" DROP CONSTRAINT "vendor_products_details_product_id_fkey";
        RAISE NOTICE 'Dropped vendor_products_details_product_id_fkey';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'vendor_products_users_product_id_fkey'
        AND table_name = 'vendor_products_users'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "public"."vendor_products_users" DROP CONSTRAINT "vendor_products_users_product_id_fkey";
        RAISE NOTICE 'Dropped vendor_products_users_product_id_fkey';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'contract_users_product_id_fkey'
        AND table_name = 'contract_users'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "public"."contract_users" DROP CONSTRAINT "contract_users_product_id_fkey";
        RAISE NOTICE 'Dropped contract_users_product_id_fkey';
    END IF;
END $$;

-- Now drop the unique_id constraint
ALTER TABLE "public"."vendor_products" DROP CONSTRAINT IF EXISTS "unique_id";

-- Drop other constraints and indexes that might cause issues
ALTER TABLE "public"."vendor_products" DROP CONSTRAINT IF EXISTS "vendor_products_user_id_fkey";
ALTER TABLE "public"."vendors" DROP CONSTRAINT IF EXISTS "unique_name_and_user_id";
ALTER TABLE "public"."vendors" DROP CONSTRAINT IF EXISTS "vendors_user_id_fkey";

-- Drop triggers and policies
DROP TRIGGER IF EXISTS "update_vendor_description" ON "public"."vendors";
DROP POLICY IF EXISTS "All access to extractors" ON "public"."vendor_products";
DROP POLICY IF EXISTS "User can see their own rows" ON "public"."vendor_products";
DROP POLICY IF EXISTS "Users can create a row" ON "public"."vendor_products";
DROP POLICY IF EXISTS "Users can update their own rows" ON "public"."vendor_products";
DROP POLICY IF EXISTS "User can see their own rows" ON "public"."vendors";
DROP POLICY IF EXISTS "Users can create a row" ON "public"."vendors";
DROP POLICY IF EXISTS "Users can update their own rows" ON "public"."vendors";

-- Create global sequences
CREATE SEQUENCE IF NOT EXISTS "public"."global_vendor_products_id_seq";
CREATE SEQUENCE IF NOT EXISTS "public"."global_vendors_id_seq";

-- Create organization vendor settings table
CREATE TABLE IF NOT EXISTS "public"."organization_vendor_settings" (
    "organization_id" uuid NOT NULL,
    "vendor_id" integer NOT NULL,
    "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "public"."organization_vendor_settings" ENABLE ROW LEVEL SECURITY;

-- Add demo account column to organizations
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'is_demo_account'
    ) THEN
        ALTER TABLE "public"."organizations" ADD COLUMN "is_demo_account" boolean DEFAULT false;
        RAISE NOTICE 'Added is_demo_account column to organizations';
    END IF;
END $$;

-- Modify vendor_products table
ALTER TABLE "public"."vendor_products" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "public"."vendor_products" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE "public"."vendor_products" ALTER COLUMN "created_at" DROP NOT NULL;
ALTER TABLE "public"."vendor_products" ALTER COLUMN "id" SET DEFAULT nextval('global_vendor_products_id_seq'::regclass);
ALTER TABLE "public"."vendor_products" ALTER COLUMN "id" DROP IDENTITY IF EXISTS;
ALTER TABLE "public"."vendor_products" ALTER COLUMN "id" SET DATA TYPE integer USING "id"::integer;

-- Modify vendors table
ALTER TABLE "public"."vendors" DROP COLUMN IF EXISTS "ict_provider";
ALTER TABLE "public"."vendors" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "public"."vendors" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE "public"."vendors" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "public"."vendors" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;
ALTER TABLE "public"."vendors" ALTER COLUMN "email" SET DATA TYPE text USING "email"::text;
ALTER TABLE "public"."vendors" ALTER COLUMN "id" SET DEFAULT nextval('global_vendors_id_seq'::regclass);
ALTER TABLE "public"."vendors" ALTER COLUMN "id" DROP IDENTITY IF EXISTS;
ALTER TABLE "public"."vendors" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "public"."vendors" ALTER COLUMN "name" SET DATA TYPE text USING "name"::text;

-- Set sequence ownership
ALTER SEQUENCE "public"."global_vendor_products_id_seq" OWNED BY "public"."vendor_products"."id";
ALTER SEQUENCE "public"."global_vendors_id_seq" OWNED BY "public"."vendors"."id";

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_global_vendors_merged_into ON public.vendors USING btree (merged_into_vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS organization_vendor_settings_pkey ON public.organization_vendor_settings USING btree (organization_id, vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_products_vendor_id_name_key ON public.vendor_products USING btree (vendor_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS vendors_name_key ON public.vendors USING btree (name);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_products_pkey ON public.vendor_products USING btree (id);

-- Add primary key and unique constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'organization_vendor_settings' AND constraint_name = 'organization_vendor_settings_pkey'
    ) THEN
        ALTER TABLE "public"."organization_vendor_settings" ADD CONSTRAINT "organization_vendor_settings_pkey" PRIMARY KEY USING INDEX "organization_vendor_settings_pkey";
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'vendor_products' AND constraint_name = 'vendor_products_pkey'
    ) THEN
        ALTER TABLE "public"."vendor_products" ADD CONSTRAINT "vendor_products_pkey" PRIMARY KEY USING INDEX "vendor_products_pkey";
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'vendor_products' AND constraint_name = 'vendor_products_vendor_id_name_key'
    ) THEN
        ALTER TABLE "public"."vendor_products" ADD CONSTRAINT "vendor_products_vendor_id_name_key" UNIQUE USING INDEX "vendor_products_vendor_id_name_key";
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'vendors' AND constraint_name = 'vendors_name_key'
    ) THEN
        ALTER TABLE "public"."vendors" ADD CONSTRAINT "vendors_name_key" UNIQUE USING INDEX "vendors_name_key";
    END IF;
END $$;

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'organization_vendor_settings_organization_id_fkey'
    ) THEN
        ALTER TABLE "public"."organization_vendor_settings" ADD CONSTRAINT "organization_vendor_settings_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'organization_vendor_settings_vendor_id_fkey'
    ) THEN
        ALTER TABLE "public"."organization_vendor_settings" ADD CONSTRAINT "organization_vendor_settings_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'vendor_products_vendor_id_fkey'
    ) THEN
        ALTER TABLE "public"."vendor_products" ADD CONSTRAINT "vendor_products_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'vendors_merged_into_vendor_id_fkey'
    ) THEN
        ALTER TABLE "public"."vendors" ADD CONSTRAINT "vendors_merged_into_vendor_id_fkey" FOREIGN KEY (merged_into_vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Recreate the dependent foreign key constraints we dropped earlier
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'vendor_products_details_product_id_fkey'
    ) THEN
        ALTER TABLE "public"."vendor_products_details" ADD CONSTRAINT "vendor_products_details_product_id_fkey" FOREIGN KEY (product_id) REFERENCES vendor_products(id) ON DELETE CASCADE;
        RAISE NOTICE 'Recreated vendor_products_details_product_id_fkey';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'vendor_products_users_product_id_fkey'
    ) THEN
        ALTER TABLE "public"."vendor_products_users" ADD CONSTRAINT "vendor_products_users_product_id_fkey" FOREIGN KEY (product_id) REFERENCES vendor_products(id) ON DELETE CASCADE;
        RAISE NOTICE 'Recreated vendor_products_users_product_id_fkey';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'contract_users_product_id_fkey'
    ) THEN
        ALTER TABLE "public"."contract_users" ADD CONSTRAINT "contract_users_product_id_fkey" FOREIGN KEY (product_id) REFERENCES vendor_products(id) ON DELETE CASCADE;
        RAISE NOTICE 'Recreated contract_users_product_id_fkey';
    END IF;
END $$;

-- Recreate other foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'contract_relationships_vendor_id_fkey'
    ) THEN
        ALTER TABLE "public"."contract_relationships" ADD CONSTRAINT "contract_relationships_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'contracts_vendor_id_fkey'
    ) THEN
        ALTER TABLE "public"."contracts" ADD CONSTRAINT "contracts_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'corporate_actions_primary_vendor_id_fkey'
    ) THEN
        ALTER TABLE "public"."corporate_actions" ADD CONSTRAINT "corporate_actions_primary_vendor_id_fkey" FOREIGN KEY (primary_vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'corporate_actions_secondary_vendor_id_fkey'
    ) THEN
        ALTER TABLE "public"."corporate_actions" ADD CONSTRAINT "corporate_actions_secondary_vendor_id_fkey" FOREIGN KEY (secondary_vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- Recreate current_vendors view
CREATE OR REPLACE VIEW "public"."current_vendors" AS 
WITH RECURSIVE vendor_lineage AS (
    SELECT vendors.id AS original_vendor_id,
        vendors.id AS current_vendor_id,
        vendors.name AS current_vendor_name
    FROM vendors
    WHERE (vendors.status = 'active'::"VendorStatus")
    UNION ALL
    SELECT v.id AS original_vendor_id,
        vl.current_vendor_id,
        vl.current_vendor_name
    FROM (vendors v
        JOIN vendor_lineage vl ON ((v.merged_into_vendor_id = vl.original_vendor_id)))
    WHERE (v.status = ANY (ARRAY['merged'::"VendorStatus", 'acquired'::"VendorStatus"]))
)
SELECT DISTINCT vendor_lineage.original_vendor_id,
    vendor_lineage.current_vendor_id,
    vendor_lineage.current_vendor_name
FROM vendor_lineage;

-- Grant permissions to anon role
GRANT DELETE ON TABLE "public"."organization_vendor_settings" TO "anon";
GRANT INSERT ON TABLE "public"."organization_vendor_settings" TO "anon";
GRANT REFERENCES ON TABLE "public"."organization_vendor_settings" TO "anon";
GRANT SELECT ON TABLE "public"."organization_vendor_settings" TO "anon";
GRANT TRIGGER ON TABLE "public"."organization_vendor_settings" TO "anon";
GRANT TRUNCATE ON TABLE "public"."organization_vendor_settings" TO "anon";
GRANT UPDATE ON TABLE "public"."organization_vendor_settings" TO "anon";

-- Grant permissions to authenticated role
GRANT DELETE ON TABLE "public"."organization_vendor_settings" TO "authenticated";
GRANT INSERT ON TABLE "public"."organization_vendor_settings" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."organization_vendor_settings" TO "authenticated";
GRANT SELECT ON TABLE "public"."organization_vendor_settings" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."organization_vendor_settings" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."organization_vendor_settings" TO "authenticated";
GRANT UPDATE ON TABLE "public"."organization_vendor_settings" TO "authenticated";

-- Grant permissions to service_role
GRANT DELETE ON TABLE "public"."organization_vendor_settings" TO "service_role";
GRANT INSERT ON TABLE "public"."organization_vendor_settings" TO "service_role";
GRANT REFERENCES ON TABLE "public"."organization_vendor_settings" TO "service_role";
GRANT SELECT ON TABLE "public"."organization_vendor_settings" TO "service_role";
GRANT TRIGGER ON TABLE "public"."organization_vendor_settings" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."organization_vendor_settings" TO "service_role";
GRANT UPDATE ON TABLE "public"."organization_vendor_settings" TO "service_role";

-- Create policies
CREATE POLICY "Authenticated users can view org vendor settings"
ON "public"."organization_vendor_settings"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view global_vendor_products"
ON "public"."vendor_products"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view global_vendors"
ON "public"."vendors"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

-- Create trigger (if function exists)
DO $$
DECLARE
    trigger_exists BOOLEAN;
    function_exists BOOLEAN;
BEGIN
    -- Check if function exists
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'public' AND p.proname = 'trigger_update_vendor_description'
    ) INTO function_exists;

    -- Check if trigger exists
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_vendor_description' 
          AND tgrelid = (SELECT oid FROM pg_class WHERE relname = 'vendors' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
    ) INTO trigger_exists;

    IF function_exists AND NOT trigger_exists THEN
        RAISE NOTICE 'Creating trigger update_vendor_description...';
        CREATE TRIGGER update_vendor_description AFTER INSERT OR UPDATE OF domain ON public.vendors FOR EACH ROW EXECUTE FUNCTION trigger_update_vendor_description();
    ELSIF NOT function_exists THEN
        RAISE NOTICE 'Function trigger_update_vendor_description does not exist, skipping trigger creation';
    ELSE
        RAISE NOTICE 'Trigger update_vendor_description already exists';
    END IF;
END $$; 