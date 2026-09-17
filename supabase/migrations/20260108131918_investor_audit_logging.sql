drop policy "Users can view their own activity" on "public"."activities";

drop index if exists "public"."idx_module_entities_metadata_funds";

alter table "public"."activities" add column "entity_id" bigint;

alter table "public"."activities" add column "module_type" character varying(20) not null default 'contracts'::character varying;

CREATE INDEX idx_activities_entity_id ON public.activities USING btree (entity_id);

CREATE INDEX idx_activities_module_type ON public.activities USING btree (module_type);

CREATE INDEX idx_activities_module_type_created_at ON public.activities USING btree (module_type, created_at DESC);

alter table "public"."activities" add constraint "activities_entity_id_fkey" FOREIGN KEY (entity_id) REFERENCES module_entities(id) ON DELETE SET NULL not valid;

alter table "public"."activities" validate constraint "activities_entity_id_fkey";

alter table "public"."module_entities" add constraint "module_entities_portfolio_company_has_company_id" CHECK (((entity_type <> 'portfolio_company'::text) OR (company_id IS NOT NULL))) not valid;

alter table "public"."module_entities" validate constraint "module_entities_portfolio_company_has_company_id";

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

grant delete on table "public"."portfolio_company_funds" to "postgres";

grant insert on table "public"."portfolio_company_funds" to "postgres";

grant references on table "public"."portfolio_company_funds" to "postgres";

grant select on table "public"."portfolio_company_funds" to "postgres";

grant trigger on table "public"."portfolio_company_funds" to "postgres";

grant truncate on table "public"."portfolio_company_funds" to "postgres";

grant update on table "public"."portfolio_company_funds" to "postgres";

create policy "Users can view org activities"
on "public"."activities"
as permissive
for select
to authenticated
using (((user_id = auth.uid()) OR (((module_type)::text = 'investor'::text) AND (entity_id IN ( SELECT me.id
   FROM module_entities me
  WHERE (me.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid()))))))));


CREATE TRIGGER audit_companies_trigger AFTER INSERT OR DELETE OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_document_field_values_trigger AFTER INSERT OR DELETE OR UPDATE ON public.document_field_values FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_module_document_extractions_trigger AFTER INSERT OR DELETE OR UPDATE ON public.module_document_extractions FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_module_document_files_trigger AFTER INSERT OR DELETE OR UPDATE ON public.module_document_files FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();


