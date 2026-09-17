create policy "Allow authenticated uploads"
on "storage"."objects"
as permissive
for insert
to public
with check (((bucket_id = 'contract_docs'::text) AND (auth.role() = 'authenticated'::text)));


create policy "Give access to contract_docs for all extractors 2 1qjs288_0"
on "storage"."objects"
as permissive
for select
to public
using (((bucket_id = 'contract_docs'::text) AND ((storage.foldername(name))[2] = 'contract_docs'::text) AND (((auth.jwt() ->> 'email'::text) = 'ext1_postsig.com'::text) OR ((auth.jwt() ->> 'email'::text) = 'extraction_postsig.com'::text))));


create policy "Give access to contract_docs for all extractors 2"
on "storage"."objects"
as permissive
for select
to public
using (((bucket_id = 'contract_docs'::text) AND (((auth.jwt() ->> 'email'::text) = 'ext_1@postsig.com'::text) OR ((auth.jwt() ->> 'email'::text) = 'extraction@postsig.com'::text))));


create policy "Give access to contract_docs for all extractors"
on "storage"."objects"
as permissive
for select
to public
using (((bucket_id = 'contract_docs'::text) AND ((storage.foldername(name))[2] = 'contract_docs'::text) AND (((auth.jwt() ->> 'email'::text) = 'ext_1@postsig.com'::text) OR ((auth.jwt() ->> 'email'::text) = 'extraction@postsig.com'::text))));


create policy "Give users access to own folder 1qjs288_3"
on "storage"."objects"
as permissive
for delete
to public
using (((bucket_id = 'contract_docs'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



