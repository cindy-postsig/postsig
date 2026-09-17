import { getUserMetadata } from '@/data/users';
import { getOrganizationUser } from '@/app/lib/actions/organization-users';
import { UserGroupsSection } from './UserGroupsSection';
import { notFound } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import Link from 'next/link';
import { UserRoleSelector } from './UserRoleSelector';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import logger from '@/utils/pino';
import { UserRoleWithoutOld } from '@/constants/types';
import { VIEWER, ADMIN } from '@/constants/data';
import { SettingsPage } from '@/components/settings/SettingsPage';

interface UserGroup {
  id: string;
  name: string;
  role: string;
  assignedAt: string;
  memberCount?: number;
}

interface UserContract {
  id: string;
  vendorName: string;
  vendorDomain?: string;
  product: string;
  annualCost: number;
  currency: string;
  assignedAt: string;
}

interface UserFolder {
  id: string;
  name: string;
  contractCount: number;
  assignedAt: string;
}

interface UserDetails {
  id: string;
  name: string | null;
  email: string | null;
  appRole: UserRoleWithoutOld;
  joinedAt: string;
  lastActive: string;
  groups: UserGroup[];
  contracts: UserContract[];
  folders: UserFolder[];
}

export default async function UserManagePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  try {
    await getUserMetadata();
    const user = await getOrganizationUser(userId);

    if (!user) {
      notFound();
    }

    // TODO: Fetch actual user groups from database
    const genericGroups: {
      id: string;
      publicUuid: string;
      name: string;
      role: string;
      assignedAt: string;
      memberCount: number;
    }[] = [];

    return (
      <SettingsPage className="space-y-6">
        {/* Breadcrumb Navigation */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/settings/organization">Organization</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{user.name || 'User'}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Page Header */}
        <div className="flex justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-medium text-2xl">
                {user.name || 'Unknown User'}
              </h1>
            </div>
            <span className="text-sm text-muted-foreground">{user.email}</span>
          </div>

          {/* App Role Setting */}
          <div className="space-y-1 text-right">
            <UserRoleSelector
              userId={user.id}
              currentRole={user.appRole as UserRoleWithoutOld}
            />
          </div>
        </div>

        {/* Main Content Sections */}
        <div className="space-y-10">
          <Separator />

          {/* Groups Section */}
          <UserGroupsSection groups={genericGroups} />
        </div>
      </SettingsPage>
    );
  } catch (error) {
    logger.error(
      { error: sanitizeForLogging(error), userId: userId },
      'Error fetching user details',
    );
    notFound();
  }
}
