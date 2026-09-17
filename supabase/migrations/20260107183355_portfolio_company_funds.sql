create table "public"."portfolio_company_funds" (
    "portfolio_company_id" bigint not null,
    "fund_id" bigint not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."portfolio_company_funds" enable row level security;

CREATE INDEX portfolio_company_funds_fund_id_idx ON public.portfolio_company_funds USING btree (fund_id);

CREATE UNIQUE INDEX portfolio_company_funds_pkey ON public.portfolio_company_funds USING btree (portfolio_company_id, fund_id);

CREATE INDEX portfolio_company_funds_portfolio_company_id_idx ON public.portfolio_company_funds USING btree (portfolio_company_id);

alter table "public"."portfolio_company_funds" add constraint "portfolio_company_funds_pkey" PRIMARY KEY using index "portfolio_company_funds_pkey";

alter table "public"."portfolio_company_funds" add constraint "portfolio_company_funds_fund_id_fkey" FOREIGN KEY (fund_id) REFERENCES investor_funds(id) ON DELETE CASCADE not valid;

alter table "public"."portfolio_company_funds" validate constraint "portfolio_company_funds_fund_id_fkey";

alter table "public"."portfolio_company_funds" add constraint "portfolio_company_funds_portfolio_company_id_fkey" FOREIGN KEY (portfolio_company_id) REFERENCES module_entities(id) ON DELETE CASCADE not valid;

alter table "public"."portfolio_company_funds" validate constraint "portfolio_company_funds_portfolio_company_id_fkey";

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

grant delete on table "public"."investor_funds" to "postgres";

grant insert on table "public"."investor_funds" to "postgres";

grant references on table "public"."investor_funds" to "postgres";

grant select on table "public"."investor_funds" to "postgres";

grant trigger on table "public"."investor_funds" to "postgres";

grant truncate on table "public"."investor_funds" to "postgres";

grant update on table "public"."investor_funds" to "postgres";

grant delete on table "public"."portfolio_company_funds" to "anon";

grant insert on table "public"."portfolio_company_funds" to "anon";

grant references on table "public"."portfolio_company_funds" to "anon";

grant select on table "public"."portfolio_company_funds" to "anon";

grant trigger on table "public"."portfolio_company_funds" to "anon";

grant truncate on table "public"."portfolio_company_funds" to "anon";

grant update on table "public"."portfolio_company_funds" to "anon";

grant delete on table "public"."portfolio_company_funds" to "authenticated";

grant insert on table "public"."portfolio_company_funds" to "authenticated";

grant references on table "public"."portfolio_company_funds" to "authenticated";

grant select on table "public"."portfolio_company_funds" to "authenticated";

grant trigger on table "public"."portfolio_company_funds" to "authenticated";

grant truncate on table "public"."portfolio_company_funds" to "authenticated";

grant update on table "public"."portfolio_company_funds" to "authenticated";

grant delete on table "public"."portfolio_company_funds" to "postgres";

grant insert on table "public"."portfolio_company_funds" to "postgres";

grant references on table "public"."portfolio_company_funds" to "postgres";

grant select on table "public"."portfolio_company_funds" to "postgres";

grant trigger on table "public"."portfolio_company_funds" to "postgres";

grant truncate on table "public"."portfolio_company_funds" to "postgres";

grant update on table "public"."portfolio_company_funds" to "postgres";

grant delete on table "public"."portfolio_company_funds" to "service_role";

grant insert on table "public"."portfolio_company_funds" to "service_role";

grant references on table "public"."portfolio_company_funds" to "service_role";

grant select on table "public"."portfolio_company_funds" to "service_role";

grant trigger on table "public"."portfolio_company_funds" to "service_role";

grant truncate on table "public"."portfolio_company_funds" to "service_role";

grant update on table "public"."portfolio_company_funds" to "service_role";

create policy "portfolio_company_funds_anon_deny"
on "public"."portfolio_company_funds"
as permissive
for all
to anon
using (false);


create policy "portfolio_company_funds_delete"
on "public"."portfolio_company_funds"
as permissive
for delete
to authenticated
using (((portfolio_company_id IN ( SELECT me.id
   FROM module_entities me
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));


create policy "portfolio_company_funds_insert"
on "public"."portfolio_company_funds"
as permissive
for insert
to authenticated
with check (((portfolio_company_id IN ( SELECT me.id
   FROM module_entities me
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));


create policy "portfolio_company_funds_select"
on "public"."portfolio_company_funds"
as permissive
for select
to authenticated
using ((portfolio_company_id IN ( SELECT me.id
   FROM module_entities me
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))));


CREATE TRIGGER audit_portfolio_company_funds_trigger AFTER INSERT OR DELETE OR UPDATE ON public.portfolio_company_funds FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();


