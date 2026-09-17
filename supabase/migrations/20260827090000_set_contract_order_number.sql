-- PSK-1946: atomic, precedence-aware write for contracts.metadata.lineage.order_number,
-- replacing separate app-side read-modify-writes in postsig-nextjs and postsig-hextraction
-- that could race and silently drop a reviewer's manual entry. p_only_if_empty = false
-- (manual save) always wins; p_only_if_empty = true (AI extraction) only fills an empty value.
--
-- Invoker rights (no security definer/grants): both callers already write to contracts via
-- their service-role client, same as the plain UPDATE this replaces.
create or replace function public.set_contract_order_number(
  p_contract_id bigint,
  p_order_number text,
  p_only_if_empty boolean
)
returns void
language sql
set search_path to 'public', 'pg_temp'
as $$
  -- jsonb_set's create_missing only creates the final path element — if `lineage`
  -- doesn't already exist as an object, a single jsonb_set at '{lineage,order_number}'
  -- silently no-ops. Ensure `lineage` exists first, then set order_number within it.
  update contracts
  set metadata = jsonb_set(
    jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{lineage}',
      coalesce(metadata->'lineage', '{}'::jsonb),
      true
    ),
    '{lineage,order_number}',
    coalesce(to_jsonb(p_order_number), 'null'::jsonb),
    true
  )
  where id = p_contract_id
    and (
      not p_only_if_empty
      or coalesce(metadata->'lineage'->>'order_number', '') = ''
    );
$$;
