-- Lock the admin materialized views to service_role only.
--
-- admin_activity_logs_mv and admin_org_module_uploads_mv shipped without
-- explicit grants, so they're readable by anyone via PostgREST today —
-- the data only stayed contained because the consuming RPCs already
-- restrict execution to service_role. Belt-and-suspenders: restrict the
-- MVs themselves so future code calling them from a user-context client
-- fails closed.
--
-- Materialized views are physical tables; RLS doesn't apply by default
-- and they have no security_invoker option, so grant management is the
-- enforcement mechanism here.

REVOKE ALL ON public.admin_activity_logs_mv FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_org_module_uploads_mv FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.admin_activity_logs_mv TO service_role;
GRANT SELECT ON public.admin_org_module_uploads_mv TO service_role;
