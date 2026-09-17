alter table "public"."contract_asset_classes" drop constraint "contract_asset_classes_pkey";

drop index if exists "public"."contract_asset_classes_pkey";

alter table "public"."contract_asset_classes" add column "sub_asset_class_id" bigint not null;

CREATE UNIQUE INDEX contract_asset_classes_pkey ON public.contract_asset_classes USING btree (asset_class_id, contract_id, sub_asset_class_id);

alter table "public"."contract_asset_classes" add constraint "contract_asset_classes_pkey" PRIMARY KEY using index "contract_asset_classes_pkey";

alter table "public"."contract_asset_classes" add constraint "contract_asset_classes_sub_asset_class_id_fkey" FOREIGN KEY (sub_asset_class_id) REFERENCES sub_asset_classes(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."contract_asset_classes" validate constraint "contract_asset_classes_sub_asset_class_id_fkey";


