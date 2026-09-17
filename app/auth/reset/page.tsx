import { SubmitButton } from '@/components/SubmitButton';
import Image from 'next/image';
import { resetPasswordForEmail } from '@/data/users';
import { Alert } from '@/components/ui/alert';
import Link from 'next/link';

export default async function Reset({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ message: string; error: string }>;
}) {
  const searchParams = await searchParamsPromise;
  return (
    <div className="flex w-full flex-1 flex-col justify-center gap-2 px-8 sm:max-w-md">
      <div className="">
        <Link href={'/'}>
          <Image
            src={'/PS_Icon.svg'}
            alt="PS Icon"
            width={60}
            height={75.17}
            className="mb-12"
          />
        </Link>
        <form className="mb-8 flex w-full flex-1 flex-col justify-center gap-4 text-foreground">
          {searchParams?.message && (
            <Alert variant={'default'}>{searchParams.message}</Alert>
          )}
          {searchParams?.error && (
            <Alert variant={'destructive'}>{searchParams.error}</Alert>
          )}
          <input
            className="rounded border bg-inherit px-4 py-4 font-sans text-lg"
            name="email"
            placeholder="email"
            required
          />
          <SubmitButton
            formAction={resetPasswordForEmail}
            className="rounded bg-black px-4 py-4 text-lg text-foreground text-white"
            pendingText="Sending..."
          >
            Request password reset email
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
