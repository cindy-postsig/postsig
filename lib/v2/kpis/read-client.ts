import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { getMcpContext } from '@/app/lib/mcp/context';
import { getUserMetadata } from '@/data/users';

// MCP routes are bearer-auth'd with no Supabase session cookie, so the cookie
// client reads as anon and RLS returns no rows. The service client stands in
// there, and it bypasses RLS — every read through it must filter on the
// returned organizationId.
export async function createOrgReadClient() {
  const metadata = await getUserMetadata();
  if (!metadata?.organizationId) return null;
  const supabase = getMcpContext()
    ? createServiceClient()
    : await createServerClient();
  return { supabase, organizationId: metadata.organizationId };
}
