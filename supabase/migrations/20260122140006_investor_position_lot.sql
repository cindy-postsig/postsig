create sequence "public"."investor_position_lot_id_seq";

create table "public"."investor_position_lot" (
    "id" bigint not null default nextval('investor_position_lot_id_seq'::regclass),
    "party_id" bigint not null,
    "security_id" bigint not null,
    "acquired_date" date,
    "units" numeric,
    "cost_per_unit" numeric,
    "total_cost" numeric,
    "currency" text not null default 'USD'::text,
    "source_closing_id" bigint,
    "source_document_id" bigint,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."investor_position_lot" enable row level security;

alter sequence "public"."investor_position_lot_id_seq" owned by "public"."investor_position_lot"."id";

CREATE INDEX investor_position_lot_created_at_idx ON public.investor_position_lot USING btree (created_at DESC);

CREATE INDEX investor_position_lot_party_id_idx ON public.investor_position_lot USING btree (party_id);

CREATE INDEX investor_position_lot_security_id_idx ON public.investor_position_lot USING btree (security_id);

CREATE INDEX investor_position_lot_acquired_date_idx ON public.investor_position_lot USING btree (acquired_date);

CREATE INDEX investor_position_lot_source_closing_id_idx ON public.investor_position_lot USING btree (source_closing_id);

CREATE INDEX investor_position_lot_source_document_id_idx ON public.investor_position_lot USING btree (source_document_id);

CREATE UNIQUE INDEX investor_position_lot_pkey ON public.investor_position_lot USING btree (id);

alter table "public"."investor_position_lot" add constraint "investor_position_lot_pkey" PRIMARY KEY using index "investor_position_lot_pkey";

alter table "public"."investor_position_lot" add constraint "investor_position_lot_party_id_fkey" FOREIGN KEY (party_id) REFERENCES investor_party(id) ON DELETE CASCADE not valid;

alter table "public"."investor_position_lot" validate constraint "investor_position_lot_party_id_fkey";

alter table "public"."investor_position_lot" add constraint "investor_position_lot_security_id_fkey" FOREIGN KEY (security_id) REFERENCES investor_security(id) ON DELETE CASCADE not valid;

alter table "public"."investor_position_lot" validate constraint "investor_position_lot_security_id_fkey";

alter table "public"."investor_position_lot" add constraint "investor_position_lot_source_closing_id_fkey" FOREIGN KEY (source_closing_id) REFERENCES investor_closing(id) ON DELETE SET NULL not valid;

alter table "public"."investor_position_lot" validate constraint "investor_position_lot_source_closing_id_fkey";

alter table "public"."investor_position_lot" add constraint "investor_position_lot_source_document_id_fkey" FOREIGN KEY (source_document_id) REFERENCES module_document_files(id) ON DELETE SET NULL not valid;

alter table "public"."investor_position_lot" validate constraint "investor_position_lot_source_document_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_investor_position_lot_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

grant delete on table "public"."investor_position_lot" to "authenticated";

grant insert on table "public"."investor_position_lot" to "authenticated";

grant references on table "public"."investor_position_lot" to "authenticated";

grant select on table "public"."investor_position_lot" to "authenticated";

grant trigger on table "public"."investor_position_lot" to "authenticated";

grant truncate on table "public"."investor_position_lot" to "authenticated";

grant update on table "public"."investor_position_lot" to "authenticated";

grant delete on table "public"."investor_position_lot" to "postgres";

grant insert on table "public"."investor_position_lot" to "postgres";

grant references on table "public"."investor_position_lot" to "postgres";

grant select on table "public"."investor_position_lot" to "postgres";

grant trigger on table "public"."investor_position_lot" to "postgres";

grant truncate on table "public"."investor_position_lot" to "postgres";

grant update on table "public"."investor_position_lot" to "postgres";

grant delete on table "public"."investor_position_lot" to "service_role";

grant insert on table "public"."investor_position_lot" to "service_role";

grant references on table "public"."investor_position_lot" to "service_role";

grant select on table "public"."investor_position_lot" to "service_role";

grant trigger on table "public"."investor_position_lot" to "service_role";

grant truncate on table "public"."investor_position_lot" to "service_role";

grant update on table "public"."investor_position_lot" to "service_role";

create policy "investor_position_lot_anon_deny"
on "public"."investor_position_lot"
as permissive
for all
to anon
using (false);


create policy "investor_position_lot_delete"
on "public"."investor_position_lot"
as permissive
for delete
to authenticated
using (((party_id IN ( SELECT ip.id
   FROM investor_party ip
  WHERE (ip.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 12))))));


create policy "investor_position_lot_insert"
on "public"."investor_position_lot"
as permissive
for insert
to authenticated
with check (((party_id IN ( SELECT ip.id
   FROM investor_party ip
  WHERE (ip.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));


create policy "investor_position_lot_select"
on "public"."investor_position_lot"
as permissive
for select
to authenticated
using ((party_id IN ( SELECT ip.id
   FROM investor_party ip
  WHERE (ip.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))));


create policy "investor_position_lot_update"
on "public"."investor_position_lot"
as permissive
for update
to authenticated
using (((party_id IN ( SELECT ip.id
   FROM investor_party ip
  WHERE (ip.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))))
with check (((party_id IN ( SELECT ip.id
   FROM investor_party ip
  WHERE (ip.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));


CREATE TRIGGER audit_investor_position_lot_trigger AFTER INSERT OR DELETE OR UPDATE ON public.investor_position_lot FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER investor_position_lot_updated_at_trigger BEFORE UPDATE ON public.investor_position_lot FOR EACH ROW EXECUTE FUNCTION update_investor_position_lot_updated_at();
