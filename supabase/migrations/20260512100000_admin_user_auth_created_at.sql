-- Extend admin_fetch_user_auth_data to also expose auth.users.created_at so
-- admin features can show user signup dates (e.g. org "member since"
-- inferred from the earliest user signup, since public.organizations has
-- no created_at column).

drop function if exists public.admin_fetch_user_auth_data();

create or replace function public.admin_fetch_user_auth_data()
returns table(
  id uuid,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path to 'auth', 'public'
as $$
begin
  return query
  select au.id, au.created_at, au.last_sign_in_at
  from auth.users au;
end;
$$;

grant execute on function public.admin_fetch_user_auth_data()
  to authenticated, service_role;
