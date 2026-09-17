alter table "public"."contract_users" drop constraint "contract_users_email_key";

CREATE UNIQUE INDEX contract_users_contract_email_unique ON public.contract_users USING btree (contract_id, email);

alter table "public"."contract_users" add constraint "contract_users_contract_email_unique" UNIQUE using index "contract_users_contract_email_unique";
