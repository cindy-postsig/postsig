'use client';

import { Button } from '@/components/ui/button';
import { useState, useContext } from 'react';
import { UserContext } from '@/app/userProvider';
import { Loader2 } from 'lucide-react';
import { resetAccount } from '@/app/lib/actions/user';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';

export default function ResetDemoAccount() {
  const router = useRouter();
  const { toast } = useToast();
  const userContext = useContext(UserContext);
  const userRole = userContext?.user?.appRole;
  const [loading, setLoading] = useState(false);
  async function onClick() {
    try {
      setLoading(true);
      await resetAccount();
      toast({ description: 'Account reset successfully' });
      setLoading(false);
      await router.push('/');
    } catch (error) {
      setLoading(false);
    }
  }
  // Inactive at the moment
  return (
    userRole === 'demo' && (
      <div className="mt-4">
        <Button disabled={loading} type="submit" onClick={onClick}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loading ? 'Please wait...' : 'Reset Account'}
        </Button>
      </div>
    )
  );
}
