'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useAbility } from '@/components/providers/AbilityProvider';
import { setOrgPreference } from '@/app/lib/actions/org-preferences';
import {
  COST_CALCULATION_METHOD_OPTIONS,
  CostCalculationMethod,
} from '@/lib/settings/cost-calculation-method';

interface Props {
  organizationId: string;
  initialMethod: CostCalculationMethod;
}

export default function CostCalculationMethodSetting({
  organizationId,
  initialMethod,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const ability = useAbility();
  const [method, setMethod] = useState<CostCalculationMethod>(initialMethod);
  const [saving, setSaving] = useState(false);

  const canUpdate = ability.can('update', 'Application');
  const selectedLabel = COST_CALCULATION_METHOD_OPTIONS.find(
    (option) => option.value === method,
  )?.label;

  async function onChange(next: string) {
    const previous = method;
    setMethod(next as CostCalculationMethod);
    setSaving(true);
    try {
      const ok = await setOrgPreference(
        organizationId,
        'reporting.cost_calculation_method',
        next as CostCalculationMethod,
      );
      if (!ok) throw new Error('Could not save cost calculation method');
      toast({ description: 'Default cost calculation method updated' });
      router.refresh();
    } catch (err) {
      setMethod(previous);
      toast({
        variant: 'destructive',
        description:
          err instanceof Error
            ? err.message
            : 'Could not save cost calculation method',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select
      value={method}
      onValueChange={onChange}
      disabled={saving || !canUpdate}
    >
      {/* Custom trigger content so the multi-line option descriptions stay in
          the dropdown rather than being echoed into the trigger. */}
      <SelectTrigger className="w-40 shrink-0">
        <span>{selectedLabel ?? 'Select a method'}</span>
      </SelectTrigger>
      <SelectContent align="end" className="w-96">
        {COST_CALCULATION_METHOD_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex flex-col gap-0.5">
              <span>{option.label}</span>
              <span className="text-xs leading-snug text-muted-foreground">
                {option.description}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
