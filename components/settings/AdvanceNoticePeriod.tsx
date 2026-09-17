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

export default function AdvanceNoticePeriodForm({ user }: { user: any }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [advanceNoticePeriod, setAdvanceNoticePeriod] = useState<string | null>(
    null,
  );
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
        .select('advance_notice_period')
        .eq('id', user.userId)
        .single();
      if (error) throw error;
      if ((data as any)?.advance_notice_period) {
        setAdvanceNoticePeriod((data as any).advance_notice_period.toString());
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

  const updateAdvanceNoticePeriod = async (value: string) => {
    if (!user) {
      router.push('/login');
      return;
    }
    try {
      setLoading(true);
      const { error } = await (supabase.from('users').update as any)({
        advance_notice_period: parseInt(value, 10),
      }).eq('id', user.userId);

      if (error) throw error;

      setAdvanceNoticePeriod(value);
      toast({
        description: 'Advance notice period updated successfully',
        variant: 'default',
      });
    } catch (error: any) {
      console.error('Error updating advance notice period:', error);
      toast(
        generateToastError(
          error.message,
          'Error updating advance notice period!',
        ),
      );
    } finally {
      setLoading(false);
      window.location.reload();
    }
  };

  const noticePeriods = ['30', '60', '90'];

  return (
    <div className="w-36">
      <Select
        value={advanceNoticePeriod || undefined}
        onValueChange={updateAdvanceNoticePeriod}
        disabled={loading}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select advance notice period" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Advance Notice Period</SelectLabel>
            {noticePeriods.map((days, index) => (
              <SelectItem key={days} value={days}>
                {days} days
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
