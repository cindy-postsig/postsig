alter table "public"."vendor_products" drop constraint "unique_name";

drop index if exists "public"."unique_name";