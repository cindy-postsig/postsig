create sequence "public"."investor_funds_id_seq";

create table "public"."investor_funds" (
    "id" bigint not null default nextval('investor_funds_id_seq'::regclass),
    "public_id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "name" text not null,
    "code" text not null,
    "short_name" text not null,
    "status" text not null default 'active'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."investor_funds" enable row level security;

alter sequence "public"."investor_funds_id_seq" owned by "public"."investor_funds"."id";

CREATE INDEX investor_funds_created_at_idx ON public.investor_funds USING btree (created_at DESC);

CREATE UNIQUE INDEX investor_funds_org_name_key ON public.investor_funds USING btree (organization_id, name);

CREATE INDEX investor_funds_organization_id_idx ON public.investor_funds USING btree (organization_id);

CREATE UNIQUE INDEX investor_funds_pkey ON public.investor_funds USING btree (id);

CREATE UNIQUE INDEX investor_funds_public_id_key ON public.investor_funds USING btree (public_id);

CREATE INDEX investor_funds_status_idx ON public.investor_funds USING btree (status);

alter table "public"."investor_funds" add constraint "investor_funds_pkey" PRIMARY KEY using index "investor_funds_pkey";

alter table "public"."investor_funds" add constraint "investor_funds_org_name_key" UNIQUE using index "investor_funds_org_name_key";

alter table "public"."investor_funds" add constraint "investor_funds_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."investor_funds" validate constraint "investor_funds_organization_id_fkey";

alter table "public"."investor_funds" add constraint "investor_funds_public_id_key" UNIQUE using index "investor_funds_public_id_key";

alter table "public"."investor_funds" add constraint "investor_funds_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))) not valid;

alter table "public"."investor_funds" validate constraint "investor_funds_status_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_investor_funds_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

grant delete on table "public"."investor_funds" to "anon";

grant insert on table "public"."investor_funds" to "anon";

grant references on table "public"."investor_funds" to "anon";

grant select on table "public"."investor_funds" to "anon";

grant trigger on table "public"."investor_funds" to "anon";

grant truncate on table "public"."investor_funds" to "anon";

grant update on table "public"."investor_funds" to "anon";

grant delete on table "public"."investor_funds" to "authenticated";

grant insert on table "public"."investor_funds" to "authenticated";

grant references on table "public"."investor_funds" to "authenticated";

grant select on table "public"."investor_funds" to "authenticated";

grant trigger on table "public"."investor_funds" to "authenticated";

grant truncate on table "public"."investor_funds" to "authenticated";

grant update on table "public"."investor_funds" to "authenticated";

grant delete on table "public"."investor_funds" to "postgres";

grant insert on table "public"."investor_funds" to "postgres";

grant references on table "public"."investor_funds" to "postgres";

grant select on table "public"."investor_funds" to "postgres";

grant trigger on table "public"."investor_funds" to "postgres";

grant truncate on table "public"."investor_funds" to "postgres";

grant update on table "public"."investor_funds" to "postgres";

grant delete on table "public"."investor_funds" to "service_role";

grant insert on table "public"."investor_funds" to "service_role";

grant references on table "public"."investor_funds" to "service_role";

grant select on table "public"."investor_funds" to "service_role";

grant trigger on table "public"."investor_funds" to "service_role";

grant truncate on table "public"."investor_funds" to "service_role";

grant update on table "public"."investor_funds" to "service_role";

create policy "investor_funds_anon_deny"
on "public"."investor_funds"
as permissive
for all
to anon
using (false);


create policy "investor_funds_delete"
on "public"."investor_funds"
as permissive
for delete
to authenticated
using (((organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 12))))));


create policy "investor_funds_insert"
on "public"."investor_funds"
as permissive
for insert
to authenticated
with check (((organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));


create policy "investor_funds_select"
on "public"."investor_funds"
as permissive
for select
to authenticated
using ((organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid()))));


create policy "investor_funds_update"
on "public"."investor_funds"
as permissive
for update
to authenticated
using (((organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))))
with check (((organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));


CREATE TRIGGER audit_investor_funds_trigger AFTER INSERT OR DELETE OR UPDATE ON public.investor_funds FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER investor_funds_updated_at_trigger BEFORE UPDATE ON public.investor_funds FOR EACH ROW EXECUTE FUNCTION update_investor_funds_updated_at();


