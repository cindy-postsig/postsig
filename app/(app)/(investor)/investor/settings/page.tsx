import { redirect } from 'next/navigation';
import { getAbilityForCurrentUser } from '@/data/user-permissions';
import { resolveSettingsRoute } from '@/lib/settings/config';

export default async function InvestorSettingsPage() {
  const ability = await getAbilityForCurrentUser();
  redirect(resolveSettingsRoute('investor', ability));
}
