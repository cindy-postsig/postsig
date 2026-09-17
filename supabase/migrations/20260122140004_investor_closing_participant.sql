create sequence "public"."investor_closing_participant_id_seq";

create table "public"."investor_closing_participant" (
    "id" bigint not null default nextval('investor_closing_participant_id_seq'::regclass),
    "closing_id" bigint not null,
    "party_id" bigint not null,
    "role" text,
    "amount_paid" numeric,
    "shares_purchased" numeric,
    "security_id" bigint,
    "source_document_id" bigint,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."investor_closing_participant" enable row level security;

alter sequence "public"."investor_closing_participant_id_seq" owned by "public"."investor_closing_participant"."id";

CREATE INDEX investor_closing_participant_created_at_idx ON public.investor_closing_participant USING btree (created_at DESC);

CREATE INDEX investor_closing_participant_closing_id_idx ON public.investor_closing_participant USING btree (closing_id);

CREATE INDEX investor_closing_participant_party_id_idx ON public.investor_closing_participant USING btree (party_id);

CREATE INDEX investor_closing_participant_security_id_idx ON public.investor_closing_participant USING btree (security_id);

CREATE INDEX investor_closing_participant_source_document_id_idx ON public.investor_closing_participant USING btree (source_document_id);

CREATE UNIQUE INDEX investor_closing_participant_pkey ON public.investor_closing_participant USING btree (id);

CREATE UNIQUE INDEX investor_closing_participant_closing_party_key ON public.investor_closing_participant USING btree (closing_id, party_id);

alter table "public"."investor_closing_participant" add constraint "investor_closing_participant_pkey" PRIMARY KEY using index "investor_closing_participant_pkey";

alter table "public"."investor_closing_participant" add constraint "investor_closing_participant_closing_party_key" UNIQUE using index "investor_closing_participant_closing_party_key";

alter table "public"."investor_closing_participant" add constraint "investor_closing_participant_closing_id_fkey" FOREIGN KEY (closing_id) REFERENCES investor_closing(id) ON DELETE CASCADE not valid;

alter table "public"."investor_closing_participant" validate constraint "investor_closing_participant_closing_id_fkey";

alter table "public"."investor_closing_participant" add constraint "investor_closing_participant_party_id_fkey" FOREIGN KEY (party_id) REFERENCES investor_party(id) ON DELETE CASCADE not valid;

alter table "public"."investor_closing_participant" validate constraint "investor_closing_participant_party_id_fkey";

alter table "public"."investor_closing_participant" add constraint "investor_closing_participant_security_id_fkey" FOREIGN KEY (security_id) REFERENCES investor_security(id) ON DELETE SET NULL not valid;

alter table "public"."investor_closing_participant" validate constraint "investor_closing_participant_security_id_fkey";

alter table "public"."investor_closing_participant" add constraint "investor_closing_participant_source_document_id_fkey" FOREIGN KEY (source_document_id) REFERENCES module_document_files(id) ON DELETE SET NULL not valid;

alter table "public"."investor_closing_participant" validate constraint "investor_closing_participant_source_document_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_investor_closing_participant_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

grant delete on table "public"."investor_closing_participant" to "authenticated";

grant insert on table "public"."investor_closing_participant" to "authenticated";

grant references on table "public"."investor_closing_participant" to "authenticated";

grant select on table "public"."investor_closing_participant" to "authenticated";

grant trigger on table "public"."investor_closing_participant" to "authenticated";

grant truncate on table "public"."investor_closing_participant" to "authenticated";

grant update on table "public"."investor_closing_participant" to "authenticated";

grant delete on table "public"."investor_closing_participant" to "postgres";

grant insert on table "public"."investor_closing_participant" to "postgres";

grant references on table "public"."investor_closing_participant" to "postgres";

grant select on table "public"."investor_closing_participant" to "postgres";

grant trigger on table "public"."investor_closing_participant" to "postgres";

grant truncate on table "public"."investor_closing_participant" to "postgres";

grant update on table "public"."investor_closing_participant" to "postgres";

grant delete on table "public"."investor_closing_participant" to "service_role";

grant insert on table "public"."investor_closing_participant" to "service_role";

grant references on table "public"."investor_closing_participant" to "service_role";

grant select on table "public"."investor_closing_participant" to "service_role";

grant trigger on table "public"."investor_closing_participant" to "service_role";

grant truncate on table "public"."investor_closing_participant" to "service_role";

grant update on table "public"."investor_closing_participant" to "service_role";

create policy "investor_closing_participant_anon_deny"
on "public"."investor_closing_participant"
as permissive
for all
to anon
using (false);


create policy "investor_closing_participant_delete"
on "public"."investor_closing_participant"
as permissive
for delete
to authenticated
using (((closing_id IN ( SELECT ic.id
   FROM investor_closing ic
   JOIN investor_financing_event ife ON ife.id = ic.event_id
   JOIN module_entities me ON me.id = ife.entity_id
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 12))))));


create policy "investor_closing_participant_insert"
on "public"."investor_closing_participant"
as permissive
for insert
to authenticated
with check (((closing_id IN ( SELECT ic.id
   FROM investor_closing ic
   JOIN investor_financing_event ife ON ife.id = ic.event_id
   JOIN module_entities me ON me.id = ife.entity_id
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));


create policy "investor_closing_participant_select"
on "public"."investor_closing_participant"
as permissive
for select
to authenticated
using ((closing_id IN ( SELECT ic.id
   FROM investor_closing ic
   JOIN investor_financing_event ife ON ife.id = ic.event_id
   JOIN module_entities me ON me.id = ife.entity_id
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))));


create policy "investor_closing_participant_update"
on "public"."investor_closing_participant"
as permissive
for update
to authenticated
using (((closing_id IN ( SELECT ic.id
   FROM investor_closing ic
   JOIN investor_financing_event ife ON ife.id = ic.event_id
   JOIN module_entities me ON me.id = ife.entity_id
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))))
with check (((closing_id IN ( SELECT ic.id
   FROM investor_closing ic
   JOIN investor_financing_event ife ON ife.id = ic.event_id
   JOIN module_entities me ON me.id = ife.entity_id
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));


CREATE TRIGGER audit_investor_closing_participant_trigger AFTER INSERT OR DELETE OR UPDATE ON public.investor_closing_participant FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER investor_closing_participant_updated_at_trigger BEFORE UPDATE ON public.investor_closing_participant FOR EACH ROW EXECUTE FUNCTION update_investor_closing_participant_updated_at();
