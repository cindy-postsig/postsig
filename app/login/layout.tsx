import { GeistSans } from 'geist/font/sans';
import '@/app/globals.css';
import Link from 'next/link';
import AuthButton from '@/components/AuthButton';
import { createClient } from '@/utils/supabase/server';
import Image from 'next/image';

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
        {/* <div className="flex w-full py-1"></div> */}
        {children}
      </main>
    </>
  );
}
