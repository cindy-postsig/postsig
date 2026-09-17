'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SubmitButton } from '@/components/SubmitButton';
import PasswordToggle from '@/components/auth/PasswordToggle';
import Image from 'next/image';
import { createClient } from '@/utils/supabase/client';
import { Alert } from '@/components/ui/alert';
import Link from 'next/link';
import { resetPasswordForEmail } from '@/data/users';

interface PasswordUpdateProps {
  searchParams: {
    message: string;
    error: string | null;
    error_description: string | null;
    error_code: string | null;
  };
}

const PasswordUpdate: React.FC<PasswordUpdateProps> = ({ searchParams }) => {
  const [message, setMessage] = useState(searchParams.message);
  const [error, setError] = useState(searchParams.error);
  const [errorDescription, setErrorDescription] = useState(
    searchParams.error_description,
  );
  const [isDisabled, setIsDisabled] = useState(false);
  const [isLinkExpired, setIsLinkExpired] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    if (
      params.get('error') === 'access_denied' &&
      params
        .get('error_description')
        ?.includes('Email link is invalid or has expired')
    ) {
      setIsLinkExpired(true);
    }
  }, [params]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = formData.get('password') as string;
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      const { name } = error;
      if (name === 'AuthSessionMissingError') {
        setTimeout(() => {
          router.push('/login');
        }, 2000);
        setErrorDescription(null);
        setError(
          'User session is not found. Redirecting you to the login page...',
        );
      } else {
        setError(error.message);
      }
    } else {
      setIsDisabled(true);
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
      setMessage(
        'Password successfully updated. Redirecting you to your dashboard...',
      );
      setError('');
    }
  };

  if (isLinkExpired) {
    return (
      <div className="flex w-full flex-1 flex-col justify-center gap-2 px-8 sm:max-w-md">
        <div>
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
            <Alert variant={'destructive'}>
              <span
                className={`${searchParams.error_code === '403' && 'font-bold'}`}
              >
                {errorDescription ? errorDescription : error}
              </span>
              {searchParams.error_code === '403' && (
                <p>Request a new link below.</p>
              )}
            </Alert>
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
              Request new password reset email
            </SubmitButton>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col justify-center gap-2 px-8 sm:max-w-md">
      <div>
        <Image
          src={'/PS_Icon.svg'}
          alt="PS Icon"
          width={60}
          height={75.17}
          className="mb-12"
        />
        <form
          className="mb-8 flex w-full flex-1 flex-col justify-center gap-2 text-foreground"
          onSubmit={handleSubmit}
        >
          <h3>Enter a new password</h3>
          <div className="relative mb-2">
            <input
              id="password"
              className="w-full rounded border bg-inherit px-4 py-4 pr-10 font-label text-xl text-foreground disabled:text-opacity-50"
              name="password"
              placeholder="new password"
              type="password"
              required
              disabled={isDisabled}
            />
            {!isDisabled && <PasswordToggle inputId="password" />}
          </div>
          <SubmitButton
            className="rounded bg-black px-4 py-4 text-lg text-foreground text-white"
            pendingText="Updating..."
            disabled={isDisabled}
          >
            Update Password
          </SubmitButton>
          {message && <Alert variant={'default'}>{message}</Alert>}
          {error && (
            <Alert variant={'destructive'}>
              {errorDescription ? errorDescription : error}
            </Alert>
          )}
        </form>
      </div>
    </div>
  );
};

export default PasswordUpdate;
