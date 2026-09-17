drop policy "Enable select for users based on user_id" on "public"."contracts";

create policy "Give access to contract_docs for all extractors 2"
on "public"."contract_docs"
as permissive
for select
to public
using ((((auth.jwt() ->> 'email'::text) = 'ext_1@postsig.com'::text) OR ((auth.jwt() ->> 'email'::text) = 'extraction@postsig.com'::text)));


create policy "Users can select their own contract documents"
on "public"."contract_docs"
as permissive
for select
to public
using ((auth.uid() = user_id));


create policy "policy_name"
on "public"."contract_docs"
as permissive
for select
to public
using (((auth.jwt() ->> 'email'::text) = 'ext1@postsig.com'::text));


create policy "Enable update for extractors based on email"
on "public"."contracts"
as permissive
for update
to public
using ((((auth.jwt() ->> 'email'::text) = 'ext_1@postsig.com'::text) OR ((auth.jwt() ->> 'email'::text) = 'extraction@postsig.com'::text)))
with check ((((auth.jwt() ->> 'email'::text) = 'ext_1@postsig.com'::text) OR ((auth.jwt() ->> 'email'::text) = 'extraction@postsig.com'::text)));


create policy "Users can view their own contracts"
on "public"."contracts"
as permissive
for select
to public
using ((auth.uid() = user_id));


create policy "Enable insert for authenticated users only"
on "public"."vendors"
as permissive
for insert
to authenticated
with check (true);


create policy "Enable update for authenticated users only"
on "public"."vendors"
as permissive
for update
to authenticated
using (true)
with check (true);



