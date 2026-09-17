import { Suspense } from 'react';
import { createClient } from '@/utils/supabase/server';
import { getMFAStatus } from '@/app/lib/auth/mfa-actions';
import MFASetup from '@/components/settings/MFASetup';
import BackupCodes from '@/components/settings/BackupCodes';
import PasswordForm from '@/components/settings/UpdatePassword';
import TrustedDeviceManager from '@/components/settings/TrustedDeviceManager';
import { Separator } from '@/components/ui/separator';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default async function SecurityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <SettingsPage className="space-y-6">
        <div>
          <h3 className="font-medium text-lg">Security</h3>
          <p className="text-sm text-muted-foreground">
            Please log in to access security settings.
          </p>
        </div>
      </SettingsPage>
    );
  }

  const mfaStatus = await getMFAStatus();

  return (
    <SettingsPage className="space-y-6">
      <div>
        <h3 className="font-medium">Security</h3>
        <p className="text-sm text-muted-foreground">
          Manage your account security settings and enable multi-factor
          authentication.
        </p>
      </div>
      <Separator />
      <div className="space-y-4">
        <Suspense fallback={<div>Loading MFA settings...</div>}>
          <MFASetup user={user} mfaStatus={mfaStatus} />
        </Suspense>

        {mfaStatus.enabled && (
          <Suspense fallback={<div>Loading trusted devices...</div>}>
            <TrustedDeviceManager />
          </Suspense>
        )}

        <PasswordForm user={user} />

        {/* {mfaStatus.enabled && (
          <Suspense fallback={<div>Loading backup codes...</div>}>
            <BackupCodes user={user} hasBackupCodes={mfaStatus.hasBackupCodes} />
          </Suspense>
        )} */}
      </div>
    </SettingsPage>
  );
}
