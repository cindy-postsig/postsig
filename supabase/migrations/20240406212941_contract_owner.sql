alter table "public"."contracts" add column "business_group" text;

alter table "public"."contracts" add column "business_justification" text;

alter table "public"."contracts" add column "business_sponsor" text;

alter table "public"."contracts" add column "name" text;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_auth_display_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(raw_user_meta_data, '{name}', to_jsonb(NEW.name))
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$function$
;

create policy "Enable users to update their own contracts"
on "public"."contracts"
as permissive
for update
to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));


CREATE TRIGGER update_auth_display_name_trigger AFTER INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_auth_display_name();


