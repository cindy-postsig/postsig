'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import { Switch } from '@/components/ui/switch';

export default function EmailAlertForm({ user }: { user: any }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [emailAlerts, setEmailAlerts] = useState<boolean>(false);
  const router = useRouter();

  const getUserData = useCallback(async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('email_alerts')
        .eq('id', user.userId)
        .single();
      if (error) throw error;
      if ((data as any)?.email_alerts) {
        setEmailAlerts((data as any).email_alerts);
      }
    } catch (error: any) {
      toast(generateToastError(error.message, 'Error loading user data!'));
    } finally {
      setLoading(false);
    }
  }, [user, supabase, router, toast]);

  useEffect(() => {
    getUserData();
  }, [getUserData]);

  const updateEmailAlert = async (value: boolean) => {
    if (!user) {
      router.push('/login');
      return;
    }
    try {
      setLoading(true);
      const { error } = await (supabase.from('users').update as any)({
        email_alerts: value,
      }).eq('id', user.userId);

      if (error) throw error;

      setEmailAlerts(value);
      toast({
        description: 'Email alerts updated successfully',
        variant: 'default',
      });
    } catch (error: any) {
      console.error('Error updating email alerts:', error);
      toast(generateToastError(error.message, 'Error updating email alerts!'));
    } finally {
      setLoading(false);
      window.location.reload();
    }
  };

  return (
    <div className="w-36">
      <Switch
        checked={emailAlerts || false}
        onCheckedChange={updateEmailAlert}
        disabled={loading}
      />
    </div>
  );
}
