alter table "public"."asset_classes" alter column "name" set not null;

alter table "public"."sub_asset_classes" alter column "name" set not null;

alter table "public"."sub_asset_classes" alter column "parent_id" set not null;


