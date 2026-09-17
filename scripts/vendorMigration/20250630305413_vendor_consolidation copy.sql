drop policy if exists "User can see their own rows" on "public"."vendor_products";

drop policy if exists "Users can create a row" on "public"."vendor_products";

drop policy if exists "Users can update their own rows" on "public"."vendor_products";

drop policy if exists "User can see their own rows" on "public"."vendors";

drop policy if exists "Users can create a row" on "public"."vendors";

drop policy if exists "Users can update their own rows" on "public"."vendors";

-- alter table "public"."vendor_products" drop constraint if exists "unique_id";

alter table "public"."vendor_products" drop constraint if exists "vendor_products_user_id_fkey";

alter table "public"."vendors" drop constraint if exists "unique_name_and_user_id";

alter table "public"."vendors" drop constraint if exists "vendors_user_id_fkey";

alter table "public"."contract_relationships" drop constraint if exists "contract_relationships_vendor_id_fkey";

alter table "public"."contract_users" drop constraint if exists "contract_users_product_id_fkey";

alter table "public"."contracts" drop constraint if exists "contracts_vendor_id_fkey";

alter table "public"."corporate_actions" drop constraint if exists "corporate_actions_primary_vendor_id_fkey";

alter table "public"."corporate_actions" drop constraint if exists "corporate_actions_secondary_vendor_id_fkey";

alter table "public"."vendor_products" drop constraint if exists "vendor_products_vendor_id_fkey";

alter table "public"."vendor_products_details" drop constraint if exists "vendor_products_details_product_id_fkey";

alter table "public"."vendor_products_users" drop constraint if exists "vendor_products_users_product_id_fkey";

alter table "public"."vendors" drop constraint if exists "vendors_merged_into_vendor_id_fkey";

drop view if exists "public"."current_vendors";

alter table "public"."vendor_products_details" drop constraint if exists "vendor_products_details_pkey";

alter table "public"."vendor_products" drop constraint if exists "vendor_products_pkey";

drop index if exists "public"."vendor_products_details_pkey";

drop index if exists "public"."vendor_products_pkey";

drop index if exists "public"."vendors_merged_into_vendor_id_idx";

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'organization_vendor_settings'
    ) THEN
        RAISE NOTICE 'Table public.organization_vendor_settings does not exist. Creating...';
        CREATE TABLE "public"."organization_vendor_settings" (
    "organization_id" uuid not null,
    "vendor_id" integer not null,
    "settings" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);
    ELSE
        RAISE NOTICE 'Table public.organization_vendor_settings already exists.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'organization_vendor_settings' AND rowsecurity = FALSE
    ) THEN
        RAISE NOTICE 'Enabling RLS on public.organization_vendor_settings...';
        ALTER TABLE "public"."organization_vendor_settings" ENABLE ROW LEVEL SECURITY;
    ELSE
        RAISE NOTICE 'RLS already enabled or table public.organization_vendor_settings does not exist.';
    END IF;
END $$;

alter table "public"."vendor_products" drop column if exists "user_id";

alter table "public"."vendor_products" add column if not exists "updated_at" timestamp with time zone default now();
        
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vendor_products' AND column_name = 'id' AND (udt_name <> 'int4' AND data_type <> 'integer')
    ) THEN
        RAISE NOTICE 'Altering public.vendor_products.id to SET DATA TYPE integer...';
        ALTER TABLE "public"."vendor_products" ALTER COLUMN "id" SET DATA TYPE integer USING "id"::integer;
    ELSE
        RAISE NOTICE 'Column public.vendor_products.id is already integer or does not exist.';
    END IF;
END $$;

alter table "public"."vendors" drop column if exists "ict_provider";

alter table "public"."vendors" drop column if exists "user_id";

alter table "public"."vendors" add column if not exists "updated_at" timestamp with time zone default now();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vendors' AND column_name = 'name' AND is_nullable = 'YES'
    ) THEN
        RAISE NOTICE 'Altering public.vendors.name to SET NOT NULL...';
        ALTER TABLE "public"."vendors" ALTER COLUMN "name" SET NOT NULL;
    ELSE
        RAISE NOTICE 'Column public.vendors.name is already NOT NULL or does not exist.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vendors' AND column_name = 'name' AND data_type <> 'text'
    ) THEN
        RAISE NOTICE 'Altering public.vendors.name to SET DATA TYPE text...';
        ALTER TABLE "public"."vendors" ALTER COLUMN "name" SET DATA TYPE text USING "name"::text;
    ELSE
        RAISE NOTICE 'Column public.vendors.name is already text or does not exist.';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS organization_vendor_settings_pkey ON public.organization_vendor_settings USING btree (organization_id, vendor_id);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_products_vendor_id_name_key ON public.vendor_products USING btree (vendor_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS vendors_name_key ON public.vendors USING btree (name);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_products_pkey ON public.vendor_products USING btree (id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'organization_vendor_settings' AND constraint_name = 'organization_vendor_settings_pkey' AND constraint_type = 'PRIMARY KEY'
    ) THEN
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'organization_vendor_settings' AND indexname = 'organization_vendor_settings_pkey') THEN
            RAISE NOTICE 'Adding PK constraint organization_vendor_settings_pkey...';
            ALTER TABLE "public"."organization_vendor_settings" ADD CONSTRAINT "organization_vendor_settings_pkey" PRIMARY KEY USING INDEX "organization_vendor_settings_pkey";
        ELSE
            RAISE NOTICE 'Index organization_vendor_settings_pkey not found for PK. PK not added.';
        END IF;
    ELSE
        RAISE NOTICE 'PK constraint organization_vendor_settings_pkey already exists.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'vendor_products' AND constraint_name = 'vendor_products_pkey' AND constraint_type = 'PRIMARY KEY'
    ) THEN
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'vendor_products' AND indexname = 'vendor_products_pkey') THEN
            RAISE NOTICE 'Adding PK constraint vendor_products_pkey...';
            ALTER TABLE "public"."vendor_products" ADD CONSTRAINT "vendor_products_pkey" PRIMARY KEY USING INDEX "vendor_products_pkey";
        ELSE
            RAISE NOTICE 'Index vendor_products_pkey not found for PK. PK not added.';
        END IF;
    ELSE
        RAISE NOTICE 'PK constraint vendor_products_pkey already exists.';
    END IF;
END $$;

DO $$
BEGIN
    -- Constraint: organization_vendor_settings_organization_id_fkey
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND constraint_name = 'organization_vendor_settings_organization_id_fkey' AND table_name = 'organization_vendor_settings' AND constraint_type = 'FOREIGN KEY'
    ) THEN
        RAISE NOTICE 'Adding FK constraint organization_vendor_settings_organization_id_fkey to table organization_vendor_settings NOT VALID...';
        ALTER TABLE "public"."organization_vendor_settings" ADD CONSTRAINT "organization_vendor_settings_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE NOT VALID;
    ELSE
        RAISE NOTICE 'FK constraint organization_vendor_settings_organization_id_fkey on table organization_vendor_settings already exists.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint ct JOIN pg_class cl ON cl.oid = ct.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ct.conname = 'organization_vendor_settings_organization_id_fkey' AND ns.nspname = 'public' AND cl.relname = 'organization_vendor_settings' AND ct.convalidated = FALSE
    ) THEN
        RAISE NOTICE 'Validating constraint organization_vendor_settings_organization_id_fkey on table organization_vendor_settings...';
        ALTER TABLE "public"."organization_vendor_settings" VALIDATE CONSTRAINT "organization_vendor_settings_organization_id_fkey";
    ELSE
        RAISE NOTICE 'Constraint organization_vendor_settings_organization_id_fkey on table organization_vendor_settings already validated or does not exist for validation.';
    END IF;
END $$;

DO $$
BEGIN
    -- Constraint: organization_vendor_settings_vendor_id_fkey
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND constraint_name = 'organization_vendor_settings_vendor_id_fkey' AND table_name = 'organization_vendor_settings' AND constraint_type = 'FOREIGN KEY'
    ) THEN
        RAISE NOTICE 'Adding FK constraint organization_vendor_settings_vendor_id_fkey to table organization_vendor_settings NOT VALID...';
        ALTER TABLE "public"."organization_vendor_settings" ADD CONSTRAINT "organization_vendor_settings_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE NOT VALID;
    ELSE
        RAISE NOTICE 'FK constraint organization_vendor_settings_vendor_id_fkey on table organization_vendor_settings already exists.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint ct JOIN pg_class cl ON cl.oid = ct.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ct.conname = 'organization_vendor_settings_vendor_id_fkey' AND ns.nspname = 'public' AND cl.relname = 'organization_vendor_settings' AND ct.convalidated = FALSE
    ) THEN
        RAISE NOTICE 'Validating constraint organization_vendor_settings_vendor_id_fkey on table organization_vendor_settings...';
        ALTER TABLE "public"."organization_vendor_settings" VALIDATE CONSTRAINT "organization_vendor_settings_vendor_id_fkey";
    ELSE
        RAISE NOTICE 'Constraint organization_vendor_settings_vendor_id_fkey on table organization_vendor_settings already validated or does not exist for validation.';
    END IF;
END $$;

DO $$
BEGIN
    -- Constraint: vendor_products_vendor_id_name_key (UNIQUE)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'vendor_products' AND constraint_name = 'vendor_products_vendor_id_name_key' AND constraint_type = 'UNIQUE'
    ) THEN
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'vendor_products' AND indexname = 'vendor_products_vendor_id_name_key') THEN
            RAISE NOTICE 'Adding UNIQUE constraint vendor_products_vendor_id_name_key to table vendor_products...';
            ALTER TABLE "public"."vendor_products" ADD CONSTRAINT "vendor_products_vendor_id_name_key" UNIQUE USING INDEX "vendor_products_vendor_id_name_key";
        ELSE
            RAISE NOTICE 'Index vendor_products_vendor_id_name_key not found for UNIQUE constraint on table vendor_products. Constraint not added.';
        END IF;
    ELSE
        RAISE NOTICE 'UNIQUE constraint vendor_products_vendor_id_name_key on table vendor_products already exists.';
    END IF;
END $$;

DO $$
BEGIN
    -- Constraint: vendors_name_key (UNIQUE)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'vendors' AND constraint_name = 'vendors_name_key' AND constraint_type = 'UNIQUE'
    ) THEN
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'vendors' AND indexname = 'vendors_name_key') THEN
            RAISE NOTICE 'Adding UNIQUE constraint vendors_name_key to table vendors...';
            ALTER TABLE "public"."vendors" ADD CONSTRAINT "vendors_name_key" UNIQUE USING INDEX "vendors_name_key";
        ELSE
            RAISE NOTICE 'Index vendors_name_key not found for UNIQUE constraint on table vendors. Constraint not added.';
        END IF;
    ELSE
        RAISE NOTICE 'UNIQUE constraint vendors_name_key on table vendors already exists.';
    END IF;
END $$;

DO $$
BEGIN
    -- Constraint: contract_relationships_vendor_id_fkey
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND constraint_name = 'contract_relationships_vendor_id_fkey' AND table_name = 'contract_relationships' AND constraint_type = 'FOREIGN KEY'
    ) THEN
        RAISE NOTICE 'Adding FK constraint contract_relationships_vendor_id_fkey to table contract_relationships NOT VALID...';
        ALTER TABLE "public"."contract_relationships" ADD CONSTRAINT "contract_relationships_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT NOT VALID;
    ELSE
        RAISE NOTICE 'FK constraint contract_relationships_vendor_id_fkey on table contract_relationships already exists.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint ct JOIN pg_class cl ON cl.oid = ct.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ct.conname = 'contract_relationships_vendor_id_fkey' AND ns.nspname = 'public' AND cl.relname = 'contract_relationships' AND ct.convalidated = FALSE
    ) THEN
        RAISE NOTICE 'Validating constraint contract_relationships_vendor_id_fkey on table contract_relationships...';
        ALTER TABLE "public"."contract_relationships" VALIDATE CONSTRAINT "contract_relationships_vendor_id_fkey";
    ELSE
        RAISE NOTICE 'Constraint contract_relationships_vendor_id_fkey on table contract_relationships already validated or does not exist for validation.';
    END IF;
END $$;

DO $$
BEGIN
    -- Constraint: contract_users_product_id_fkey
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND constraint_name = 'contract_users_product_id_fkey' AND table_name = 'contract_users' AND constraint_type = 'FOREIGN KEY'
    ) THEN
        RAISE NOTICE 'Adding FK constraint contract_users_product_id_fkey to table contract_users NOT VALID...';
        ALTER TABLE "public"."contract_users" ADD CONSTRAINT "contract_users_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.vendor_products(id) ON DELETE CASCADE NOT VALID;
    ELSE
        RAISE NOTICE 'FK constraint contract_users_product_id_fkey on table contract_users already exists.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint ct JOIN pg_class cl ON cl.oid = ct.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ct.conname = 'contract_users_product_id_fkey' AND ns.nspname = 'public' AND cl.relname = 'contract_users' AND ct.convalidated = FALSE
    ) THEN
        RAISE NOTICE 'Validating constraint contract_users_product_id_fkey on table contract_users...';
        ALTER TABLE "public"."contract_users" VALIDATE CONSTRAINT "contract_users_product_id_fkey";
    ELSE
        RAISE NOTICE 'Constraint contract_users_product_id_fkey on table contract_users already validated or does not exist for validation.';
    END IF;
END $$;

DO $$
BEGIN
    -- Constraint: contracts_vendor_id_fkey
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND constraint_name = 'contracts_vendor_id_fkey' AND table_name = 'contracts' AND constraint_type = 'FOREIGN KEY'
    ) THEN
        RAISE NOTICE 'Adding FK constraint contracts_vendor_id_fkey to table contracts NOT VALID...';
        ALTER TABLE "public"."contracts" ADD CONSTRAINT "contracts_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT NOT VALID;
    ELSE
        RAISE NOTICE 'FK constraint contracts_vendor_id_fkey on table contracts already exists.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint ct JOIN pg_class cl ON cl.oid = ct.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ct.conname = 'contracts_vendor_id_fkey' AND ns.nspname = 'public' AND cl.relname = 'contracts' AND ct.convalidated = FALSE
    ) THEN
        RAISE NOTICE 'Validating constraint contracts_vendor_id_fkey on table contracts...';
        ALTER TABLE "public"."contracts" VALIDATE CONSTRAINT "contracts_vendor_id_fkey";
    ELSE
        RAISE NOTICE 'Constraint contracts_vendor_id_fkey on table contracts already validated or does not exist for validation.';
    END IF;
END $$;

DO $$
BEGIN
    -- Constraint: corporate_actions_primary_vendor_id_fkey
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND constraint_name = 'corporate_actions_primary_vendor_id_fkey' AND table_name = 'corporate_actions' AND constraint_type = 'FOREIGN KEY'
    ) THEN
        RAISE NOTICE 'Adding FK constraint corporate_actions_primary_vendor_id_fkey to table corporate_actions NOT VALID...';
        ALTER TABLE "public"."corporate_actions" ADD CONSTRAINT "corporate_actions_primary_vendor_id_fkey" FOREIGN KEY (primary_vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT NOT VALID;
    ELSE
        RAISE NOTICE 'FK constraint corporate_actions_primary_vendor_id_fkey on table corporate_actions already exists.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint ct JOIN pg_class cl ON cl.oid = ct.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ct.conname = 'corporate_actions_primary_vendor_id_fkey' AND ns.nspname = 'public' AND cl.relname = 'corporate_actions' AND ct.convalidated = FALSE
    ) THEN
        RAISE NOTICE 'Validating constraint corporate_actions_primary_vendor_id_fkey on table corporate_actions...';
        ALTER TABLE "public"."corporate_actions" VALIDATE CONSTRAINT "corporate_actions_primary_vendor_id_fkey";
    ELSE
        RAISE NOTICE 'Constraint corporate_actions_primary_vendor_id_fkey on table corporate_actions already validated or does not exist for validation.';
    END IF;
END $$;

DO $$
BEGIN
    -- Constraint: corporate_actions_secondary_vendor_id_fkey
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND constraint_name = 'corporate_actions_secondary_vendor_id_fkey' AND table_name = 'corporate_actions' AND constraint_type = 'FOREIGN KEY'
    ) THEN
        RAISE NOTICE 'Adding FK constraint corporate_actions_secondary_vendor_id_fkey to table corporate_actions NOT VALID...';
        ALTER TABLE "public"."corporate_actions" ADD CONSTRAINT "corporate_actions_secondary_vendor_id_fkey" FOREIGN KEY (secondary_vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT NOT VALID;
    ELSE
        RAISE NOTICE 'FK constraint corporate_actions_secondary_vendor_id_fkey on table corporate_actions already exists.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint ct JOIN pg_class cl ON cl.oid = ct.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ct.conname = 'corporate_actions_secondary_vendor_id_fkey' AND ns.nspname = 'public' AND cl.relname = 'corporate_actions' AND ct.convalidated = FALSE
    ) THEN
        RAISE NOTICE 'Validating constraint corporate_actions_secondary_vendor_id_fkey on table corporate_actions...';
        ALTER TABLE "public"."corporate_actions" VALIDATE CONSTRAINT "corporate_actions_secondary_vendor_id_fkey";
    ELSE
        RAISE NOTICE 'Constraint corporate_actions_secondary_vendor_id_fkey on table corporate_actions already validated or does not exist for validation.';
    END IF;
END $$;

DO $$
BEGIN
    -- Constraint: vendor_products_vendor_id_fkey
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND constraint_name = 'vendor_products_vendor_id_fkey' AND table_name = 'vendor_products' AND constraint_type = 'FOREIGN KEY'
    ) THEN
        RAISE NOTICE 'Adding FK constraint vendor_products_vendor_id_fkey to table vendor_products NOT VALID...';
        ALTER TABLE "public"."vendor_products" ADD CONSTRAINT "vendor_products_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE NOT VALID;
    ELSE
        RAISE NOTICE 'FK constraint vendor_products_vendor_id_fkey on table vendor_products already exists.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint ct JOIN pg_class cl ON cl.oid = ct.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ct.conname = 'vendor_products_vendor_id_fkey' AND ns.nspname = 'public' AND cl.relname = 'vendor_products' AND ct.convalidated = FALSE
    ) THEN
        RAISE NOTICE 'Validating constraint vendor_products_vendor_id_fkey on table vendor_products...';
        ALTER TABLE "public"."vendor_products" VALIDATE CONSTRAINT "vendor_products_vendor_id_fkey";
    ELSE
        RAISE NOTICE 'Constraint vendor_products_vendor_id_fkey on table vendor_products already validated or does not exist for validation.';
    END IF;
END $$;

DO $$
BEGIN
    -- Constraint: vendor_products_details_product_id_fkey
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND constraint_name = 'vendor_products_details_product_id_fkey' AND table_name = 'vendor_products_details' AND constraint_type = 'FOREIGN KEY'
    ) THEN
        RAISE NOTICE 'Adding FK constraint vendor_products_details_product_id_fkey to table vendor_products_details NOT VALID...';
        ALTER TABLE "public"."vendor_products_details" ADD CONSTRAINT "vendor_products_details_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.vendor_products(id) ON DELETE CASCADE NOT VALID;
    ELSE
        RAISE NOTICE 'FK constraint vendor_products_details_product_id_fkey on table vendor_products_details already exists.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint ct JOIN pg_class cl ON cl.oid = ct.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ct.conname = 'vendor_products_details_product_id_fkey' AND ns.nspname = 'public' AND cl.relname = 'vendor_products_details' AND ct.convalidated = FALSE
    ) THEN
        RAISE NOTICE 'Validating constraint vendor_products_details_product_id_fkey on table vendor_products_details...';
        ALTER TABLE "public"."vendor_products_details" VALIDATE CONSTRAINT "vendor_products_details_product_id_fkey";
    ELSE
        RAISE NOTICE 'Constraint vendor_products_details_product_id_fkey on table vendor_products_details already validated or does not exist for validation.';
    END IF;
END $$;

DO $$
BEGIN
    -- Constraint: vendor_products_users_product_id_fkey
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND constraint_name = 'vendor_products_users_product_id_fkey' AND table_name = 'vendor_products_users' AND constraint_type = 'FOREIGN KEY'
    ) THEN
        RAISE NOTICE 'Adding FK constraint vendor_products_users_product_id_fkey to table vendor_products_users NOT VALID...';
        ALTER TABLE "public"."vendor_products_users" ADD CONSTRAINT "vendor_products_users_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.vendor_products(id) ON DELETE CASCADE NOT VALID;
    ELSE
        RAISE NOTICE 'FK constraint vendor_products_users_product_id_fkey on table vendor_products_users already exists.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint ct JOIN pg_class cl ON cl.oid = ct.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ct.conname = 'vendor_products_users_product_id_fkey' AND ns.nspname = 'public' AND cl.relname = 'vendor_products_users' AND ct.convalidated = FALSE
    ) THEN
        RAISE NOTICE 'Validating constraint vendor_products_users_product_id_fkey on table vendor_products_users...';
        ALTER TABLE "public"."vendor_products_users" VALIDATE CONSTRAINT "vendor_products_users_product_id_fkey";
    ELSE
        RAISE NOTICE 'Constraint vendor_products_users_product_id_fkey on table vendor_products_users already validated or does not exist for validation.';
    END IF;
END $$;

DO $$
BEGIN
    -- Constraint: vendors_merged_into_vendor_id_fkey
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND constraint_name = 'vendors_merged_into_vendor_id_fkey' AND table_name = 'vendors' AND constraint_type = 'FOREIGN KEY'
    ) THEN
        RAISE NOTICE 'Adding FK constraint vendors_merged_into_vendor_id_fkey to table vendors NOT VALID...';
        ALTER TABLE "public"."vendors" ADD CONSTRAINT "vendors_merged_into_vendor_id_fkey" FOREIGN KEY (merged_into_vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL NOT VALID;
    ELSE
        RAISE NOTICE 'FK constraint vendors_merged_into_vendor_id_fkey on table vendors already exists.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint ct JOIN pg_class cl ON cl.oid = ct.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ct.conname = 'vendors_merged_into_vendor_id_fkey' AND ns.nspname = 'public' AND cl.relname = 'vendors' AND ct.convalidated = FALSE
    ) THEN
        RAISE NOTICE 'Validating constraint vendors_merged_into_vendor_id_fkey on table vendors...';
        ALTER TABLE "public"."vendors" VALIDATE CONSTRAINT "vendors_merged_into_vendor_id_fkey";
    ELSE
        RAISE NOTICE 'Constraint vendors_merged_into_vendor_id_fkey on table vendors already validated or does not exist for validation.';
    END IF;
END $$;

create or replace view "public"."current_vendors" as  WITH RECURSIVE vendor_lineage AS (
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


grant delete on table "public"."organization_vendor_settings" to "anon";

grant insert on table "public"."organization_vendor_settings" to "anon";

grant references on table "public"."organization_vendor_settings" to "anon";

grant select on table "public"."organization_vendor_settings" to "anon";

grant trigger on table "public"."organization_vendor_settings" to "anon";

grant truncate on table "public"."organization_vendor_settings" to "anon";

grant update on table "public"."organization_vendor_settings" to "anon";

grant delete on table "public"."organization_vendor_settings" to "authenticated";

grant insert on table "public"."organization_vendor_settings" to "authenticated";

grant references on table "public"."organization_vendor_settings" to "authenticated";

grant select on table "public"."organization_vendor_settings" to "authenticated";

grant trigger on table "public"."organization_vendor_settings" to "authenticated";

grant truncate on table "public"."organization_vendor_settings" to "authenticated";

grant update on table "public"."organization_vendor_settings" to "authenticated";

grant delete on table "public"."organization_vendor_settings" to "service_role";

grant insert on table "public"."organization_vendor_settings" to "service_role";

grant references on table "public"."organization_vendor_settings" to "service_role";

grant select on table "public"."organization_vendor_settings" to "service_role";

grant trigger on table "public"."organization_vendor_settings" to "service_role";

grant truncate on table "public"."organization_vendor_settings" to "service_role";

grant update on table "public"."organization_vendor_settings" to "service_role";

DO $$
DECLARE
    trigger_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_vendor_description' 
          AND tgrelid = (SELECT oid FROM pg_class WHERE relname = 'vendors' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
    ) INTO trigger_exists;

    IF NOT trigger_exists THEN
        RAISE NOTICE 'Creating trigger update_vendor_description...';
CREATE TRIGGER update_vendor_description AFTER INSERT OR UPDATE OF domain ON public.vendors FOR EACH ROW EXECUTE FUNCTION trigger_update_vendor_description();
    ELSE
        RAISE NOTICE 'Trigger update_vendor_description already exists.';
    END IF;
END $$;


