'use client';
import { useState, useEffect } from 'react';
import { redirect, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function TokenRefresh() {
  const [email, setEmail] = useState('');
  const [next, setNext] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email');
  const nextParam = searchParams.get('next');

  if (!emailParam) {
    redirect('/');
  }

  useEffect(() => {
    if (emailParam && nextParam) {
      let decodedEmail;
      if (emailParam.includes('+')) {
        // If it already contains a '+', assume it's partially decoded
        decodedEmail = emailParam.replace(/%40/g, '@');
      } else {
        // If it doesn't contain a '+', decode it fully
        decodedEmail = decodeURIComponent(emailParam.replace(/\+/g, ' '));
      }
      setEmail(decodedEmail);
      setNext(nextParam);
    } else {
      console.error('Email parameter is missing from the URL');
    }
  }, [searchParams, emailParam, nextParam]);

  const handleRefreshToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/auth/refresh-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, next }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('A new invitation link has been sent to your email.');
      } else {
        setMessage(data.error || 'An error occurred. Please try again.');
      }
    } catch (error) {
      setMessage('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-16 flex w-full max-w-xl flex-col items-center gap-8 rounded-md bg-white px-8 py-12">
      <div className="text-center font-serif">
        <h1 className="mb-2 text-4xl">Invite link expired</h1>
      </div>
      <form onSubmit={handleRefreshToken} className="w-full max-w-md">
        <div className="mb-4">
          <Input
            type="email"
            id="email"
            value={email}
            readOnly
            disabled
            className="h-14 border border-navy border-opacity-30 bg-white bg-opacity-50 text-center font-sans text-xl disabled:opacity-80"
          />
        </div>
        <Button
          type="submit"
          disabled={isLoading || !email}
          className="mb-2 h-14 w-full rounded bg-blue-950 font-sans text-lg text-foreground text-white hover:bg-navy disabled:opacity-50"
        >
          {isLoading ? 'Sending...' : 'Request New Invite'}
        </Button>
        {message && (
          <div className="mt-4 w-full p-4 text-center font-label text-sm">
            {message}
          </div>
        )}
      </form>
    </div>
  );
}
