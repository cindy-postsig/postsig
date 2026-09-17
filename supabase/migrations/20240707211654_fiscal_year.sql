alter table "public"."organizations" drop column "fiscal_year_start";

alter table "public"."organizations" add column "fiscal_year_start_month" smallint default '1'::smallint;

create policy "Enable update for authenticated users only"
on "public"."organizations"
as permissive
for update
to authenticated
using (true)
with check (true);
