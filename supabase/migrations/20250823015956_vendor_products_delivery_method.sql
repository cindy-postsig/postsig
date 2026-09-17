alter table "public"."vendor_products" add column "delivery_method_id" bigint;

alter table "public"."vendor_products" add constraint "vendor_products_delivery_method_id_fkey" FOREIGN KEY (delivery_method_id) REFERENCES data_delivery_types(id) ON DELETE RESTRICT not valid;

alter table "public"."vendor_products" validate constraint "vendor_products_delivery_method_id_fkey";
