import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getUser, getUserMetadata } from '@/data/users';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { UserAvatar } from '@/components/ui/user-avatar';
import { userRoles } from '@/constants/data';
import { EditablePersonalInfo } from './EditablePersonalInfo';
import { DateFormatSetting } from './DateFormatSetting';
import { cn } from '@/lib/utils';

const roleLabels: Record<number, string> = {
  [userRoles.postsigSuperAdmin]: 'PostSig Super Admin',
  [userRoles.postsigAdmin]: 'PostSig Admin',
  [userRoles.postsigUser]: 'PostSig User',
  [userRoles.postsigDeveloper]: 'PostSig Developer',
  [userRoles.postsigQA]: 'PostSig QA',
  [userRoles.postsigReviewer]: 'PostSig Reviewer',
  [userRoles.postsigExtractor]: 'PostSig Extractor',
  [userRoles.clientAdmin]: 'Manager',
  [userRoles.clientSupervisor]: 'Admin',
  [userRoles.clientReviewer]: 'Reviewer',
  [userRoles.clientUser]: 'Viewer',
  [userRoles.clientTrialUser]: 'Trial user',
};

async function loadUserRow(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('users')
    .select('name, job_title, department')
    .eq('id', userId)
    .maybeSingle();
  return data as {
    name: string | null;
    job_title: string | null;
    department: string | null;
  } | null;
}

export default async function Profile() {
  const [user, userMetadata] = await Promise.all([
    getUser(),
    getUserMetadata(),
  ]);
  if (!user) redirect('/login');

  const row = await loadUserRow(user.id);
  const name = row?.name ?? userMetadata?.userProfile?.name ?? null;
  const jobTitle = row?.job_title ?? null;
  const department = row?.department ?? null;
  const email = user.email ?? null;
  const dateFormatPattern = userMetadata?.userProfile?.date_format ?? null;
  const orgPattern = userMetadata?.organizationDateFormat ?? null;

  const roleLabel =
    typeof userMetadata?.userRole === 'number'
      ? roleLabels[userMetadata.userRole]
      : null;

  const memberSince = user.confirmed_at
    ? new Date(user.confirmed_at).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <SettingsPage className="space-y-10">
      <div className="space-y-6">
        <h3 className="font-medium">Profile</h3>
        <Separator />
      </div>

      <div className="flex items-center gap-4">
        <UserAvatar
          name={name}
          email={email}
          userId={user.id}
          size="xl"
          initialsCount={2}
          className="h-12 w-12 text-sm"
        />
        <div className="min-w-0 space-y-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium truncate text-lg">{name || '—'}</h2>
            {roleLabel && (
              <Badge variant="outline" className="font-normal">
                {roleLabel}
              </Badge>
            )}
          </div>
          {email && (
            <p className="truncate text-sm text-muted-foreground">{email}</p>
          )}
        </div>
      </div>

      <EditablePersonalInfo
        userId={user.id}
        initialName={name}
        initialJobTitle={jobTitle}
        initialDepartment={department}
      />

      <DateFormatSetting
        userId={user.id}
        initialPattern={dateFormatPattern}
        orgPattern={orgPattern}
      />

      <div>
        <div className="mb-4">
          <h4 className="font-medium text-base">Organization</h4>
        </div>
        <Card>
          <CardContent className="p-0">
            <OrgRow label="Organization" first>
              <span className="text-sm">
                {userMetadata?.organizationName || '—'}
              </span>
              {userMetadata?.isTrial && (
                <Badge variant="outline" className="font-normal ml-2">
                  Trial
                </Badge>
              )}
            </OrgRow>
            <OrgRow label="Member since">
              <span className="text-sm">{memberSince || '—'}</span>
            </OrgRow>
          </CardContent>
        </Card>
      </div>
    </SettingsPage>
  );
}

function OrgRow({
  label,
  first,
  children,
}: {
  label: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[160px_1fr] items-center gap-4 px-5 py-4',
        !first && 'border-t',
      )}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="flex items-center">{children}</div>
    </div>
  );
}
