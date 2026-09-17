import { GeistSans } from 'geist/font/sans';
import '@/app/globals.css';
import Link from 'next/link';
import AuthButton from '@/components/AuthButton';
import { createClient } from '@/utils/supabase/server';
import Image from 'next/image';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <>
      <main className="layout flex min-h-screen flex-col items-center">
        <div className="flex w-full max-w-md flex-1 flex-col justify-center gap-2 px-8 sm:max-w-lg">
          <Card className="border-border/80 bg-transparent px-4 shadow-sm">
            <CardHeader></CardHeader>
            <CardContent>
              <Link href={'/'} className="float-left">
                <Image
                  src={'/PS_Icon.svg'}
                  alt="PS Icon"
                  height={60}
                  width={47.78}
                  className="mb-8 dark:invert"
                />
              </Link>
              {children}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
