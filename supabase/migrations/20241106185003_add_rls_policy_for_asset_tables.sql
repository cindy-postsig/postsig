create policy "Enable read access for all users"
on "public"."asset_classes"
as permissive
for select
to authenticated
using (true);


create policy "Enable read access for all users"
on "public"."contract_asset_classes"
as permissive
for select
to authenticated
using (true);


create policy "Enable read access for all users"
on "public"."sub_asset_classes"
as permissive
for select
to authenticated
using (true);



