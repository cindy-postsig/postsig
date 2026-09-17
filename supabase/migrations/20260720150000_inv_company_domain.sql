-- Allowed email domain for portco self-signup on shared request links.
-- Org-scoped on purpose: the global inv_companies.domain is a reviewed,
-- unique dedup key and must not absorb recipient-derived values.
ALTER TABLE inv_company ADD COLUMN IF NOT EXISTS domain TEXT;
