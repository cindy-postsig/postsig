-- inv_kpi custom-KPI definition writes (create / deactivate) now run through the
-- service role in the app layer, which enforces the client-supervisor role and
-- org scoping server-side (lib/v2/reporting/custom-kpis.ts). Drop the role-based
-- write policy so no role ids live in customer-facing RLS. RLS stays enabled:
-- authenticated users keep read access via read_global_or_org, and writes for
-- authenticated are denied by default (only the service role, which bypasses
-- RLS, writes) — matching how the rest of the reporting module already writes.
DROP POLICY IF EXISTS "org_write" ON inv_kpi;
