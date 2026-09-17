alter table "public"."organizations" add column "fiscal_year_start" date;

alter table "public"."users" add column "signed_up" boolean default false;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_auth_users_signed_up()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Check if the email is confirmed in auth.users
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = NEW.id
      AND email_confirmed_at IS NOT NULL
  ) THEN
    -- Set signed_up to true and update raw_user_meta_data
    NEW.signed_up = true;

    UPDATE auth.users
    SET raw_user_meta_data = jsonb_set(
      coalesce(raw_user_meta_data, '{}'::jsonb),
      '{signed_up}',
      'true'::jsonb,
      true
    )
    WHERE id = NEW.id;
  ELSE
    -- Ensure signed_up is false if the email is not confirmed
    NEW.signed_up = false;

    -- Update raw_user_meta_data to false
    UPDATE auth.users
    SET raw_user_meta_data = jsonb_set(
      coalesce(raw_user_meta_data, '{}'::jsonb),
      '{signed_up}',
      'false'::jsonb,
      true
    )
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$
;


CREATE TRIGGER on_auth_users_signed_up_updated BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_auth_users_signed_up();

UPDATE public.users
SET signed_up = true;
