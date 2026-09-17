alter table "public"."contract_docs" add column "user_id" uuid;

alter table "public"."contract_docs" enable row level security;

alter table "public"."contracts" add column "updated_at" timestamp with time zone;

alter table "public"."contract_docs" add constraint "contract_docs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."contract_docs" validate constraint "contract_docs_user_id_fkey";

create policy "Enable insert for authenticated users only"
on "public"."contract_docs"
as permissive
for insert
to authenticated
with check (true);


create policy "Enable read access for all users"
on "public"."contracts"
as permissive
for select
to authenticated
using ((auth.uid() = user_id));


create policy "Users can insert into contracts"
on "public"."contracts"
as permissive
for insert
to authenticated
with check (true);



