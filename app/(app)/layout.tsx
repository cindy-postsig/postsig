import '@/app/globals.css';
import './layout.css';
import Nav from '@/components/Nav';
import LayoutWrapper from '@/components/layouts/LayoutWrapper';
import { SharingDialogProvider } from './SharingDialogContext';
import { SharingDialogWrapper } from './SharingDialogWrapper';
import {
  fetchAllOrgUsersWithRoles,
  fetchOrgGroups,
  type User,
  type Group,
} from '@/app/lib/sharing/actions';
import { getUserMetadata } from '@/data/users';
import { checkAbility } from '@/data/user-permissions';
import { isPortfolioHidden } from '@/lib/navigation/portfolioVisibility';
import { isAssignmentsEnabled } from '@/lib/v2/assignments/flag';
import logger from '@/utils/pino';
import { QueryProvider } from '@/lib/providers/query-provider';
import { ModeProvider } from '@/contexts/ModeContext';
import { ColumnLayoutProvider } from '@/contexts/ColumnLayoutContext';
import { HeaderContent } from '@/components/navigation/HeaderContent';
import InvestorThemeScope from '@/components/layouts/InvestorThemeScope';
import { isFeatureEnabled } from '@/lib/flagkit';
import { hasExchangeAgreementAccess } from '@/lib/exchange-agreement/access';
import { hasInvoicesAccess } from '@/lib/v2/invoices/access';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // getUserMetadata() is called in root layout too, but Next.js dedupes the request
  const userMetadata = await getUserMetadata();
  const [
    isBeta,
    hidePortfolio,
    exchangeAgreementsAccess,
    invoicesEnabled,
    assignmentsEnabled,
  ] = await Promise.all([
    isFeatureEnabled('beta-sign', {
      userId: userMetadata?.userId ?? '',
      organizationId: userMetadata?.organizationId ?? '',
    }).catch((error) => {
      logger.error({ error }, 'Failed to evaluate beta-sign feature flag');
      return false;
    }),
    isPortfolioHidden(userMetadata?.userId, userMetadata?.organizationId),
    hasExchangeAgreementAccess(),
    hasInvoicesAccess(),
    userMetadata ? isAssignmentsEnabled(userMetadata) : Promise.resolve(false),
  ]);
  const investorModule = userMetadata?.appModules.find(
    (module) => module.code === 'investor',
  );

  // Fetch org data on server - no loading state needed!
  let initialOrgData:
    | {
        allUsers: User[];
        adminsAndManagers: User[];
        groups: Group[];
        organizationName: string;
        currentUser?: User;
      }
    | undefined = undefined;

  // The roster this preloads (names, emails, roles, user ids) only feeds the
  // sharing, folder and group dialogs, all of which need `share`. Without it the
  // payload would hand every viewer the whole organization on every page.
  const canShare = await checkAbility('share', 'Contract');

  try {
    if (canShare) {
      // Pass organizationId to avoid duplicate getUserMetadata() call
      const [usersData, groupsData] = await Promise.all([
        fetchAllOrgUsersWithRoles(
          userMetadata?.organizationId,
          userMetadata?.organizationName || undefined,
        ),
        fetchOrgGroups(),
      ]);
      initialOrgData = {
        allUsers: usersData.allUsers,
        adminsAndManagers: usersData.adminsAndManagers,
        groups: groupsData,
        organizationName: usersData.organizationName,
        currentUser: usersData.currentUser,
      };
    }
  } catch (error) {
    // Fallback to client-side fetch if server fetch fails
    logger.error(
      { error, organizationId: userMetadata?.organizationId },
      'Failed to fetch org data on server',
    );
  }

  return (
    <QueryProvider>
      <ModeProvider>
        <ColumnLayoutProvider initialStore={userMetadata?.columnLayouts}>
          <SharingDialogProvider
            initialOrgData={initialOrgData}
            canLoadOrgData={canShare}
          >
            <InvestorThemeScope>
              {/* Fixed header */}
              <header className="fixed left-0 right-0 top-0 z-50 flex h-14 justify-between border-b bg-background px-3">
                <HeaderContent
                  assistantEnabled={!!userMetadata?.assistantEnabled}
                  investorTrialEnabled={!!userMetadata?.investorTrialEnabled}
                  hidePortfolio={hidePortfolio}
                  isBeta={isBeta}
                />
              </header>

              <div className="flex pt-14">
                {/* Fixed sidebar */}
                <aside className="fixed bottom-0 left-0 top-14 z-40">
                  <Nav
                    env={process.env.ENV}
                    hidePortfolio={hidePortfolio}
                    exchangeAgreementsEnabled={exchangeAgreementsAccess}
                    invoicesEnabled={invoicesEnabled}
                    assignmentsEnabled={assignmentsEnabled}
                  />
                </aside>

                {/* Main content area with natural scrolling */}
                <main className="ml-14 max-w-[calc(100vw-3.5rem)] flex-grow bg-background">
                  <LayoutWrapper>{children}</LayoutWrapper>
                </main>
              </div>

              {/* Fixed footer */}
              <footer className="fixed bottom-0 left-0 right-0 z-40 bg-transparent">
                {/*<div className="flex h-10 items-center justify-center rounded-sm border-t bg-background text-center font-label text-xs text-muted-foreground text-opacity-75">
              PostSig Inc. &copy; {new Date().getFullYear()}. All rights reserved.
            </div>*/}
              </footer>

              {/* Global sharing dialog */}
              <SharingDialogWrapper />
            </InvestorThemeScope>
          </SharingDialogProvider>
        </ColumnLayoutProvider>
      </ModeProvider>
    </QueryProvider>
  );
}
