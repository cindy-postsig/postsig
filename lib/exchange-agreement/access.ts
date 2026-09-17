import 'server-only';
import { getUserMetadata } from '@/data/users';

// Backed by organization_modules.settings.exchange_agreements_enabled (cpm
// module) -- the same per-org toggle mechanism as MCP/CSV export/invoices
// access, set from the admin panel. getUserMetadata() is cache()-wrapped and
// already degrades to null on a fetch error, so this never throws.
export async function hasExchangeAgreementAccess(): Promise<boolean> {
  const user = await getUserMetadata();
  return user?.cpmExchangeAgreementsEnabled === true;
}
