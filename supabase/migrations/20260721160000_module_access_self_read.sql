-- External portco users are org-less, so the org-scoped select policy hides
-- their own grant row from their session. The portco proxy's module check
-- reads with the user client and fails closed, bouncing freshly provisioned
-- recipients to /no-access after sign-in. A user may always see their own
-- grants.
DROP POLICY IF EXISTS "user_module_access_select_own" ON public.user_module_access;
CREATE POLICY "user_module_access_select_own" ON public.user_module_access
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());
