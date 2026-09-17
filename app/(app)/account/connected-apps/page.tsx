import { Separator } from '@/components/ui/separator';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { ConnectedAppsList } from '@/components/settings/ConnectedAppsList';
import { listConnectedApps } from '@/app/lib/actions/oauth-grants';
import { getUserMetadata } from '@/data/users';
import type { McpModule } from '@/app/lib/mcp/auth';

export default async function ConnectedAppsPage() {
  const userMetadata = await getUserMetadata();

  // MCP flags are org-level; intersect with the user's actual module access
  // so a user enabled org-wide but unassigned doesn't query that module.
  const hasCpm = userMetadata?.appModules?.some((m) => m.code === 'cpm');
  const hasInvestor = userMetadata?.appModules?.some(
    (m) => m.code === 'investor',
  );
  const enabledModules: McpModule[] = [];
  if (hasCpm && userMetadata?.cpmMcpEnabled) enabledModules.push('cpm');
  if (hasInvestor && userMetadata?.investorMcpEnabled) {
    enabledModules.push('investor');
  }

  const grants = await listConnectedApps(enabledModules);

  return (
    <SettingsPage className="space-y-6">
      <div>
        <h3 className="font-medium">Connected Apps</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Third-party applications that have been granted access to your PostSig
          data.
        </p>
      </div>
      <Separator />
      <ConnectedAppsList initialGrants={grants} />
    </SettingsPage>
  );
}
