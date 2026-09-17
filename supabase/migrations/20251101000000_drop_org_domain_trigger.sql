-- Drop the trigger that was causing issues with user creation
DROP TRIGGER IF EXISTS set_organization_domain_on_first_user ON public.users;

-- Drop the function as we'll handle domain setting in application code
DROP FUNCTION IF EXISTS public.update_organization_domain();
