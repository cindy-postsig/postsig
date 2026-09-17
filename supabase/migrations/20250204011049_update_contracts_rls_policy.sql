create policy "Users can update contracts in their org"
on "public"."contracts"
as permissive
for update
to authenticated
using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = contracts.user_id) AND (users.organization_id = ( SELECT users_1.organization_id
           FROM users users_1
          WHERE (users_1.id = auth.uid())))))));
