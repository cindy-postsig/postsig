'use client';
import { createClient } from '@/utils/supabase/client';
import { useState, useEffect, useCallback } from 'react';
import { redirect, usePathname, useRouter } from 'next/navigation';
import { type User } from '@supabase/supabase-js';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '../ui/button';

export default function Terms({
  user,
  redirectUrl,
}: {
  user: User | null;
  redirectUrl: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleAcceptTerms = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/auth/signup?terms=1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error);
      }

      router.push(redirectUrl);
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h2 className="font-medium text-center font-sans">Terms of Service</h2>
      <p className="text-xl">
        Please review and accept our{' '}
        <Link
          target="_blank"
          href="https://postsig.com/legal/terms/"
          className="cursor-pointer text-primary"
        >
          Terms of Service
        </Link>
        .
      </p>

      <Button onClick={handleAcceptTerms} size={'lg'}>
        I have read and accept the terms
      </Button>
    </>
  );
}
