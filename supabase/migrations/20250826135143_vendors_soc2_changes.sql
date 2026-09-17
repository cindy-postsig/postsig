create policy "Enable read access for authenticated users only"
on "public"."vendor_products"
as permissive
for select
to authenticated
using (true);


create policy "Enable select for authenticated users only"
on "public"."vendors"
as permissive
for select
to authenticated
using (true);



