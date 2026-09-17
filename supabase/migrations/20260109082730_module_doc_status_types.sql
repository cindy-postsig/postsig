drop index if exists "public"."idx_docs_status";

alter table "public"."module_documents" drop column "status";

alter table "public"."module_documents" add column "status_id" bigint;

alter table "public"."module_documents" add constraint "module_documents_status_id_fkey" FOREIGN KEY (status_id) REFERENCES module_document_status_types(id) ON UPDATE CASCADE not valid;

alter table "public"."module_documents" validate constraint "module_documents_status_id_fkey";

grant delete on table "public"."module_document_status_types" to "postgres";

grant insert on table "public"."module_document_status_types" to "postgres";

grant references on table "public"."module_document_status_types" to "postgres";

grant select on table "public"."module_document_status_types" to "postgres";

grant trigger on table "public"."module_document_status_types" to "postgres";

grant truncate on table "public"."module_document_status_types" to "postgres";

grant update on table "public"."module_document_status_types" to "postgres";

CREATE INDEX idx_docs_status_id ON public.module_documents USING btree (status_id);
