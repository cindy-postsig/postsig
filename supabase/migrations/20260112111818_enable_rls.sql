create policy "Enable read access for auth users"
on "public"."app_modules"
as permissive
for select
to authenticated
using (true);


create policy "Enable read access for auth users"
on "public"."document_type_fields"
as permissive
for select
to authenticated
using (true);



