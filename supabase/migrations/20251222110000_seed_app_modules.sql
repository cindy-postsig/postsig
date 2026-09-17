-- base_path is only used for redirecting to the module's home page, not for access control

INSERT INTO public.app_modules (code, name, description, base_path)
VALUES
    ('cpm', 'PostSig CPM', 'Contract portfolio management module', '/dashboard'),
    ('investor', 'PostSig Investor', 'Investor portal module', '/investor')
ON CONFLICT (code) DO NOTHING;
