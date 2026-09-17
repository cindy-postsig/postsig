alter table "public"."contract_citations" add column "updated_at" timestamp with time zone;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.contract_citations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


