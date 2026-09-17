alter table "public"."contract_citations" add column "status_id" bigint;

alter table "public"."contract_citations" add constraint "contract_citations_status_id_fkey" FOREIGN KEY (status_id) REFERENCES contract_statuses(id) ON UPDATE CASCADE not valid;

alter table "public"."contract_citations" validate constraint "contract_citations_status_id_fkey";