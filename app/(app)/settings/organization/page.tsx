import { getUserMetadata, getUser } from '@/data/users';
import {
  getOrganizationUsers,
  getPendingInvites,
} from '@/app/lib/actions/organization-users';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import InlineInviteUsersForm from '@/components/settings/InlineInviteUsersForm';
import { OrganizationUsersTable } from '@/components/settings/OrganizationUsersTable';
import type { User } from '@/components/settings/orgColumns';
import { PendingInvite } from '@/components/settings/OrganizationUsersTable';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import logger from '@/utils/pino';
import { UserRole } from '@/constants/types';
import { Can } from '@/components/providers/AbilityProvider';
import { Card, CardContent } from '@/components/ui/card';
import { PostSigUploadEmail } from '@/components/settings/PostSigUploadEmail';
import { ModuleUsageStats } from '@/components/settings/ModuleUsageStats';
import { MODULE_IDS, type AppModule } from '@/lib/settings/config';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default async function Organization() {
  return <OrganizationSettings moduleId={MODULE_IDS.cpm} />;
}

export async function OrganizationSettings({ moduleId }: { moduleId: number }) {
  const userMetadata = await getUserMetadata();
  const user = await getUser();
  const currentUserId = user.id;

  if (!userMetadata) {
    return (
      <SettingsPage className="space-y-10">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Organization</h3>
              <p className="text-sm text-muted-foreground">
                Error loading user data
              </p>
            </div>
          </div>
          <Separator />
        </div>
      </SettingsPage>
    );
  }

  let orgUsers: User[] = [];
  let pendingInvites: PendingInvite[] = [];
  let error = null;

  try {
    const [usersData, invitesData] = await Promise.all([
      getOrganizationUsers(userMetadata.organizationId, {
        currentUserEmail: user.email,
      }),
      getPendingInvites({ currentUserEmail: user.email }),
    ]);

    orgUsers = usersData.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      job_title: user.job_title,
      jobTitle: user.job_title ?? undefined,
      appRole: user.appRole as UserRole,
      isCurrentUser: user.id === currentUserId,
    }));

    pendingInvites = invitesData.map((invite) => ({
      id: invite.id,
      userId: invite.userId,
      name: invite.name ?? null,
      email: invite.email ?? null,
      role: invite.role,
      invitedAt: invite.invitedAt,
      status: invite.status as 'pending' | 'expired',
    }));
  } catch (err) {
    error = err;
    logger.error(
      {
        error: sanitizeForLogging(err),
        organizationId: userMetadata.organizationId,
      },
      'Error fetching organization data',
    );
  }

  const totalUserCount = orgUsers.length + pendingInvites.length;
  const USER_SOFT_LIMIT = 10;

  const appModule: AppModule =
    moduleId === MODULE_IDS.investor ? 'investor' : 'cpm';

  if (error) {
    return (
      <SettingsPage className="space-y-10">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Organization</h3>
              <p className="text-sm text-muted-foreground">
                Error loading organization data
              </p>
            </div>
          </div>
          <Separator />
        </div>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage className="space-y-10">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium flex items-center gap-2">
              Organization
              {userMetadata.isTrial && <Badge>Trial</Badge>}
            </h3>
            <p className="text-sm text-muted-foreground">
              {userMetadata.organizationName || ''}
            </p>
          </div>
        </div>
        <Separator />
      </div>

      <ModuleUsageStats
        module={appModule}
        userCount={totalUserCount}
        userLimit={USER_SOFT_LIMIT}
      />

      <div className="space-y-10">
        {moduleId === MODULE_IDS.cpm && (
          <div>
            <Card>
              <CardContent className="p-5">
                <div className="mb-6 flex flex-col gap-1">
                  <label className="font-medium font-sans">
                    PostSig Upload Email
                  </label>
                </div>
                <PostSigUploadEmail />
              </CardContent>
            </Card>
          </div>
        )}
        {moduleId === MODULE_IDS.cpm && (
          <Can I="update" a="User">
            <div>
              <Card>
                <CardContent className="p-5">
                  <div className="mb-6 flex flex-col gap-1">
                    <label className="font-medium font-sans">
                      Invite PostSig users
                    </label>
                  </div>
                  <InlineInviteUsersForm
                    userEmail={user.email || ''}
                    moduleId={moduleId}
                  />
                </CardContent>
              </Card>
            </div>
          </Can>
        )}

        <div>
          <div className="mb-4">
            <h4 className="font-medium">PostSig users</h4>
          </div>
          <OrganizationUsersTable
            orgUsers={orgUsers}
            pendingInvites={pendingInvites}
          />
        </div>
      </div>
    </SettingsPage>
  );
}
