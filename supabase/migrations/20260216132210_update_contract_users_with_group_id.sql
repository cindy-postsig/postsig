--- Update contract_users table to replace business_group with group_id

alter table "public"."contract_users" drop column "business_group";

alter table "public"."contract_users" add column "group_id" bigint;

alter table "public"."contract_users" add constraint "contract_users_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) not valid;

alter table "public"."contract_users" validate constraint "contract_users_group_id_fkey";
