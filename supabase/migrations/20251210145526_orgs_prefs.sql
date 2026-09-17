drop policy "Enable all for authenticated users" on "public"."org_preferences";

create policy "Users with role 11 or 12 can view org preferences"
on "public"."org_preferences"
as permissive
for select
to authenticated
using (((organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));


create policy "Users with role 12 can delete org preferences"
on "public"."org_preferences"
as permissive
for delete
to authenticated
using (((organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 12))))));


create policy "Users with role 12 can insert org preferences"
on "public"."org_preferences"
as permissive
for insert
to authenticated
with check (((organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 12))))));


create policy "Users with role 12 can update org preferences"
on "public"."org_preferences"
as permissive
for update
to authenticated
using (((organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 12))))))
with check (((organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 12))))));



