create sequence "public"."investor_security_terms_version_id_seq";

create table "public"."investor_security_terms_version" (
    "id" bigint not null default nextval('investor_security_terms_version_id_seq'::regclass),
    "security_id" bigint not null,
    "effective_date" date,
    "original_issue_price" numeric,
    "conversion_ratio" numeric,
    "anti_dilution_type" text,
    "liquidation_preference_multiple" numeric,
    "participation_cap" numeric,
    "dividend_rate" numeric,
    "preference_order" integer,
    "is_participating" boolean,
    "terms" jsonb not null default '{}'::jsonb,
    "derived_from" jsonb not null default '{}'::jsonb,
    "source_document_id" bigint,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."investor_security_terms_version" enable row level security;

alter sequence "public"."investor_security_terms_version_id_seq" owned by "public"."investor_security_terms_version"."id";

CREATE INDEX investor_security_terms_version_created_at_idx ON public.investor_security_terms_version USING btree (created_at DESC);

CREATE INDEX investor_security_terms_version_security_id_idx ON public.investor_security_terms_version USING btree (security_id);

CREATE INDEX investor_security_terms_version_effective_date_idx ON public.investor_security_terms_version USING btree (effective_date);

CREATE INDEX investor_security_terms_version_source_document_id_idx ON public.investor_security_terms_version USING btree (source_document_id);

CREATE UNIQUE INDEX investor_security_terms_version_pkey ON public.investor_security_terms_version USING btree (id);

alter table "public"."investor_security_terms_version" add constraint "investor_security_terms_version_pkey" PRIMARY KEY using index "investor_security_terms_version_pkey";

alter table "public"."investor_security_terms_version" add constraint "investor_security_terms_version_security_id_fkey" FOREIGN KEY (security_id) REFERENCES investor_security(id) ON DELETE CASCADE not valid;

alter table "public"."investor_security_terms_version" validate constraint "investor_security_terms_version_security_id_fkey";

alter table "public"."investor_security_terms_version" add constraint "investor_security_terms_version_source_document_id_fkey" FOREIGN KEY (source_document_id) REFERENCES module_document_files(id) ON DELETE SET NULL not valid;

alter table "public"."investor_security_terms_version" validate constraint "investor_security_terms_version_source_document_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_investor_security_terms_version_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

grant delete on table "public"."investor_security_terms_version" to "authenticated";

grant insert on table "public"."investor_security_terms_version" to "authenticated";

grant references on table "public"."investor_security_terms_version" to "authenticated";

grant select on table "public"."investor_security_terms_version" to "authenticated";

grant trigger on table "public"."investor_security_terms_version" to "authenticated";

grant truncate on table "public"."investor_security_terms_version" to "authenticated";

grant update on table "public"."investor_security_terms_version" to "authenticated";

grant delete on table "public"."investor_security_terms_version" to "postgres";

grant insert on table "public"."investor_security_terms_version" to "postgres";

grant references on table "public"."investor_security_terms_version" to "postgres";

grant select on table "public"."investor_security_terms_version" to "postgres";

grant trigger on table "public"."investor_security_terms_version" to "postgres";

grant truncate on table "public"."investor_security_terms_version" to "postgres";

grant update on table "public"."investor_security_terms_version" to "postgres";

grant delete on table "public"."investor_security_terms_version" to "service_role";

grant insert on table "public"."investor_security_terms_version" to "service_role";

grant references on table "public"."investor_security_terms_version" to "service_role";

grant select on table "public"."investor_security_terms_version" to "service_role";

grant trigger on table "public"."investor_security_terms_version" to "service_role";

grant truncate on table "public"."investor_security_terms_version" to "service_role";

grant update on table "public"."investor_security_terms_version" to "service_role";

create policy "investor_security_terms_version_anon_deny"
on "public"."investor_security_terms_version"
as permissive
for all
to anon
using (false);


create policy "investor_security_terms_version_delete"
on "public"."investor_security_terms_version"
as permissive
for delete
to authenticated
using (((security_id IN ( SELECT isec.id
   FROM investor_security isec
   JOIN module_entities me ON me.id = isec.entity_id
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 12))))));


create policy "investor_security_terms_version_insert"
on "public"."investor_security_terms_version"
as permissive
for insert
to authenticated
with check (((security_id IN ( SELECT isec.id
   FROM investor_security isec
   JOIN module_entities me ON me.id = isec.entity_id
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));


create policy "investor_security_terms_version_select"
on "public"."investor_security_terms_version"
as permissive
for select
to authenticated
using ((security_id IN ( SELECT isec.id
   FROM investor_security isec
   JOIN module_entities me ON me.id = isec.entity_id
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))));


create policy "investor_security_terms_version_update"
on "public"."investor_security_terms_version"
as permissive
for update
to authenticated
using (((security_id IN ( SELECT isec.id
   FROM investor_security isec
   JOIN module_entities me ON me.id = isec.entity_id
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))))
with check (((security_id IN ( SELECT isec.id
   FROM investor_security isec
   JOIN module_entities me ON me.id = isec.entity_id
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));


CREATE TRIGGER audit_investor_security_terms_version_trigger AFTER INSERT OR DELETE OR UPDATE ON public.investor_security_terms_version FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER investor_security_terms_version_updated_at_trigger BEFORE UPDATE ON public.investor_security_terms_version FOR EACH ROW EXECUTE FUNCTION update_investor_security_terms_version_updated_at();
