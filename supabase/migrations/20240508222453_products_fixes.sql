alter table "public"."vendor_products_details" drop constraint "vendor_product_details_pkey" cascade;

alter table "public"."vendor_products" drop constraint "vendor_products_pkey" cascade;

drop index if exists "public"."vendor_product_details_pkey";

drop index if exists "public"."vendor_products_pkey";

alter table "public"."vendor_products" alter column "name" set not null;

alter table "public"."vendor_products" alter column "vendor_id" set not null;

alter table "public"."vendor_products_details" alter column "contract_id" set not null;

alter table "public"."vendor_products_details" alter column "product_id" set not null;

CREATE UNIQUE INDEX unique_id ON public.vendor_products USING btree (id);

CREATE UNIQUE INDEX vendor_products_details_pkey ON public.vendor_products_details USING btree (product_id, contract_id);

CREATE UNIQUE INDEX vendor_products_pkey ON public.vendor_products USING btree (name, vendor_id);

alter table "public"."vendor_products_details" add constraint "vendor_products_details_pkey" PRIMARY KEY using index "vendor_products_details_pkey";

alter table "public"."vendor_products" add constraint "vendor_products_pkey" PRIMARY KEY using index "vendor_products_pkey";

alter table "public"."vendor_products" add constraint "unique_id" UNIQUE using index "unique_id";
