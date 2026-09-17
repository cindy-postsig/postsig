alter table "public"."inv_company" add column "stage_id" bigint;
alter table "public"."inv_company" add column "entry_stage_id" bigint;

alter table "public"."inv_company"
  add constraint "inv_company_stage_id_fkey"
  foreign key ("stage_id") references "public"."inv_stages"("id")
  on delete set null;

alter table "public"."inv_company"
  add constraint "inv_company_entry_stage_id_fkey"
  foreign key ("entry_stage_id") references "public"."inv_stages"("id")
  on delete set null;

CREATE INDEX idx_inv_company_stage ON public.inv_company USING btree (stage_id) WHERE (stage_id IS NOT NULL);
CREATE INDEX idx_inv_company_entry_stage ON public.inv_company USING btree (entry_stage_id) WHERE (entry_stage_id IS NOT NULL);