import Link from 'next/link';
import { cookies } from 'next/headers';
import SettingsNav from './SettingsNav';
import { getUserMetadata } from '@/data/users';
import { getAccountNavItems } from '@/lib/account/config';
import { cn } from '@/lib/utils';

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cookieStore, userMetadata] = await Promise.all([
    cookies(),
    getUserMetadata(),
  ]);

  const activeModule = cookieStore.get('postsig_active_module')?.value;
  const isVenture = activeModule === 'venture';

  const navItems = getAccountNavItems(userMetadata);

  return (
    <div className="flex">
      <aside className="sticky top-14 h-[calc(100vh-3.5rem)] w-1/5 min-w-72 flex-shrink-0 self-start bg-background">
        <div className="flex h-full flex-col justify-between">
          <div className="flex flex-col px-6 py-8 2xl:px-8">
            <h1
              className={cn(
                'mb-6',
                isVenture ? 'font-normal font-sans' : 'font-serif',
              )}
            >
              Account
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
