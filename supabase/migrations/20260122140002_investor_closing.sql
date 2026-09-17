create sequence "public"."investor_closing_id_seq";

create table "public"."investor_closing" (
    "id" bigint not null default nextval('investor_closing_id_seq'::regclass),
    "event_id" bigint not null,
    "close_date" date,
    "currency" text not null default 'USD'::text,
    "total_raised" numeric,
    "post_money_valuation" numeric,
    "posting_key" text,
    "source_document_id" bigint,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."investor_closing" enable row level security;

alter sequence "public"."investor_closing_id_seq" owned by "public"."investor_closing"."id";

CREATE INDEX investor_closing_created_at_idx ON public.investor_closing USING btree (created_at DESC);

CREATE INDEX investor_closing_event_id_idx ON public.investor_closing USING btree (event_id);

CREATE INDEX investor_closing_close_date_idx ON public.investor_closing USING btree (close_date);

CREATE INDEX investor_closing_source_document_id_idx ON public.investor_closing USING btree (source_document_id);

CREATE UNIQUE INDEX investor_closing_pkey ON public.investor_closing USING btree (id);

alter table "public"."investor_closing" add constraint "investor_closing_pkey" PRIMARY KEY using index "investor_closing_pkey";

alter table "public"."investor_closing" add constraint "investor_closing_event_id_fkey" FOREIGN KEY (event_id) REFERENCES investor_financing_event(id) ON DELETE CASCADE not valid;

alter table "public"."investor_closing" validate constraint "investor_closing_event_id_fkey";

alter table "public"."investor_closing" add constraint "investor_closing_source_document_id_fkey" FOREIGN KEY (source_document_id) REFERENCES module_document_files(id) ON DELETE SET NULL not valid;

alter table "public"."investor_closing" validate constraint "investor_closing_source_document_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_investor_closing_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

grant delete on table "public"."investor_closing" to "authenticated";

grant insert on table "public"."investor_closing" to "authenticated";

grant references on table "public"."investor_closing" to "authenticated";

grant select on table "public"."investor_closing" to "authenticated";

grant trigger on table "public"."investor_closing" to "authenticated";

grant truncate on table "public"."investor_closing" to "authenticated";

grant update on table "public"."investor_closing" to "authenticated";

grant delete on table "public"."investor_closing" to "postgres";

grant insert on table "public"."investor_closing" to "postgres";

grant references on table "public"."investor_closing" to "postgres";

grant select on table "public"."investor_closing" to "postgres";

grant trigger on table "public"."investor_closing" to "postgres";

grant truncate on table "public"."investor_closing" to "postgres";

grant update on table "public"."investor_closing" to "postgres";

grant delete on table "public"."investor_closing" to "service_role";

grant insert on table "public"."investor_closing" to "service_role";

grant references on table "public"."investor_closing" to "service_role";

grant select on table "public"."investor_closing" to "service_role";

grant trigger on table "public"."investor_closing" to "service_role";

grant truncate on table "public"."investor_closing" to "service_role";

grant update on table "public"."investor_closing" to "service_role";

create policy "investor_closing_anon_deny"
on "public"."investor_closing"
as permissive
for all
to anon
using (false);


create policy "investor_closing_delete"
on "public"."investor_closing"
as permissive
for delete
to authenticated
using (((event_id IN ( SELECT ife.id
   FROM investor_financing_event ife
   JOIN module_entities me ON me.id = ife.entity_id
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 12))))));


create policy "investor_closing_insert"
on "public"."investor_closing"
as permissive
for insert
to authenticated
with check (((event_id IN ( SELECT ife.id
   FROM investor_financing_event ife
   JOIN module_entities me ON me.id = ife.entity_id
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));


create policy "investor_closing_select"
on "public"."investor_closing"
as permissive
for select
to authenticated
using ((event_id IN ( SELECT ife.id
   FROM investor_financing_event ife
   JOIN module_entities me ON me.id = ife.entity_id
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))));


create policy "investor_closing_update"
on "public"."investor_closing"
as permissive
for update
to authenticated
using (((event_id IN ( SELECT ife.id
   FROM investor_financing_event ife
   JOIN module_entities me ON me.id = ife.entity_id
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))))
with check (((event_id IN ( SELECT ife.id
   FROM investor_financing_event ife
   JOIN module_entities me ON me.id = ife.entity_id
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));


CREATE TRIGGER audit_investor_closing_trigger AFTER INSERT OR DELETE OR UPDATE ON public.investor_closing FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER investor_closing_updated_at_trigger BEFORE UPDATE ON public.investor_closing FOR EACH ROW EXECUTE FUNCTION update_investor_closing_updated_at();
