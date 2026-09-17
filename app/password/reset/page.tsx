import { SubmitButton } from '@/components/SubmitButton';
import Image from 'next/image';
import { resetPasswordForEmail } from '@/data/users';
import { Alert } from '@/components/ui/alert';
import Link from 'next/link';
import { Input } from '@/components/ui/input';

export default async function Reset({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ message: string; error: string }>;
}) {
  const searchParams = await searchParamsPromise;
  return (
    <form className="mb-4 flex w-full flex-1 flex-col justify-center gap-4 text-foreground">
      {searchParams?.message && (
        <Alert variant={'default'}>{searchParams.message}</Alert>
      )}
      {searchParams?.error && (
        <Alert variant={'destructive'}>{searchParams.error}</Alert>
      )}
      <Input
        className="h-14 rounded border bg-inherit px-4 font-sans text-lg"
        name="email"
        placeholder="email"
        required
      />
      <SubmitButton
        formAction={resetPasswordForEmail}
        className="h-14 rounded px-4 py-3 text-lg"
        pendingText="Sending..."
      >
        Request password reset
      </SubmitButton>
      <div className="mt-4 font-sans text-primary">
        <Link
          href="/login"
          className="text-sm text-gray-700 hover:text-primary"
        >
          &larr; Back to login
        </Link>
      </div>
    </form>
  );
}
