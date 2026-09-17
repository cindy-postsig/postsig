import './globals.css';
import 'streamdown/styles.css';
import { Analytics } from '@vercel/analytics/react';
import UserContextProvider from '@/app/userProvider';
import { Toaster } from '@/components/ui/toaster';
import { getUserMetadata } from '@/data/users';
import { ThemeProvider } from '@/components/theme-provider';
import { TableExpandedStateProvider } from '@/app/context/TableExpandedStateContext';
import * as Sentry from '@sentry/nextjs';
import { AbilityProvider } from '@/components/providers/AbilityProvider';
import { ArchiveChildrenConfirmProvider } from '@/components/providers/ArchiveChildrenConfirmProvider';
import { ReactivateChildrenDialogProvider } from '@/components/providers/ReactivateChildrenDialogProvider';
import { RoleId } from '@postsig/toolkit';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { PostsigAssistant } from '@/components/chatbot/PostsigAssistant';
import { QueryProvider } from '@/lib/providers/query-provider';

const defaultUrl = process.env.APP_URL
  ? `https://${process.env.APP_URL}`
  : 'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: 'PostSig',
  description: 'Intelligent contract management.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userMetadata = await getUserMetadata();

  if (userMetadata) {
    Sentry.setUser({
      id: userMetadata.userId,
    });
    Sentry.setTag('organizationId', userMetadata.organizationId);
    Sentry.setTag('userId', userMetadata.userId);
    Sentry.setTag(
      'organizationName',
      userMetadata.organizationName ?? 'unknown',
    );
  }
  const roleId = (userMetadata?.userRole as RoleId) ?? 'guest';
  const userId = userMetadata?.userId ?? '';
  const organizationId = userMetadata?.organizationId ?? '';
  const investorModule = userMetadata?.appModules.find(
    (module) => module.code === 'investor',
  );
  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <NuqsAdapter>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>
              <UserContextProvider userMetadata={userMetadata}>
                <AbilityProvider
                  roleId={roleId}
                  userId={userId}
                  organizationId={organizationId}
                >
                  <TableExpandedStateProvider>
                    <ArchiveChildrenConfirmProvider>
                      <ReactivateChildrenDialogProvider>
                        {children}
                      </ReactivateChildrenDialogProvider>
                    </ArchiveChildrenConfirmProvider>
                  </TableExpandedStateProvider>
                  {userMetadata?.assistantEnabled && <PostsigAssistant />}
                </AbilityProvider>
              </UserContextProvider>
            </QueryProvider>
            <Toaster />
          </ThemeProvider>
        </NuqsAdapter>
      </body>
      <Analytics />
    </html>
  );
}
