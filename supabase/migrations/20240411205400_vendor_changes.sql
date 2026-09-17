alter table
    "public"."contracts" drop constraint "contracts_vendor_id_fkey";

alter table
    "public"."contracts"
add
    column "ai_extraction" jsonb;

alter table
    "public"."vendors"
add
    column "user_id" uuid;

alter table
    "public"."vendors" enable row level security;

alter table
    "public"."contracts"
add
    constraint "contracts_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
    "public"."contracts" validate constraint "contracts_vendor_id_fkey";