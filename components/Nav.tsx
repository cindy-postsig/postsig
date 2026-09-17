'use client';

import Link from 'next/link';
import NavLink from '@/components/NavLink';
import { usePathname } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Portal } from '@radix-ui/react-portal';
import { ModeToggle } from './mode-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SunIcon } from '@radix-ui/react-icons';
import { Settings } from 'lucide-react';
import SignOut from './SignOut';
import { UserContext } from '@/app/userProvider';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useMode } from '@/contexts/ModeContext';
import {
  getNavItemsForMode,
  isNavItemActive,
} from '@/components/navigation/navConfig';
import { ModeSwitcher } from '@/components/navigation/ModeSwitcher';
import {
  getSettingsNavItems,
  resolveSettingsRoute,
  type AppModule,
} from '@/lib/settings/config';
import { useAbility } from '@/components/providers/AbilityProvider';
import { getAccountNavItems } from '@/lib/account/config';
import { canUser } from '@postsig/toolkit/abilities';

interface NavProps {
  env?: string;
  hidePortfolio?: boolean;
  invoicesEnabled?: boolean;
  assignmentsEnabled?: boolean;
  exchangeAgreementsEnabled?: boolean;
}

const Nav = ({
  env,
  hidePortfolio = false,
  invoicesEnabled = false,
  assignmentsEnabled = false,
  exchangeAgreementsEnabled = false,
}: NavProps) => {
  const userContext = useContext(UserContext);
  const userMetadata = userContext?.userMetadata;
  const userId = userContext?.userMetadata?.userId;
  const userProfile = userMetadata?.userProfile;
  const [shouldHideNav, setShouldHideNav] = useState(false);
  const pathname = usePathname();
  const { mode } = useMode();
  const isInvestorTrial =
    userContext?.userMetadata?.investorTrialEnabled ?? false;

  useEffect(() => {
    const shouldHideNav = pathname === '/welcome';
    setShouldHideNav(shouldHideNav);
  }, [pathname]);

  const ability = useAbility();
  const navItems = getNavItemsForMode(
    mode,
    isInvestorTrial,
    hidePortfolio,
    assignmentsEnabled,
    invoicesEnabled,
    exchangeAgreementsEnabled,
  );
  const settingsModule: AppModule = mode === 'venture' ? 'investor' : 'cpm';

  const accountItems = getAccountNavItems(userMetadata, {
    profileLabel: 'Account',
  });

  const accessibleOrgItems = getSettingsNavItems(settingsModule, {
    isInvestorTrial,
    portcoKpisEnabled: userContext?.userMetadata?.portcoKpisEnabled ?? false,
  }).filter((item) => {
    if (!item.permission) return true;
    return ability
      ? canUser(ability, item.permission.action, item.permission.subject)
      : false;
  });
  const hasOrgAccess = accessibleOrgItems.length > 0;
  const orgSettingsHref = resolveSettingsRoute(settingsModule, ability);
  const workspaceLabel = userMetadata?.organizationName ?? 'Organization';
  const workspaceInitials = workspaceLabel
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex h-full w-14 min-w-14 flex-col border-r bg-background">
      <div className="flex-grow overflow-y-auto overflow-x-hidden">
        <nav className="mt-4 flex flex-col items-center gap-3">
          {!shouldHideNav &&
            navItems.map((item) => (
              <TooltipProvider key={item.href}>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger>
                    <NavLink
                      href={item.href}
                      selected={isNavItemActive(item, pathname)}
                    >
                      {item.icon}
                    </NavLink>
                  </TooltipTrigger>
                  <Portal>
                    <TooltipContent side="right">
                      <p>{item.tooltip}</p>
                    </TooltipContent>
                  </Portal>
                </Tooltip>
              </TooltipProvider>
            ))}
        </nav>
      </div>

      {/* Mode Switcher */}
      <div className="mb-2 flex items-center justify-center">
        <ModeSwitcher />
      </div>
      <div className="mb-5 flex h-10 items-center justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="cursor-pointer">
              <UserAvatar
                name={userProfile?.name}
                email={userProfile?.email}
                userId={userId}
                size="md"
              />
            </div>
          </DropdownMenuTrigger>
          <Portal>
            <DropdownMenuContent
              side="bottom"
              className="w-64 font-sans"
              align="start"
              alignOffset={0}
              sideOffset={10}
            >
              {hasOrgAccess ? (
                <DropdownMenuItem className="p-0" asChild>
                  <Link
                    href={orgSettingsHref}
                    className="flex w-full items-center justify-between gap-2 p-2 pr-3"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Avatar className="h-6 w-6 rounded-md">
                        <AvatarFallback className="font-medium rounded-md bg-foreground text-[0.65rem] text-background">
                          {workspaceInitials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium line-clamp-1 min-w-0">
                        {workspaceLabel}
                      </span>
                    </div>
                    <Settings className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  </Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuLabel className="font-medium flex items-center gap-2">
                  <Avatar className="h-6 w-6 rounded-md">
                    <AvatarFallback className="font-medium rounded-md bg-foreground text-[0.65rem] text-background">
                      {workspaceInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="line-clamp-1 min-w-0">{workspaceLabel}</span>
                </DropdownMenuLabel>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="font-normal">
                <div className="whitespace-normal break-words text-muted-foreground">
                  {userProfile?.email && userProfile.email}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {accountItems.map((item) => (
                <DropdownMenuItem key={item.href} className="p-0" asChild>
                  <Link href={item.href} className="flex w-full p-2">
                    {item.name}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="flex items-center gap-2 p-2">
                  <SunIcon />
                  Theme
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <ModeToggle />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="p-0" asChild>
                <SignOut />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </Portal>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default Nav;
