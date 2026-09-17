-- Cloud PostgREST only serves schemas listed in db.schemas (default: public,
-- storage, graphql_public), so .schema('auth') 404s in cloud regardless of
-- role. The consent screen needs `resource` to render the module label
-- ("Read your CPM data" vs "Read your Investor data"); this RPC is the only
-- path to it that survives the gate.

create or replace function public.mcp_authorization_summary(p_authorization_id text)
returns table (
  client_id    uuid,
  redirect_uri text,
  resource     text,
  status       text,
  expires_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    client_id,
    redirect_uri,
    resource,
    status::text,
    expires_at
  from auth.oauth_authorizations
  where authorization_id = p_authorization_id
$$;

revoke all on function public.mcp_authorization_summary(text) from public;
revoke all on function public.mcp_authorization_summary(text) from anon;
revoke all on function public.mcp_authorization_summary(text) from authenticated;
grant execute on function public.mcp_authorization_summary(text) to service_role;
