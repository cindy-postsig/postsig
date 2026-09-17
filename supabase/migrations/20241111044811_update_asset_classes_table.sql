create sequence "public"."contract_asset_class_id_seq";

alter table "public"."contract_asset_classes" drop constraint "contract_asset_classes_asset_class_id_fkey";

alter table "public"."contract_asset_classes" drop constraint "contract_asset_classes_contract_id_fkey";

alter table "public"."contract_asset_classes" drop constraint "contract_asset_classes_sub_asset_class_id_fkey";

alter table "public"."contract_asset_classes" drop constraint "contract_asset_classes_pkey";

drop index if exists "public"."contract_asset_classes_pkey";

alter table "public"."contract_asset_classes" add column "id" integer not null default nextval('contract_asset_class_id_seq'::regclass);

alter table "public"."contract_asset_classes" add column "is_parent_tag" boolean not null default false;

alter table "public"."contract_asset_classes" alter column "sub_asset_class_id" drop not null;

alter table "public"."contract_asset_classes" alter column "sub_asset_class_id" set data type integer using "sub_asset_class_id"::integer;

alter sequence "public"."contract_asset_class_id_seq" owned by "public"."contract_asset_classes"."id";

CREATE UNIQUE INDEX contract_asset_class_contract_id_asset_class_id_sub_as_key ON public.contract_asset_classes USING btree (contract_id, asset_class_id, sub_asset_class_id);

CREATE UNIQUE INDEX contract_asset_class_pkey ON public.contract_asset_classes USING btree (id);

alter table "public"."contract_asset_classes" add constraint "contract_asset_class_pkey" PRIMARY KEY using index "contract_asset_class_pkey";

alter table "public"."contract_asset_classes" add constraint "contract_asset_class_asset_class_id_fkey" FOREIGN KEY (asset_class_id) REFERENCES asset_classes(id) not valid;

alter table "public"."contract_asset_classes" validate constraint "contract_asset_class_asset_class_id_fkey";

alter table "public"."contract_asset_classes" add constraint "contract_asset_class_contract_id_asset_class_id_sub_as_key" UNIQUE using index "contract_asset_class_contract_id_asset_class_id_sub_as_key";

alter table "public"."contract_asset_classes" add constraint "contract_asset_class_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES contracts(id) not valid;

alter table "public"."contract_asset_classes" validate constraint "contract_asset_class_contract_id_fkey";

alter table "public"."contract_asset_classes" add constraint "contract_asset_class_sub_asset_class_id_fkey" FOREIGN KEY (sub_asset_class_id) REFERENCES sub_asset_classes(id) not valid;

alter table "public"."contract_asset_classes" validate constraint "contract_asset_class_sub_asset_class_id_fkey";
