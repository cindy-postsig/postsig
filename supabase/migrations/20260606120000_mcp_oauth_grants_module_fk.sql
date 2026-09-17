-- The CHECK constraint hardcoded the two known module codes. Now that
-- app_modules is the source of truth, replace it with a real FK so new modules
-- don't require schema changes and PostgREST can resolve the relationship for
-- nested selects (e.g. `select('*, app_modules(name)')`).

ALTER TABLE public.mcp_oauth_grants
  DROP CONSTRAINT IF EXISTS mcp_oauth_grants_module_check;

ALTER TABLE public.mcp_oauth_grants
  ADD CONSTRAINT mcp_oauth_grants_module_fkey
    FOREIGN KEY (module) REFERENCES public.app_modules(code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;
