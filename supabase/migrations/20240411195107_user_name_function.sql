drop trigger if exists "update_auth_display_name_trigger" on "public"."users";

drop function if exists "public"."update_auth_display_name"();

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_auth_user_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE auth.users 
  SET raw_user_meta_data = jsonb_set(
    coalesce(raw_user_meta_data, '{}'),
    '{full_name}',
    to_jsonb(NEW.name),
    true
  )
  WHERE id = NEW.id;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$begin
  insert into public.users (id, name, email, job_title, organization, department)
  values (new.id, new.raw_user_meta_data->>'name', NEW.email, NEW.raw_user_meta_data->>'job_title', NEW.raw_user_meta_data->>'organization', NEW.raw_user_meta_data->>'department');
  return new;
end;$function$
;

CREATE TRIGGER update_auth_user_name AFTER UPDATE OF name ON public.users FOR EACH ROW EXECUTE FUNCTION update_auth_user_name();


