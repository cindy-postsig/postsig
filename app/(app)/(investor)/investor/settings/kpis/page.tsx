import { redirect } from 'next/navigation';
import { verifyAbility } from '@/data/user-permissions';
import { AuthorizationError } from '@/lib/errors';
import { getUserMetadata } from '@/data/users';
import { getKpis } from '@/lib/v2/kpis/service';
import { getHiddenKpiIds } from '@/lib/v2/kpis/kpi-settings';
import { KpiSettingsClient } from './KpiSettingsClient';

export default async function KpiSettingsPage() {
  const userMetadata = await getUserMetadata();
  if (!userMetadata?.portcoKpisEnabled) {
    redirect('/investor/settings/organization');
  }

  try {
    await verifyAbility('manage', 'Organization');
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect('/investor/settings/organization');
    }
    throw error;
  }

  const [kpis, hiddenKpiIds] = await Promise.all([
    getKpis({ includeHidden: true }),
    getHiddenKpiIds(),
  ]);

  return <KpiSettingsClient kpis={kpis} initialHiddenKpiIds={hiddenKpiIds} />;
}
