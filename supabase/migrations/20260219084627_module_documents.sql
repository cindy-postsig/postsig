alter table "public"."module_documents" add column "company_id" bigint;

alter table "public"."module_documents" add constraint "module_documents_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.inv_company(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."module_documents" validate constraint "module_documents_company_id_fkey";

