alter table "public"."contract_citations" add column "locked_by" uuid;

alter table "public"."contract_citations" add column "locked_by_email" character varying(255);

CREATE INDEX idx_contract_citations_locked_by ON public.contract_citations USING btree (locked_by);

alter table "public"."contract_citations" add constraint "contract_citations_locked_by_fkey" FOREIGN KEY (locked_by) REFERENCES users(id) not valid;

alter table "public"."contract_citations" validate constraint "contract_citations_locked_by_fkey";


