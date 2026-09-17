CREATE UNIQUE INDEX organization_name_unique ON public.organizations USING btree (name);

alter table "public"."organizations" add constraint "organization_name_unique" UNIQUE using index "organization_name_unique";