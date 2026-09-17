import { redirect } from 'next/navigation';
import AdvanceNoticePeriodForm from '@/components/settings/AdvanceNoticePeriod';
import EmailAlertForm from '@/components/settings/EmailAlert';
import EmailFrequencyForm from '@/components/settings/EmailFrequency';
import ContractUploadNotificationsForm from '@/components/settings/ContractUploadNotifications';
import { getUserMetadata } from '@/data/users';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Can } from '@/components/providers/AbilityProvider';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default async function Notifications() {
  const user = await getUserMetadata();
  if (!user) {
    return null;
  }

  // Notification content is contract-specific, so only users with CPM
  // access see it. Investor-only users land back on /account.
  const hasCpm = user.appModules?.some((m) => m.code === 'cpm');
  if (!hasCpm) {
    redirect('/account');
  }

  const userProfile = user.userProfile;
  const emailAlerts = userProfile?.email_alerts || false;

  return (
    <SettingsPage className="space-y-6">
      <div>
        <h3 className="font-medium">Notifications</h3>
        <p className="text-sm text-muted-foreground">
          Configure your notification preferences and alert settings.
        </p>
      </div>
      <Separator />
      <div className="space-y-4">
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-2 p-5">
              <div className="flex flex-col gap-1">
                <label className="font-medium font-sans">
                  Renewal Email Alerts
                </label>
                <p className="text-sm text-muted-foreground">
                  Receive email notifications about contracts ending soon.
                </p>
              </div>
              <EmailAlertForm user={user} />
            </div>

            <div className={cn('border-t', !emailAlerts && 'opacity-50')}>
              <div className="flex items-center justify-between gap-2 border-b px-5 py-4 pl-8">
                <div className="flex flex-col gap-1">
                  <label className="font-medium font-sans text-sm">
                    Email Frequency
                  </label>
                  <p className="text-sm text-muted-foreground">
                    How frequently you&apos;d like to receive renewal alert
                    emails.
                  </p>
                </div>
                <EmailFrequencyForm user={user} emailAlerts={emailAlerts} />
              </div>
              <div className="flex items-center justify-between gap-2 px-5 py-4 pl-8">
                <div className="flex flex-col gap-1">
                  <label className="font-medium font-sans text-sm">
                    Advance Notice Period
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Number of days before the cancellation or end date to
                    include in reports and alerts.
                  </p>
                </div>
                <AdvanceNoticePeriodForm user={user} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Can I="create" a="Contract">
          <Card>
            <CardContent className="flex items-center justify-between gap-2 p-5">
              <div className="flex flex-col gap-1">
                <label className="font-medium font-sans">
                  Contract Upload Notification
                </label>
                <p className="text-sm text-muted-foreground">
                  Receive email notifications when your uploaded contracts are
                  published.
                </p>
              </div>
              <ContractUploadNotificationsForm user={user} />
            </CardContent>
          </Card>
        </Can>
      </div>
    </SettingsPage>
  );
}
