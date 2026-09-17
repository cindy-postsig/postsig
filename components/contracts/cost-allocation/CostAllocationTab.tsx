'use client';

import Link from 'next/link';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCostAllocationTab } from '@/hooks/api/useCostAllocation';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { AllocationPanel } from './AllocationPanel';

interface CostAllocationTabProps {
  contractId: number;
  canEdit: boolean;
  /** The enclosing Sheet/Dialog content node, so the target picker's popover portals inside it. */
  pickerContainer?: HTMLElement | null;
}

function EmptyOrgState() {
  return (
    <Alert className="mt-4">
      <AlertTitle>Nothing to allocate to yet</AlertTitle>
      <AlertDescription className="text-muted-foreground">
        Cost allocation targets come from your employee roster and business
        groups. Add employees under{' '}
        <Link href="/settings/employees" className="underline">
          Settings › Employees
        </Link>{' '}
        or create a group under{' '}
        <Link href="/settings/groups" className="underline">
          Settings › Groups
        </Link>{' '}
        to get started.
      </AlertDescription>
    </Alert>
  );
}

export default function CostAllocationTab({
  contractId,
  canEdit,
  pickerContainer,
}: CostAllocationTabProps) {
  const { data, isLoading, error } = useCostAllocationTab(contractId);
  const { formatBaseCurrency } = useBaseCurrency();
  // null = the engine has no value for this record; a false zero on a money
  // field misleads, so it renders as a dash.
  const formatAmount = (value: number | null) =>
    value === null ? '—' : (formatBaseCurrency(value) ?? '');

  return (
    <Card>
      {/* pb-0: every state below brings its own mt-4, the tab's rhythm. */}
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2 text-base">
          Cost Allocation
          <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <InfoCircledIcon className="inline h-4 w-4 shrink-0 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="top" className="w-72">
                <p>
                  Allocation is used for internal reporting and does not affect
                  contract terms or pricing.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Could not load cost allocation</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {data &&
          (!data.hasAllocationTargets && data.resolved.scopes.length === 0 ? (
            <EmptyOrgState />
          ) : (
            <AllocationPanel
              data={data}
              canEdit={canEdit}
              formatAmount={formatAmount}
              pickerContainer={pickerContainer}
            />
          ))}
      </CardContent>
    </Card>
  );
}
