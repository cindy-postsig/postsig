create table "public"."document_type_fields" (
    "id" uuid not null default uuid_generate_v4(),
    "document_type_id" bigint not null,
    "master_field_definition_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);

CREATE UNIQUE INDEX document_type_fields_pkey ON public.document_type_fields USING btree (id);

CREATE UNIQUE INDEX document_type_fields_document_type_id_master_field_definition_id_key ON public.document_type_fields USING btree (document_type_id, master_field_definition_id);

alter table "public"."document_type_fields" add constraint "document_type_fields_pkey" PRIMARY KEY using index "document_type_fields_pkey";

alter table "public"."document_type_fields" add constraint "document_type_fields_document_type_id_fkey" FOREIGN KEY (document_type_id) REFERENCES document_types(id) not valid;

alter table "public"."document_type_fields" validate constraint "document_type_fields_document_type_id_fkey";

alter table "public"."document_type_fields" add constraint "document_type_fields_master_field_definition_id_fkey" FOREIGN KEY (master_field_definition_id) REFERENCES master_field_definitions(id) not valid;

alter table "public"."document_type_fields" validate constraint "document_type_fields_master_field_definition_id_fkey";

alter table "public"."document_type_fields" add constraint "document_type_fields_document_type_id_master_field_definition_id_key" UNIQUE using index "document_type_fields_document_type_id_master_field_definition_id_key";
