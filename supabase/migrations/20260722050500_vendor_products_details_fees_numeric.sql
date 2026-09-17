-- fees was created as bigint (20240507213513), silently truncating cents.
-- Convert to numeric (exact decimal) to match vendor_products_details_versions.fees.
-- Guarded so it succeeds on environments where the column was already altered manually.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vendor_products_details'
      and column_name = 'fees'
      and data_type <> 'numeric'
  ) then
    alter table public.vendor_products_details
      alter column fees type numeric using fees::numeric;
  end if;
end $$;
