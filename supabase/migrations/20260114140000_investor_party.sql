create sequence "public"."investor_party_id_seq";

create table "public"."investor_party" (
    "id" bigint not null default nextval('investor_party_id_seq'::regclass),
    "organization_id" uuid not null,
    "name" text not null,
    "party_type" text,
    "email" text,
    "metadata" jsonb not null default '{}'::jsonb,
    "is_self" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."investor_party" enable row level security;

alter sequence "public"."investor_party_id_seq" owned by "public"."investor_party"."id";

CREATE INDEX investor_party_is_self_idx
  ON public.investor_party USING btree (organization_id, is_self);

CREATE INDEX investor_party_created_at_idx ON public.investor_party USING btree (created_at DESC);

CREATE INDEX investor_party_organization_id_idx ON public.investor_party USING btree (organization_id);

CREATE INDEX investor_party_name_idx ON public.investor_party USING btree (name);

CREATE UNIQUE INDEX investor_party_org_name_key ON public.investor_party USING btree (organization_id, name);

CREATE UNIQUE INDEX investor_party_pkey ON public.investor_party USING btree (id);

alter table "public"."investor_party" add constraint "investor_party_pkey" PRIMARY KEY using index "investor_party_pkey";

alter table "public"."investor_party" add constraint "investor_party_org_name_key" UNIQUE using index "investor_party_org_name_key";

alter table "public"."investor_party" add constraint "investor_party_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."investor_party" validate constraint "investor_party_organization_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_investor_party_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

grant select on table "public"."investor_party" to "authenticated";

grant references on table "public"."investor_party" to "authenticated";

grant trigger on table "public"."investor_party" to "authenticated";

grant references on table "public"."investor_party" to "authenticated";

grant delete on table "public"."investor_party" to "postgres";

grant insert on table "public"."investor_party" to "postgres";

grant references on table "public"."investor_party" to "postgres";

grant select on table "public"."investor_party" to "postgres";

grant trigger on table "public"."investor_party" to "postgres";

grant truncate on table "public"."investor_party" to "postgres";

grant update on table "public"."investor_party" to "postgres";

grant delete on table "public"."investor_party" to "service_role";

grant insert on table "public"."investor_party" to "service_role";

grant references on table "public"."investor_party" to "service_role";

grant select on table "public"."investor_party" to "service_role";

grant trigger on table "public"."investor_party" to "service_role";

grant truncate on table "public"."investor_party" to "service_role";

grant update on table "public"."investor_party" to "service_role";

create policy "investor_party_anon_deny"
on "public"."investor_party"
as permissive
for all
to anon
using (false);

create policy "investor_party_select"
on "public"."investor_party"
as permissive
for select
to authenticated
using ((organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid()))));

CREATE TRIGGER audit_investor_party_trigger AFTER INSERT OR DELETE OR UPDATE ON public.investor_party FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER investor_party_updated_at_trigger BEFORE UPDATE ON public.investor_party FOR EACH ROW EXECUTE FUNCTION update_investor_party_updated_at();
