'use client';
import { createClient } from '@/utils/supabase/client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { type User } from '@supabase/supabase-js';
import { track } from '@vercel/analytics';
import { Input } from '../ui/input';
import { SubmitButton } from '../SubmitButton';
import PasswordInput from '../auth/PasswordInput';
import Image from 'next/image';
import { Button } from '../ui/button';
import { Label } from '../ui/label';

export default function TrialSignUpForm({
  user,
  userMetadata,
}: {
  user: User | null;
  userMetadata: { organizationName: string | undefined };
}) {
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState<string | undefined>(undefined);
  const [organization, setOrganization] = useState<string | undefined>(
    undefined,
  );
  const [email, setEmail] = useState<string | undefined>(undefined);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const router = useRouter();

  const inputStyles =
    'h-14 border border-navy bg-white bg-opacity-50 font-sans text-lg border-opacity-30';

  const getUser = useCallback(async () => {
    try {
      setLoading(true);
      if (user) {
        setName(user?.user_metadata.full_name);
        setEmail(user?.email);
        setOrganization(userMetadata.organizationName);
      }
    } catch (error) {
      alert('Error loading user data!');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    // Get the token from the query parameters
    const urlParams = new URLSearchParams(window.location.search);
    // const token = urlParams.get('token_hash');
    // setToken(token);

    // if (!token) {
    //   router.push('/login');
    // }
    getUser();
  }, [router, getUser]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user,
          email,
          password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error);
      }

      router.push('/signup/terms');
    } catch (error) {
      setError((error as Error).message || 'Error signing up');
      console.error('Error signing up:', (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleUpdateProfile}
      className="mb-20 flex w-full max-w-[30rem] flex-1 flex-col gap-6 text-foreground "
    >
      <div
        className="flex flex-col justify-between rounded-xl bg-white/50 p-8 shadow-md"
        style={{ aspectRatio: '1.6/1' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl leading-none">PostSig Trial</h2>
          <Image
            src={'/PS_Icon.svg'}
            width={30}
            height={37.585}
            alt="PostSig Logo"
          />
        </div>
        <div>
          <p className="font-serif text-lg font-var-350">{name}</p>
          <p className="font-serif text-sm">{email}</p>
          <p className="font-serif text-sm">{organization}</p>
        </div>
      </div>

      <div>
        <h3 className="mt-8 font-sans">Confirm your trial account</h3>
      </div>
      <div className="flex flex-col">
        <Label htmlFor="password">
          Password
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${inputStyles} font-label tracking-widest`}
            showValidation={true}
            required
          />
        </Label>
      </div>
      <div className="flex flex-col">
        <Label htmlFor="confirmPassword">
          Confirm Password
          <PasswordInput
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={`${inputStyles} font-label tracking-widest`}
            required
          />
        </Label>
      </div>
      {error && <p className="text-red-500">{error}</p>}
      <Button type="submit" disabled={loading} className="mt-4 h-14">
        {loading ? 'Setting up account...' : 'Confirm Account'}
      </Button>
    </form>
  );
}
