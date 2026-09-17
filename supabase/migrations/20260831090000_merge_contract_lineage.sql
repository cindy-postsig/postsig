-- PSK-1946: processContractLineage writes the rest of metadata.lineage separately
-- from order_number (see set_contract_order_number), but was doing so via an
-- app-side read-modify-write that replaced metadata.lineage wholesale — deleting
-- order_number (and any other key not in the patch) every time it ran, even
-- when nothing about this run conflicted with it. Merge the patch into whatever
-- lineage exists at write time in a single atomic statement instead, so sibling
-- fields are never lost as a side effect of writing this one.
--
-- Invoker rights (no security definer/grants): same caller/service-role client
-- as the plain UPDATE this replaces.
create or replace function public.merge_contract_lineage(
  p_contract_id bigint,
  p_lineage_patch jsonb
)
returns void
language sql
set search_path to 'public', 'pg_temp'
as $$
  update contracts
  set metadata = jsonb_set(
    coalesce(metadata, '{}'::jsonb),
    '{lineage}',
    coalesce(metadata->'lineage', '{}'::jsonb) || p_lineage_patch,
    true
  )
  where id = p_contract_id;
$$;
