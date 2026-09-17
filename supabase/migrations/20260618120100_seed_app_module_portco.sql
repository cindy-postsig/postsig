-- Third app module: PortCo (portfolio-company quarterly reporting). Access is
-- granted per user via user_module_access; the standalone portco app gates on it.
-- base_path is '/' since the module is served by a separate app, not a route
-- prefix inside this one (unlike cpm '/dashboard' and investor '/investor').
INSERT INTO public.app_modules (code, name, description, base_path)
VALUES
    ('portco', 'PostSig PortCo', 'Portfolio company reporting module', '/')
ON CONFLICT (code) DO NOTHING;
