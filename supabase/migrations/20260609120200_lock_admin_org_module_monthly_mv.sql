-- Lock admin_org_module_monthly_mv to service_role only.
--
-- Mirrors 20260519150000_lock_admin_mvs_to_service_role.sql. Materialized
-- views are physical tables with no RLS, so grant management is the
-- enforcement mechanism. Consuming server actions go through the
-- service-role client (utils/supabase/service_server.ts).
--
-- Lives in its own migration so the REVOKE runs in a fresh transaction
-- after the MV creation has committed. Combining CREATE + REVOKE in a
-- single transaction errored with "dependent privileges exist" against
-- Supabase remote — the auto-grant event trigger that fires on object
-- creation leaves grant-chain dependencies that can't be revoked until
-- the creating transaction has committed.

REVOKE ALL ON public.admin_org_module_monthly_mv FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_org_module_monthly_mv TO service_role;
