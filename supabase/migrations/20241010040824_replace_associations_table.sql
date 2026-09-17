create sequence if not exists "public"."contract_relationships_id_seq";

-- Only run revokes/drops if contract_associations exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contract_associations') THEN
    revoke delete on table "public"."contract_associations" from "anon";
    revoke insert on table "public"."contract_associations" from "anon";
    revoke references on table "public"."contract_associations" from "anon";
    revoke select on table "public"."contract_associations" from "anon";
    revoke trigger on table "public"."contract_associations" from "anon";
    revoke truncate on table "public"."contract_associations" from "anon";
    revoke update on table "public"."contract_associations" from "anon";
    revoke delete on table "public"."contract_associations" from "authenticated";
    revoke insert on table "public"."contract_associations" from "authenticated";
    revoke references on table "public"."contract_associations" from "authenticated";
    revoke select on table "public"."contract_associations" from "authenticated";
    revoke trigger on table "public"."contract_associations" from "authenticated";
    revoke truncate on table "public"."contract_associations" from "authenticated";
    revoke update on table "public"."contract_associations" from "authenticated";
    revoke delete on table "public"."contract_associations" from "service_role";
    revoke insert on table "public"."contract_associations" from "service_role";
    revoke references on table "public"."contract_associations" from "service_role";
    revoke select on table "public"."contract_associations" from "service_role";
    revoke trigger on table "public"."contract_associations" from "service_role";
    revoke truncate on table "public"."contract_associations" from "service_role";
    revoke update on table "public"."contract_associations" from "service_role";

    alter table "public"."contract_associations" drop constraint if exists "contract_associations_child_contract_id_fkey";
    alter table "public"."contract_associations" drop constraint if exists "contract_associations_parent_contract_id_child_contract_id_key";
    alter table "public"."contract_associations" drop constraint if exists "contract_associations_parent_contract_id_fkey";
    alter table "public"."contract_associations" drop constraint if exists "contract_associations_pkey";
  END IF;
END $$;

drop index if exists "public"."contract_associations_parent_contract_id_child_contract_id_key";

drop index if exists "public"."contract_associations_pkey";

drop table if exists "public"."contract_associations";

create table if not exists "public"."contract_relationships" (
    "id" integer not null default nextval('contract_relationships_id_seq'::regclass),
    "parent_contract_id" integer,
    "child_contract_id" integer,
    "created_at" timestamp without time zone default CURRENT_TIMESTAMP,
    "vendor_id" integer
);


alter table "public"."contract_relationships" enable row level security;

drop sequence if exists "public"."contract_associations_id_seq";

CREATE UNIQUE INDEX IF NOT EXISTS contract_associations_parent_contract_id_child_contract_id_key ON public.contract_relationships USING btree (parent_contract_id, child_contract_id);

CREATE UNIQUE INDEX IF NOT EXISTS contract_associations_pkey ON public.contract_relationships USING btree (id);

-- Add constraints only if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_associations_pkey' AND conrelid = 'public.contract_relationships'::regclass) THEN
    alter table "public"."contract_relationships" add constraint "contract_associations_pkey" PRIMARY KEY using index "contract_associations_pkey";
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_associations_parent_contract_id_child_contract_id_key' AND conrelid = 'public.contract_relationships'::regclass) THEN
    alter table "public"."contract_relationships" add constraint "contract_associations_parent_contract_id_child_contract_id_key" UNIQUE using index "contract_associations_parent_contract_id_child_contract_id_key";
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_relationships_child_contract_id_fkey' AND conrelid = 'public.contract_relationships'::regclass) THEN
    alter table "public"."contract_relationships" add constraint "contract_relationships_child_contract_id_fkey" FOREIGN KEY (child_contract_id) REFERENCES contracts(id) ON DELETE CASCADE not valid;
    alter table "public"."contract_relationships" validate constraint "contract_relationships_child_contract_id_fkey";
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_relationships_parent_contract_id_fkey' AND conrelid = 'public.contract_relationships'::regclass) THEN
    alter table "public"."contract_relationships" add constraint "contract_relationships_parent_contract_id_fkey" FOREIGN KEY (parent_contract_id) REFERENCES contracts(id) ON DELETE CASCADE not valid;
    alter table "public"."contract_relationships" validate constraint "contract_relationships_parent_contract_id_fkey";
  END IF;
END $$;

grant delete on table "public"."contract_relationships" to "anon";

grant insert on table "public"."contract_relationships" to "anon";

grant references on table "public"."contract_relationships" to "anon";

grant select on table "public"."contract_relationships" to "anon";

grant trigger on table "public"."contract_relationships" to "anon";

grant truncate on table "public"."contract_relationships" to "anon";

grant update on table "public"."contract_relationships" to "anon";

grant delete on table "public"."contract_relationships" to "authenticated";

grant insert on table "public"."contract_relationships" to "authenticated";

grant references on table "public"."contract_relationships" to "authenticated";

grant select on table "public"."contract_relationships" to "authenticated";

grant trigger on table "public"."contract_relationships" to "authenticated";

grant truncate on table "public"."contract_relationships" to "authenticated";

grant update on table "public"."contract_relationships" to "authenticated";

grant delete on table "public"."contract_relationships" to "service_role";

grant insert on table "public"."contract_relationships" to "service_role";

grant references on table "public"."contract_relationships" to "service_role";

grant select on table "public"."contract_relationships" to "service_role";

grant trigger on table "public"."contract_relationships" to "service_role";

grant truncate on table "public"."contract_relationships" to "service_role";

grant update on table "public"."contract_relationships" to "service_role";
