alter table "public"."vendor_products_details" drop constraint "vendor_products_details_pkey";

drop index if exists "public"."vendor_products_details_pkey";

alter table "public"."vendor_products_details" alter column "year" set not null;

CREATE UNIQUE INDEX unique_name_and_user_id ON public.vendors USING btree (name, user_id);

CREATE UNIQUE INDEX vendor_products_details_pkey ON public.vendor_products_details USING btree (product_id, contract_id, year);

alter table "public"."vendor_products_details" add constraint "vendor_products_details_pkey" PRIMARY KEY using index "vendor_products_details_pkey";

alter table "public"."vendors" add constraint "unique_name_and_user_id" UNIQUE using index "unique_name_and_user_id";


