-- Prevent duplicate fund names within the same organization
ALTER TABLE public.inv_fund
  ADD CONSTRAINT inv_fund_name_organization_id_key UNIQUE (name, organization_id);

-- Prevent duplicate org-company links (same global company linked twice to one org)
ALTER TABLE public.inv_company
  ADD CONSTRAINT inv_company_company_id_organization_id_key UNIQUE (company_id, organization_id);
