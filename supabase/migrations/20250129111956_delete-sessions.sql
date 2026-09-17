set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.delete_user_sessions(user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'auth', 'public'
AS $function$
BEGIN
  DELETE FROM auth.sessions WHERE auth.sessions.user_id = $1::uuid;
END;
$function$
;


