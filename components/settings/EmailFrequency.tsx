'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';

export default function EmailFrequencyForm({
  user,
  emailAlerts,
}: {
  user: any;
  emailAlerts: boolean;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [emailFrequency, setEmailFrequency] = useState<string | null>(null);
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
        .select('email_frequency')
        .eq('id', user.userId)
        .single();
      if (error) throw error;
      if ((data as any)?.email_frequency) {
        setEmailFrequency((data as any).email_frequency.toString());
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

  const updateEmailFrequency = async (value: string) => {
    if (!user) {
      router.push('/login');
      return;
    }
    try {
      setLoading(true);
      const { error } = await (supabase.from('users').update as any)({
        email_frequency: value,
      }).eq('id', user.userId);

      if (error) throw error;

      setEmailFrequency(value);
      toast({
        description: 'Email frequency updated successfully',
        variant: 'default',
      });
    } catch (error: any) {
      console.error('Error updating email frequency:', error);
      toast(
        generateToastError(error.message, 'Error updating email frequency!'),
      );
    } finally {
      setLoading(false);
      window.location.reload();
    }
  };

  const emailFrequencies = ['Weekly', 'Monthly'];

  return (
    <div className="w-36">
      <Select
        value={emailFrequency || undefined}
        onValueChange={updateEmailFrequency}
        disabled={loading || !emailAlerts}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select email frequency" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Email Frequency</SelectLabel>
            {emailFrequencies.map((frequency, index) => (
              <SelectItem key={frequency} value={frequency}>
                {frequency}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
