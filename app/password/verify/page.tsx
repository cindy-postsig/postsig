import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import VerifyOTP from './VerifyOTP';

interface VerifyProps {
  searchParams: Promise<{
    email: string;
    message: string;
    error: string | null;
    error_description: string | null;
  }>;
}

const VerifyPage = async ({
  searchParams: searchParamsPromise,
}: VerifyProps) => {
  const searchParams = await searchParamsPromise;
  const cookieStore = await cookies();
  const email = cookieStore.get('temp_email')?.value;

  // Redirect if the email cookie is missing or expired
  if (!email) {
    redirect('/password/reset?error=Session expired');
  }

  return <VerifyOTP searchParams={searchParams} email={email} />;
};

export default VerifyPage;
