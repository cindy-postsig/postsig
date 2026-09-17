'use client';

import { usePathname } from 'next/navigation';
import { getSettingsBasePathForPath } from '@/lib/settings/config';

/**
 * Settings route prefix for the module the user is currently in:
 * `/investor/settings` under the investor app, `/settings` otherwise.
 *
 * Use this instead of hardcoding `/settings/...` in any component shared
 * between the CPM and investor settings pages.
 */
export function useSettingsBasePath(): string {
  const pathname = usePathname();
  return getSettingsBasePathForPath(pathname ?? '');
}
