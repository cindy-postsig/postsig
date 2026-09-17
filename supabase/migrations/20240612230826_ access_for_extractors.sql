create policy "All access to extractors"
on "public"."vendor_products"
as permissive
for all
to public
using ((((auth.jwt() ->> 'email'::text) = 'ext_1@postsig.com'::text) OR ((auth.jwt() ->> 'email'::text) = 'extraction@postsig.com'::text)));

create policy "All access to extractors"
on "public"."vendor_products_details"
as permissive
for all
to public
using ((((auth.jwt() ->> 'email'::text) = 'ext_1@postsig.com'::text) OR ((auth.jwt() ->> 'email'::text) = 'extraction@postsig.com'::text)));