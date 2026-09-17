-- Fix permissions on investor_events and investor_stages reference tables
-- These are lookup tables that should be read-only for anon and authenticated users.
-- Only service_role and postgres should have write access.

-- ============================================================================
-- REVOKE WRITE PERMISSIONS FROM ANON AND AUTHENTICATED ON investor_events
-- ============================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.investor_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.investor_events FROM authenticated;

-- Keep SELECT for authenticated (reference table lookup)
-- Revoke SELECT from anon (these are internal reference tables)
REVOKE SELECT ON public.investor_events FROM anon;

-- ============================================================================
-- REVOKE WRITE PERMISSIONS FROM ANON AND AUTHENTICATED ON investor_stages
-- ============================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.investor_stages FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.investor_stages FROM authenticated;

-- Keep SELECT for authenticated (reference table lookup)
-- Revoke SELECT from anon (these are internal reference tables)
REVOKE SELECT ON public.investor_stages FROM anon;

-- ============================================================================
-- ENABLE RLS ON REFERENCE TABLES
-- ============================================================================

ALTER TABLE public.investor_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_stages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLICIES FOR investor_events
-- ============================================================================

-- Deny all access to anon
CREATE POLICY "investor_events_anon_deny"
ON public.investor_events
AS PERMISSIVE
FOR ALL
TO anon
USING (false);

-- Authenticated users can read (lookup table)
CREATE POLICY "investor_events_select"
ON public.investor_events
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

-- ============================================================================
-- POLICIES FOR investor_stages
-- ============================================================================

-- Deny all access to anon
CREATE POLICY "investor_stages_anon_deny"
ON public.investor_stages
AS PERMISSIVE
FOR ALL
TO anon
USING (false);

-- Authenticated users can read (lookup table)
CREATE POLICY "investor_stages_select"
ON public.investor_stages
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);
