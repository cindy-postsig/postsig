CREATE UNIQUE INDEX organizations_domain_key ON public.organizations USING btree (domain);

CREATE UNIQUE INDEX unique_postsig_email_address ON public.organizations USING btree (postsig_email_address);

alter table "public"."organizations" add constraint "organizations_domain_key" UNIQUE using index "organizations_domain_key";

alter table "public"."organizations" add constraint "unique_postsig_email_address" UNIQUE using index "unique_postsig_email_address";


