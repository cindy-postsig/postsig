create policy "Allow authorized select access based on role permissions"
on "public"."contracts"
as permissive
for select
to authenticated
using (authorize('contracts.select'::app_permission));



