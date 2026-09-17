alter table "public"."organizations" add column "app_access" boolean default true;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.admin_fetch_user_auth_data()
 RETURNS TABLE(id uuid, last_sign_in_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'auth', 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT au.id, au.last_sign_in_at
  FROM auth.users au;
END;
$function$
;


