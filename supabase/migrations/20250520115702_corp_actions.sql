create type "public"."CorporateActionType" as enum ('merger', 'acquisition', 'name_change', 'spinoff');

create type "public"."VendorStatus" as enum ('active', 'inactive', 'merged', 'acquired');

create sequence "public"."corporate_actions_id_seq";

create table "public"."corporate_actions" (
    "id" integer not null default nextval('corporate_actions_id_seq'::regclass),
    "action_type" "CorporateActionType" not null,
    "effective_date" timestamp with time zone not null,
    "description" text,
    "primary_vendor_id" integer not null,
    "secondary_vendor_id" integer,
    "notes" jsonb,
    "created_at" timestamp with time zone default now()
);


alter table "public"."corporate_actions" enable row level security;

alter table "public"."vendors" add column "merged_into_vendor_id" integer;

alter table "public"."vendors" add column "merger_effective_date" timestamp with time zone;

alter table "public"."vendors" add column "status" "VendorStatus";

alter sequence "public"."corporate_actions_id_seq" owned by "public"."corporate_actions"."id";

CREATE UNIQUE INDEX corporate_actions_pkey ON public.corporate_actions USING btree (id);

CREATE INDEX vendors_merged_into_vendor_id_idx ON public.vendors USING btree (merged_into_vendor_id);

alter table "public"."corporate_actions" add constraint "corporate_actions_pkey" PRIMARY KEY using index "corporate_actions_pkey";

alter table "public"."corporate_actions" add constraint "corporate_actions_primary_vendor_id_fkey" FOREIGN KEY (primary_vendor_id) REFERENCES vendors(id) not valid;

alter table "public"."corporate_actions" validate constraint "corporate_actions_primary_vendor_id_fkey";

alter table "public"."corporate_actions" add constraint "corporate_actions_secondary_vendor_id_fkey" FOREIGN KEY (secondary_vendor_id) REFERENCES vendors(id) not valid;

alter table "public"."corporate_actions" validate constraint "corporate_actions_secondary_vendor_id_fkey";

alter table "public"."vendors" add constraint "vendors_merged_into_vendor_id_fkey" FOREIGN KEY (merged_into_vendor_id) REFERENCES vendors(id) not valid;

alter table "public"."vendors" validate constraint "vendors_merged_into_vendor_id_fkey";

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


grant delete on table "public"."corporate_actions" to "anon";

grant insert on table "public"."corporate_actions" to "anon";

grant references on table "public"."corporate_actions" to "anon";

grant select on table "public"."corporate_actions" to "anon";

grant trigger on table "public"."corporate_actions" to "anon";

grant truncate on table "public"."corporate_actions" to "anon";

grant update on table "public"."corporate_actions" to "anon";

grant delete on table "public"."corporate_actions" to "authenticated";

grant insert on table "public"."corporate_actions" to "authenticated";

grant references on table "public"."corporate_actions" to "authenticated";

grant select on table "public"."corporate_actions" to "authenticated";

grant trigger on table "public"."corporate_actions" to "authenticated";

grant truncate on table "public"."corporate_actions" to "authenticated";

grant update on table "public"."corporate_actions" to "authenticated";

grant delete on table "public"."corporate_actions" to "service_role";

grant insert on table "public"."corporate_actions" to "service_role";

grant references on table "public"."corporate_actions" to "service_role";

grant select on table "public"."corporate_actions" to "service_role";

grant trigger on table "public"."corporate_actions" to "service_role";

grant truncate on table "public"."corporate_actions" to "service_role";

grant update on table "public"."corporate_actions" to "service_role";

create policy "Enable select for authenticated users only"
on "public"."corporate_actions"
as permissive
for select
to authenticated
using (true);



