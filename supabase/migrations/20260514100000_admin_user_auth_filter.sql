-- Add an optional `p_user_id` to admin_fetch_user_auth_data so callers
-- that only need one user's auth metadata (e.g. the admin user-profile
-- page) can avoid scanning every row in auth.users + auth.audit_log_entries
-- in JS. Bulk callers (no argument) keep working — the function returns
-- all users when p_user_id is null.

drop function if exists public.admin_fetch_user_auth_data();
drop function if exists public.admin_fetch_user_auth_data(uuid);

create or replace function public.admin_fetch_user_auth_data(
  p_user_id uuid default null
)
returns table (
  id text,
  last_sign_in_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz,
  email_confirmed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with last_active as (
    select
      payload->>'actor_id' as user_id,
      max(created_at) as last_active_at
    from auth.audit_log_entries
    where payload->>'action' in ('token_refreshed', 'login')
      and payload->>'actor_id' is not null
      -- Push the user filter down so we don't aggregate audit rows for
      -- every user when only one is needed.
      and (p_user_id is null or payload->>'actor_id' = p_user_id::text)
    group by payload->>'actor_id'
  )
  select
    u.id::text,
    u.last_sign_in_at,
    la.last_active_at,
    u.created_at,
    u.email_confirmed_at
  from auth.users u
  left join last_active la on la.user_id = u.id::text
  where p_user_id is null or u.id = p_user_id;
$$;

revoke all on function public.admin_fetch_user_auth_data(uuid) from public;
revoke all on function public.admin_fetch_user_auth_data(uuid) from authenticated;
grant execute on function public.admin_fetch_user_auth_data(uuid)
  to service_role;
