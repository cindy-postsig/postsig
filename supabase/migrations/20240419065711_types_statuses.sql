create policy "Select for authenticated users"
on "public"."contract_statuses"
as permissive
for select
to authenticated
using (true);


create policy "Select for authenticated users"
on "public"."contract_types"
as permissive
for select
to authenticated
using (true);



