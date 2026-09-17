'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { SubmitButton } from '@/components/SubmitButton';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SearchParams {
  message?: string;
  error?: string;
  accountType: string | undefined;
}

interface InviteFormProps {
  searchParams: SearchParams;
  user: any;
}

export default function InviteForm({ searchParams, user }: InviteFormProps) {
  const [standardMessage, setStandardMessage] = useState('');
  const [standardError, setStandardError] = useState('');
  const [trialMessage, setTrialMessage] = useState('');
  const [trialError, setTrialError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const { message, error, accountType } = searchParams;

    if (accountType === 'standard') {
      setStandardMessage(message || '');
      setStandardError(error || '');
    } else if (accountType === 'trial') {
      setTrialMessage(message || '');
      setTrialError(error || '');
    }
  }, [searchParams]);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
    inviteType: string,
    formType: 'standard' | 'trial',
  ) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;
    const fullName = formData.get('name') as string;

    try {
      const response = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, inviteType, fullName }),
      });

      const result = await response.json();

      if (response.ok) {
        if (formType === 'standard') {
          setStandardMessage(result.message);
          setStandardError('');
        } else {
          setTrialMessage(result.message);
          setTrialError('');
        }
        router.push(
          `/invite?message=${encodeURIComponent(result.message)}&formType=${formType}`,
        );
      } else {
        if (formType === 'standard') {
          setStandardError(result.error);
          setStandardMessage('');
        } else {
          setTrialError(result.error);
          setTrialMessage('');
        }
        router.push(
          `/invite?error=${encodeURIComponent(result.error)}&formType=${formType}`,
        );
      }
    } catch (error) {
      if (formType === 'standard') {
        setStandardError('An unexpected error occurred');
        setStandardMessage('');
      } else {
        setTrialError('An unexpected error occurred');
        setTrialMessage('');
      }
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center gap-12 p-12">
      <h1 className="font-serif">Invite Users</h1>
      <Tabs defaultValue="account" className="w-2/5">
        <TabsList className="grid w-full grid-cols-2 font-sans">
          <TabsTrigger value="account">Standard User</TabsTrigger>
          <TabsTrigger value="password">Trial User</TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>Standard User</CardTitle>
              <CardDescription>
                Sends an email to invite a user to sign up with full access to
                PostSig.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <form
                className="flex flex-1 flex-col justify-center gap-2 text-foreground"
                onSubmit={(e) => handleSubmit(e, 'standard', 'standard')}
              >
                <input
                  className="mb-2 rounded border bg-inherit px-4 py-4 text-lg"
                  name="name"
                  placeholder="Full Name"
                  required
                />
                <input
                  className="mb-2 rounded border bg-inherit px-4 py-4 text-lg"
                  name="email"
                  placeholder="Email"
                  required
                />
                <SubmitButton
                  className="mb-2 rounded bg-blue-950 px-4 py-4 font-sans text-lg text-foreground text-white hover:bg-navy"
                  pendingText="Sending Invite..."
                >
                  Invite Standard User
                </SubmitButton>
              </form>
            </CardContent>
            <CardFooter>
              {standardMessage && (
                <p className="w-full rounded bg-gray-700/10 p-4 text-center text-foreground">
                  {standardMessage}
                </p>
              )}
              {standardError && (
                <p className="w-full rounded bg-gray-700/10 p-4 text-center text-red-500">
                  {standardError}
                </p>
              )}
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="password">
          <Card>
            <CardHeader>
              <CardTitle>Trial User</CardTitle>
              <CardDescription>
                Sends an email to invite a trial user to sign up. After signing
                up, users will be redirected to the Upload app, and the PostSig
                App will have limited features.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <form
                className="flex flex-1 flex-col justify-center gap-2 text-foreground"
                onSubmit={(e) => handleSubmit(e, 'trial', 'trial')}
              >
                <input
                  className="mb-2 rounded border bg-inherit px-4 py-4 text-lg"
                  name="name"
                  placeholder="Full Name"
                  required
                />
                <input
                  className="mb-2 rounded border bg-inherit px-4 py-4 text-lg"
                  name="email"
                  placeholder="Email"
                  required
                />
                <SubmitButton
                  className="mb-2 rounded bg-blue-950 px-4 py-4 font-sans text-lg text-foreground text-white hover:bg-navy"
                  pendingText="Sending Invite..."
                >
                  Invite Trial User
                </SubmitButton>
              </form>
            </CardContent>
            <CardFooter>
              {trialMessage && (
                <p className="w-full rounded bg-gray-700/10 p-4 text-center text-foreground">
                  {trialMessage}
                </p>
              )}
              {trialError && (
                <p className="w-full rounded bg-gray-700/10 p-4 text-center text-red-500">
                  {trialError}
                </p>
              )}
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
