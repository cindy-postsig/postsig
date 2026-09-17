drop policy "policy_name" on "public"."contract_docs";

drop policy "Give full access to extractors" on "public"."contracts";

create policy "Enable insert for extractors"
on "public"."contract_docs"
as permissive
for insert
to authenticated
with check ((((auth.jwt() ->> 'email'::text) = 'ext_1@postsig.com'::text) OR ((auth.jwt() ->> 'email'::text) = 'extraction@postsig.com'::text)));


create policy "Enable insert for extractors"
on "public"."vendors"
as permissive
for insert
to authenticated
with check ((((auth.jwt() ->> 'email'::text) = 'ext_1@postsig.com'::text) OR ((auth.jwt() ->> 'email'::text) = 'extraction@postsig.com'::text)));


create policy "Give full access to extractors"
on "public"."contracts"
as permissive
for select
to authenticated
using ((((auth.jwt() ->> 'email'::text) = 'ext_1@postsig.com'::text) OR ((auth.jwt() ->> 'email'::text) = 'extraction@postsig.com'::text)));



