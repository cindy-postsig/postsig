import { type AppAbility, canUser } from '@postsig/toolkit';

export type AppModule = 'cpm' | 'investor';

export const MODULE_IDS: Record<AppModule, number> = {
  cpm: 1,
  investor: 2,
} as const;

interface SettingsItemConfig {
  key: string;
  name: string;
  path: string;
  modules: AppModule[] | 'all';
  permission?: { action: 'manage'; subject: 'Organization' | 'Group' };
  trialVisible?: boolean;
}

export interface SettingsNavItem {
  key: string;
  name: string;
  href: string;
  permission?: { action: 'manage'; subject: 'Organization' | 'Group' };
}

export interface SettingsSectionVisibility {
  modules: AppModule[] | 'all';
}

const settingsItemConfigs: SettingsItemConfig[] = [
  {
    key: 'organization',
    name: 'Organization',
    path: 'organization',
    modules: 'all',
    permission: { action: 'manage', subject: 'Organization' },
  },
  {
    key: 'groups',
    name: 'Sharing Groups',
    path: 'groups',
    modules: 'all',
    permission: { action: 'manage', subject: 'Group' },
  },
  {
    key: 'employees',
    name: 'Employees',
    path: 'employees',
    modules: ['cpm'],
    permission: { action: 'manage', subject: 'Organization' },
  },
  {
    key: 'application',
    name: 'Application',
    path: 'application',
    modules: ['cpm'],
    permission: { action: 'manage', subject: 'Organization' },
    trialVisible: false,
  },
  {
    key: 'integrations',
    name: 'Integrations',
    path: 'integrations',
    modules: ['cpm'],
    permission: { action: 'manage', subject: 'Organization' },
    trialVisible: false,
  },
  {
    key: 'kpis',
    name: 'KPIs',
    path: 'kpis',
    modules: ['investor'],
    permission: { action: 'manage', subject: 'Organization' },
  },
];

export const applicationSections: Record<string, SettingsSectionVisibility> = {
  fiscalYear: { modules: 'all' },
  requiredClauses: { modules: ['cpm'] },
};

function getSettingsBasePath(module: AppModule): string {
  switch (module) {
    case 'investor':
      return '/investor/settings';
    case 'cpm':
    default:
      return '/settings';
  }
}

// The investor settings pages re-export the CPM ones, so shared components
// render under both `/settings/*` and `/investor/settings/*`. Any absolute
// `/settings/...` link in those components drops an investor user into the CPM
// module. Derive the prefix from the live pathname instead.
export function getSettingsBasePathForPath(pathname: string): string {
  return getSettingsBasePath(
    pathname === '/investor' || pathname.startsWith('/investor/')
      ? 'investor'
      : 'cpm',
  );
}

function getSettingsFallbackRoute(module: AppModule): string {
  switch (module) {
    case 'investor':
      return '/investor';
    case 'cpm':
    default:
      // Profile is the always-available landing page — Notifications requires
      // CPM access and Connected apps requires MCP, so neither is safe as a
      // universal fallback.
      return '/account/profile';
  }
}

export function isVisibleForModule(
  visibility: AppModule[] | 'all',
  currentModule: AppModule,
): boolean {
  if (visibility === 'all') return true;
  return visibility.includes(currentModule);
}

export interface GetSettingsNavItemsOptions {
  isInvestorTrial?: boolean;
  portcoKpisEnabled?: boolean;
}

export function getSettingsNavItems(
  module: AppModule,
  options: GetSettingsNavItemsOptions = {},
): SettingsNavItem[] {
  const basePath = getSettingsBasePath(module);
  const { isInvestorTrial = false, portcoKpisEnabled = false } = options;

  return settingsItemConfigs
    .filter((item) => {
      if (!isVisibleForModule(item.modules, module)) return false;
      if (item.key === 'kpis' && !portcoKpisEnabled) return false;
      // Hide items marked as trialVisible: false when in investor trial mode
      if (
        module === 'investor' &&
        isInvestorTrial &&
        item.trialVisible === false
      ) {
        return false;
      }
      return true;
    })
    .map((item) => ({
      key: item.key,
      name: item.name,
      href: `${basePath}/${item.path}`,
      permission: item.permission,
    }));
}

export function resolveSettingsRoute(
  module: AppModule,
  ability: AppAbility | null | undefined,
  options: GetSettingsNavItemsOptions = {},
): string {
  const navItems = getSettingsNavItems(module, options);
  const firstAccessible = navItems.find((item) => {
    if (!item.permission) return true;
    return ability
      ? canUser(ability, item.permission.action, item.permission.subject)
      : false;
  });
  return firstAccessible?.href ?? getSettingsFallbackRoute(module);
}

export function isSettingsPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === '/settings' || pathname.includes('/settings/');
}
