import { AuthorizationError } from '@/lib/errors';
import { redirect } from 'next/navigation';
import { verifyAbility } from '@/data/user-permissions';
import { UploadSettingsClient } from './UploadSettingsClient';

export default async function UploadSettingsPage() {
  try {
    await verifyAbility('update', 'OrganizationPreference');
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect('/settings/organization');
    }
    throw error;
  }

  return <UploadSettingsClient />;
}
