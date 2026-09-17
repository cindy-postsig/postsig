'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '../ui/input';
import PasswordInput from '../auth/PasswordInput';
import { Button } from '../ui/button';
import { ChevronRight } from 'lucide-react';

export default function SignUpForm({ user }: { user: any }) {
  const [password, setPassword] = useState('');
  const [name, setName] = useState<string | undefined>(undefined);
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [email, setEmail] = useState<string | undefined>(undefined);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const labelStyles = 'text-sm';

  const getUser = useCallback(async () => {
    try {
      setLoading(true);
      if (user) {
        setName(user?.name);
        setEmail(user?.email);
      }
    } catch (error) {
      alert('Error loading user data!');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    getUser();
  }, [getUser]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name?.trim() || !password.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user,
          email,
          password,
          name,
          jobTitle,
          department,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error);
      }

      router.push('/mfa/enroll');
    } catch (error) {
      setError((error as Error).message || 'Error signing up');
      toast({
        variant: 'destructive',
        title: 'Sign Up Failed',
        description: (error as Error).message || 'Error signing up',
      });
      setLoading(false);
    }
  };

  return (
    <div className="flex w-full max-w-xl flex-col gap-10">
      <div className="flex w-full flex-col gap-6 font-serif">
        <Image
          src="/PS_Icon.svg"
          alt="PostSig Logo"
          width={40}
          height={40}
          className="dark:invert"
        />
        <div>
          <h2>Welcome to PostSig</h2>
          <p className="max-w-md leading-snug">
            We&apos;re so happy to have you. Please provide some details about
            yourself and set a password to create your account.
          </p>
        </div>
      </div>
      <form
        onSubmit={handleFormSubmit}
        className="mb-20 flex w-full max-w-xl flex-1 flex-col gap-4 text-foreground "
      >
        <div className="flex flex-col">
          <label className={labelStyles} htmlFor="name">
            Full Name
          </label>
          <Input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col">
          <label className={labelStyles} htmlFor="email">
            Email
          </label>
          <Input
            type="text"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled
          />
        </div>
        <div className="flex gap-4">
          <div className="flex w-1/2 flex-col">
            <label className={labelStyles} htmlFor="jobTitle">
              Job Title <span className="pl-1 opacity-60">Optional</span>
            </label>
            <Input
              type="text"
              id="jobTitle"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>
          <div className="flex w-1/2 flex-col">
            <label className={labelStyles} htmlFor="department">
              Department <span className="pl-1 opacity-60">Optional</span>
            </label>
            <Input
              type="text"
              id="department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col">
          <label className={labelStyles} htmlFor="password">
            Password
          </label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`font-label tracking-widest`}
            showValidation={true}
            required
          />
        </div>
        {error && <p className="break-words text-sm text-red-500">{error}</p>}
        <Button type="submit" disabled={loading} size={'lg'} className="mt-6">
          {loading ? (
            'Signing up...'
          ) : (
            <>
              Continue
              <ChevronRight className="ml-1 h-4 w-4" />
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
