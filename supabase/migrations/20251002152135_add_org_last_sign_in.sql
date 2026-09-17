CREATE OR REPLACE FUNCTION "public"."admin_org_last_sign_in"()
RETURNS TABLE("org_id" uuid, "last_sign_in_at" timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET "search_path" TO 'auth','public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id AS org_id,
    MAX(au.last_sign_in_at) AS last_sign_in_at
  FROM public.organizations o
  LEFT JOIN public.users pu
    ON pu.organization_id = o.id
  LEFT JOIN auth.users au
    ON au.id = pu.id
  GROUP BY o.id;
END;
$$;

ALTER FUNCTION "public"."admin_org_last_sign_in"() OWNER TO "postgres";