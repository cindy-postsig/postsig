import Link from 'next/link';
import { SettingsNav } from './SettingsNav';
import { getAbilityForCurrentUser } from '@/data/user-permissions';
import { getUserMetadata } from '@/data/users';
import { canUser } from '@postsig/toolkit/abilities';
import {
  type AppModule,
  type SettingsNavItem,
  getSettingsNavItems,
} from '@/lib/settings/config';
import { cn } from '@/lib/utils';

interface SettingsLayoutProps {
  module: AppModule;
  children: React.ReactNode;
}

export async function SettingsLayout({
  module,
  children,
}: SettingsLayoutProps) {
  const [ability, userMetadata] = await Promise.all([
    getAbilityForCurrentUser(),
    getUserMetadata(),
  ]);
  if (!ability) return null;

  const isInvestorTrial =
    module === 'investor' && (userMetadata?.investorTrialEnabled ?? false);

  const moduleNavItems = getSettingsNavItems(module, {
    isInvestorTrial,
    portcoKpisEnabled: userMetadata?.portcoKpisEnabled ?? false,
  });

  const navItems = moduleNavItems.filter((item: SettingsNavItem) => {
    if (!item.permission) return true;
    return canUser(ability, item.permission.action, item.permission.subject);
  });

  return (
    <div className="flex">
      <aside className="sticky top-14 h-[calc(100vh-3.5rem)] w-1/5 min-w-72 flex-shrink-0 self-start bg-background">
        <div className="flex h-full flex-col justify-between">
          <div className="flex flex-col px-6 py-8 2xl:px-8">
            <h1
              className={cn(
                'mb-6',
                module === 'investor' ? 'font-normal font-sans' : 'font-serif',
              )}
            >
              Settings
            </h1>
            <SettingsNav navItems={navItems} />
          </div>
          <div className="mt-auto p-6 2xl:p-8">
            <Link
              className="text-sm text-muted-foreground/60 hover:text-muted-foreground"
              href="https://postsig.com/legal/terms/"
              target="_blank"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-grow bg-background">{children}</main>
    </div>
  );
}
