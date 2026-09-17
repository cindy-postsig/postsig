import { redirect } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { McpTokensManager } from '@/components/settings/McpTokensManager';
import { listMcpTokens } from '@/app/lib/actions/mcp-tokens';
import { getUserMetadata } from '@/data/users';

// Page is disabled while MCP connection moves to OAuth. Flip this to false to
// restore the manual-token UI.
const PAGE_DISABLED = true;

export default async function DeveloperSettingsPage() {
  if (PAGE_DISABLED) {
    redirect('/settings');
  }

  const userMetadata = await getUserMetadata();
  if (!userMetadata?.cpmMcpEnabled) {
    redirect('/settings');
  }
  const { tokens } = await listMcpTokens();

  const defaultName = userMetadata?.userProfile?.name
    ? `${userMetadata.userProfile.name}'s MCP token`
    : 'MCP token';

  return (
    <SettingsPage className="space-y-6">
      <div>
        <h3 className="font-medium">Developer</h3>
      </div>
      <Separator />
      <McpTokensManager initialTokens={tokens} defaultTokenName={defaultName} />
    </SettingsPage>
  );
}
