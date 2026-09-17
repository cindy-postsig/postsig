import type { UserMetadata } from '@/constants/types';

export interface AccountNavItem {
  name: string;
  href: string;
}

interface AccountNavOptions {
  // Popout uses "Account" as the entry into account-scoped settings; the
  // in-account sidebar uses "Profile" to match the page heading.
  profileLabel?: string;
}

export function getAccountNavItems(
  userMetadata: UserMetadata | null | undefined,
  { profileLabel = 'Profile' }: AccountNavOptions = {},
): AccountNavItem[] {
  const hasCpm =
    userMetadata?.appModules?.some((m) => m.code === 'cpm') ?? false;

  return [
    { name: profileLabel, href: '/account/profile', show: true },
    { name: 'Notifications', href: '/account/notifications', show: hasCpm },
    { name: 'Security', href: '/account/security', show: true },
    { name: 'Connected Apps', href: '/account/connected-apps', show: true },
  ]
    .filter((item) => item.show)
    .map(({ name, href }) => ({ name, href }));
}
