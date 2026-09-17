import { redirect } from 'next/navigation';
import { signInWithPassword, getUser } from '@/data/users';
import LoginForm from '@/components/login-form';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default async function Login({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{
    message: string;
    rid: string;
    redirect: string;
    utm_campaign?: string;
    utm_source?: string;
    utm_medium?: string;
  }>;
}) {
  const searchParams = await searchParamsPromise;
  // Redirect users from the specific email campaigns to the blog post
  if (
    (searchParams.utm_campaign === '5819395-New Product Features & Releases' ||
      searchParams.utm_campaign === '22236687-Inventory Launch') &&
    searchParams.utm_source === 'hs_email'
  ) {
    redirect(
      'https://go.postsig.com/blog/introducing-postsig-inventory-the-foundation-for-market-data-control',
    );
  }
  return (
    <div className="flex w-full max-w-md flex-1 flex-col justify-center gap-2 px-8 lg:max-w-lg">
      <Card className="border-border/80 bg-transparent px-4 shadow-sm">
        <CardHeader></CardHeader>
        <CardContent>
          <LoginForm
            message={searchParams?.message}
            rid={searchParams?.rid}
            redirect={searchParams?.redirect}
          />
        </CardContent>
      </Card>
    </div>
  );
}
