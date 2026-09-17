create sequence "public"."investor_security_id_seq";

create table "public"."investor_security" (
    "id" bigint not null default nextval('investor_security_id_seq'::regclass),
    "entity_id" bigint not null,
    "security_type" text,
    "series_name" text,
    "source_document_id" bigint,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."investor_security" enable row level security;

alter sequence "public"."investor_security_id_seq" owned by "public"."investor_security"."id";

CREATE INDEX investor_security_created_at_idx ON public.investor_security USING btree (created_at DESC);

CREATE INDEX investor_security_entity_id_idx ON public.investor_security USING btree (entity_id);

CREATE INDEX investor_security_series_name_idx ON public.investor_security USING btree (series_name);

CREATE INDEX investor_security_security_type_idx ON public.investor_security USING btree (security_type);

CREATE INDEX investor_security_source_document_id_idx ON public.investor_security USING btree (source_document_id);

CREATE UNIQUE INDEX investor_security_pkey ON public.investor_security USING btree (id);

alter table "public"."investor_security" add constraint "investor_security_pkey" PRIMARY KEY using index "investor_security_pkey";

alter table "public"."investor_security" add constraint "investor_security_entity_id_fkey" FOREIGN KEY (entity_id) REFERENCES module_entities(id) ON DELETE CASCADE not valid;

alter table "public"."investor_security" validate constraint "investor_security_entity_id_fkey";

alter table "public"."investor_security" add constraint "investor_security_source_document_id_fkey" FOREIGN KEY (source_document_id) REFERENCES module_document_files(id) ON DELETE SET NULL not valid;

alter table "public"."investor_security" validate constraint "investor_security_source_document_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_investor_security_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

grant delete on table "public"."investor_security" to "authenticated";

grant insert on table "public"."investor_security" to "authenticated";

grant references on table "public"."investor_security" to "authenticated";

grant select on table "public"."investor_security" to "authenticated";

grant trigger on table "public"."investor_security" to "authenticated";

grant truncate on table "public"."investor_security" to "authenticated";

grant update on table "public"."investor_security" to "authenticated";

grant delete on table "public"."investor_security" to "postgres";

grant insert on table "public"."investor_security" to "postgres";

grant references on table "public"."investor_security" to "postgres";

grant select on table "public"."investor_security" to "postgres";

grant trigger on table "public"."investor_security" to "postgres";

grant truncate on table "public"."investor_security" to "postgres";

grant update on table "public"."investor_security" to "postgres";

grant delete on table "public"."investor_security" to "service_role";

grant insert on table "public"."investor_security" to "service_role";

grant references on table "public"."investor_security" to "service_role";

grant select on table "public"."investor_security" to "service_role";

grant trigger on table "public"."investor_security" to "service_role";

grant truncate on table "public"."investor_security" to "service_role";

grant update on table "public"."investor_security" to "service_role";

create policy "investor_security_anon_deny"
on "public"."investor_security"
as permissive
for all
to anon
using (false);


create policy "investor_security_delete"
on "public"."investor_security"
as permissive
for delete
to authenticated
using (((entity_id IN ( SELECT me.id
   FROM module_entities me
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 12))))));


create policy "investor_security_insert"
on "public"."investor_security"
as permissive
for insert
to authenticated
with check (((entity_id IN ( SELECT me.id
   FROM module_entities me
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));


create policy "investor_security_select"
on "public"."investor_security"
as permissive
for select
to authenticated
using ((entity_id IN ( SELECT me.id
   FROM module_entities me
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))));


create policy "investor_security_update"
on "public"."investor_security"
as permissive
for update
to authenticated
using (((entity_id IN ( SELECT me.id
   FROM module_entities me
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))))
with check (((entity_id IN ( SELECT me.id
   FROM module_entities me
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));


CREATE TRIGGER audit_investor_security_trigger AFTER INSERT OR DELETE OR UPDATE ON public.investor_security FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER investor_security_updated_at_trigger BEFORE UPDATE ON public.investor_security FOR EACH ROW EXECUTE FUNCTION update_investor_security_updated_at();
