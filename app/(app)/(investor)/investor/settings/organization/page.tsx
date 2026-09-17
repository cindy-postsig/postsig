import { OrganizationSettings } from '@/app/(app)/settings/organization/page';
import { MODULE_IDS } from '@/lib/settings/config';

export default async function InvestorOrganization() {
  return <OrganizationSettings moduleId={MODULE_IDS.investor} />;
}
