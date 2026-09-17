alter table "public"."organizations" add column "domain" text;

CREATE OR REPLACE FUNCTION public.update_organization_domain()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only update if this is the first user in the organization
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE organization_id = NEW.organization_id
    AND id != NEW.id
  ) THEN
    UPDATE organizations
    SET domain = substring(NEW.email from '@(.*)$')
    WHERE id = NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE TRIGGER set_organization_domain_on_first_user AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION update_organization_domain();
