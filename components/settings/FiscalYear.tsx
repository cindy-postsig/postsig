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
import { useAbility } from '@/components/providers/AbilityProvider';

export default function FiscalYearForm({ user }: { user: any }) {
  const supabase = createClient();
  const ability = useAbility();
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [fiscalYearStart, setFiscalYearStart] = useState<string | null>(null);
  const router = useRouter();

  const canUpdate = ability.can('update', 'Application');

  const getOrganizationData = useCallback(async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('organizations')
        .select('fiscal_year_start_month')
        .eq('id', user.organizationId)
        .single();
      if (error) throw error;
      if (data) {
        setFiscalYearStart((data as any).fiscal_year_start_month.toString());
      }
    } catch (error: any) {
      toast(
        generateToastError(error.message, 'Error loading organization data!'),
      );
    } finally {
      setLoading(false);
    }
  }, [user, supabase, router, toast]);

  useEffect(() => {
    getOrganizationData();
  }, [getOrganizationData]);

  const updateFiscalYearStart = async (value: string) => {
    if (!user) {
      router.push('/login');
      return;
    }
    try {
      setLoading(true);
      const { error } = await (supabase.from('organizations').update as any)({
        fiscal_year_start_month: parseInt(value, 10),
      }).eq('id', user.organizationId);

      if (error) throw error;

      setFiscalYearStart(value);
      toast({
        description: 'Fiscal year start month updated successfully',
        variant: 'default',
      });
    } catch (error: any) {
      console.error('Error updating fiscal year start:', error);
      toast(
        generateToastError(error.message, 'Error updating fiscal year start!'),
      );
    } finally {
      setLoading(false);
      window.location.reload();
    }
  };

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  return (
    <div className="">
      <Select
        value={fiscalYearStart || undefined}
        onValueChange={updateFiscalYearStart}
        disabled={loading || !canUpdate}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a FY start" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Fiscal Year Start</SelectLabel>
            {monthNames.map((month, index) => (
              <SelectItem key={index + 1} value={(index + 1).toString()}>
                {month}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
