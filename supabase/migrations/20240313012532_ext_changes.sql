drop policy "Enable read access for all users" on "public"."contracts";

alter table "public"."contracts" add column "cancellation_process" text;

alter table "public"."contracts" add column "distribution_rights" character varying;

alter table "public"."contracts" add column "execution_date" date;

alter table "public"."contracts" add column "geo_restrictions" character varying;

alter table "public"."contracts" add column "marketing_rights" character varying;

alter table "public"."contracts" add column "permissions" text;

alter table "public"."contracts" add column "renewal_period" text;

alter table "public"."contracts" add column "scope_of_use" text;

alter table "public"."contracts" add column "suspension_of_service" text;

alter table "public"."contracts" alter column "updated_at" set data type timestamp without time zone using "updated_at"::timestamp without time zone;

alter table "public"."vendors" enable row level security;

create policy "Enable select for users based on user_id"
on "public"."contracts"
as permissive
for select
to public
using ((auth.uid() = user_id));


create policy "Give full access to extractors"
on "public"."contracts"
as permissive
for select
to authenticated
using (((auth.jwt() ->> 'email'::text) = 'ext_1@postsig.com'::text));


create policy "Enable select for authenticated users only"
on "public"."vendors"
as permissive
for select
to authenticated
using (true);



