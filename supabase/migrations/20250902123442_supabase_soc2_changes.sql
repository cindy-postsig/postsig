create policy "Enable delete for authenticated users only"
on "public"."contract_tags"
as permissive
for delete
to authenticated
using (true);



