import PasswordUpdate from './PasswordUpdate';

export default async function UpdatePassword({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{
    message: string;
    code: string;
    error: string;
    error_description: string;
    error_code: string;
    token: string;
    email: string;
  }>;
}) {
  const searchParams = await searchParamsPromise;
  return <PasswordUpdate searchParams={searchParams} />;
}
