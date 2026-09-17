ALTER VIEW public.extraction_stats SET (security_invoker = true);
ALTER VIEW public.current_vendors SET (security_invoker = true);
ALTER VIEW public.v_inv_position SET (security_invoker = true);
ALTER VIEW public.v_inv_company_valuation SET (security_invoker = true);
ALTER VIEW public.v_inv_fund_summary SET (security_invoker = true);

alter table public.inv_stages enable row level security;
alter table public.inv_snapshot_types enable row level security;
alter table public.inv_companies enable row level security;

-- Make all tables read-only for all roles (except superusers) by creating restrictive policies:
create policy readonly_inv_stages on public.inv_stages
  for select
  to public
  using (true);

create policy readonly_inv_snapshot_types on public.inv_snapshot_types
  for select
  to public
  using (true);

create policy readonly_inv_companies on public.inv_companies
  for select
  to public
  using (true);

alter table public.inv_stages force row level security;
alter table public.inv_snapshot_types force row level security;
alter table public.inv_companies force row level security;

