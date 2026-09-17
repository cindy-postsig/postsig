-- Replace "last sign in" with "last active" in the admin UI by extending
-- the two bulk RPCs to also return per-user and per-org last_active_at.
-- `last_sign_in_at` only updates on a fresh credential sign-in and goes
-- stale on long-lived sessions.
--
-- Source is `auth.audit_log_entries` (append-only, immutable). Each
-- token_refreshed and login event is a permanent row, so we get accurate
-- "most recent activity" history.
--
-- Implementation note: we aggregate audit_log_entries in a single grouped
-- CTE and join to it once, rather than running a lateral subquery per user.
-- The lateral form blows up to O(users * entries) and trips
-- statement_timeout on real audit-log volumes.
--
-- Both signatures change (extra column), so the old functions are dropped
-- explicitly. Re-running this migration is safe.

drop function if exists public.admin_fetch_user_auth_data();
drop function if exists public.admin_org_last_sign_in();

create or replace function public.admin_fetch_user_auth_data()
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
    group by payload->>'actor_id'
  )
  select
    u.id::text,
    u.last_sign_in_at,
    la.last_active_at,
    u.created_at,
    u.email_confirmed_at
  from auth.users u
  left join last_active la on la.user_id = u.id::text;
$$;

revoke all on function public.admin_fetch_user_auth_data() from public;
revoke all on function public.admin_fetch_user_auth_data() from authenticated;
grant execute on function public.admin_fetch_user_auth_data()
  to service_role;

create or replace function public.admin_org_last_sign_in()
returns table (
  org_id uuid,
  last_sign_in_at timestamptz,
  last_active_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with last_active_per_user as (
    select
      payload->>'actor_id' as user_id,
      max(created_at) as last_active_at
    from auth.audit_log_entries
    where payload->>'action' in ('token_refreshed', 'login')
      and payload->>'actor_id' is not null
    group by payload->>'actor_id'
  )
  select
    u.organization_id as org_id,
    max(au.last_sign_in_at) as last_sign_in_at,
    max(la.last_active_at) as last_active_at
  from public.users u
  join auth.users au on au.id = u.id
  left join last_active_per_user la on la.user_id = au.id::text
  where u.organization_id is not null
  group by u.organization_id;
$$;

revoke all on function public.admin_org_last_sign_in() from public;
revoke all on function public.admin_org_last_sign_in() from authenticated;
grant execute on function public.admin_org_last_sign_in()
  to service_role;
