import { getOrganizationGroups } from '@/app/lib/actions/organization-groups';
import { Separator } from '@/components/ui/separator';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import CreateGroupDialog from '@/components/settings/CreateGroupDialog';
import { GroupsTable } from './GroupsTable';
import { verifyAbility } from '@/data/user-permissions';
import { redirect } from 'next/navigation';
import { AuthorizationError } from '@/lib/errors';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default async function GroupsPage() {
  // Verify user has permission to manage groups
  let authData;
  try {
    authData = await verifyAbility('manage', 'Group');
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect('/dashboard');
    }
    throw error;
  }

  let groups: Array<{
    id: number;
    publicUuid: string;
    name: string;
    description: string;
    memberCount: number;
    createdAt: string;
    folders: unknown[];
    contracts: unknown[];
    users: unknown[];
  }> = [];

  try {
    groups = await getOrganizationGroups();
  } catch (err) {
    logger.error(
      {
        error: sanitizeForLogging(err),
        organizationId: authData.organizationId,
      },
      'Error fetching organization groups',
    );
  }

  return (
    <SettingsPage className="space-y-10">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Sharing Groups</h3>
            <p className="text-sm text-muted-foreground">
              Manage sharing groups in your organization for viewing
              permissions.
            </p>
          </div>
          <CreateGroupDialog />
        </div>
        <Separator />
      </div>

      <div>
        <GroupsTable groups={groups} />
      </div>
    </SettingsPage>
  );
}
