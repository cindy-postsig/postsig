import { redirect } from 'next/navigation';
import { getAbilityForCurrentUser } from '@/data/user-permissions';
import { resolveSettingsRoute } from '@/lib/settings/config';

export default async function SettingsPage() {
  const ability = await getAbilityForCurrentUser();
  redirect(resolveSettingsRoute('cpm', ability));
}
