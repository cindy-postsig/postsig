'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AllocationPanel } from '@/components/contracts/cost-allocation/AllocationPanel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import VendorIcon from '@/components/vendors/VendorIcon';
import { useCostAllocationTab } from '@/hooks/api/useCostAllocation';

export interface AllocationSheetSubject {
  /** The contract whose allocation the panel edits. */
  id: number;
  title: string;
  vendor: string;
  vendorDomain: string;
  contextFields: { label: string; value: string }[];
  link?: { href: string; label: string; caption: string };
}

interface AllocationSheetProps {
  subject: AllocationSheetSubject | null;
  canEdit: boolean;
  formatAmount: (value: number | null) => string;
  onClose: () => void;
}

function ContextField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-bold font-label text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function AllocationSheetBody({
  subject,
  canEdit,
  formatAmount,
  sheetNode,
}: {
  subject: AllocationSheetSubject;
  canEdit: boolean;
  formatAmount: (value: number | null) => string;
  sheetNode: HTMLElement | null;
}) {
  const router = useRouter();
  const { data, isLoading, error } = useCostAllocationTab(subject.id);

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="space-y-2 py-2">
        <SheetTitle className="font-medium flex items-center gap-2 text-left leading-none">
          {subject.title}
        </SheetTitle>
        <SheetDescription
          asChild
          className="flex items-center gap-[6px] text-xs text-foreground"
        >
          <div>
            <VendorIcon
              name={subject.vendor}
              domain={subject.vendorDomain}
              width={18}
              height={18}
            />
            {subject.vendor}
          </div>
        </SheetDescription>
      </SheetHeader>

      {subject.contextFields.length > 0 && (
        <Card className="mt-6 grid grid-cols-2 gap-4 p-4">
          {subject.contextFields.map((field) => (
            <ContextField
              key={field.label}
              label={field.label}
              value={field.value}
            />
          ))}
        </Card>
      )}

      <div className="mt-6">
        <p className="font-bold font-label text-xs uppercase tracking-wide text-muted-foreground">
          Cost Allocation
        </p>
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
        {data && (
          <AllocationPanel
            data={data}
            canEdit={canEdit}
            formatAmount={formatAmount}
            pickerContainer={sheetNode}
            // The rows are server-loaded, so a saved override re-renders the
            // page rather than patching the table by hand.
            onChanged={() => router.refresh()}
          />
        )}
      </div>

      {subject.link && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="font-bold font-label text-xs uppercase tracking-wide">
              {subject.link.caption}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={subject.link.href}
              className="font-medium flex w-full items-center justify-between rounded-sm border px-3 py-2 text-sm transition-colors hover:bg-secondary/25"
            >
              <span className="tabular-nums">{subject.link.label}</span>
              <span>&rarr;</span>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function AllocationSheet({
  subject,
  canEdit,
  formatAmount,
  onClose,
}: AllocationSheetProps) {
  // Radix locks scrolling to the sheet's own subtree, so the target picker's
  // popover has to portal in here rather than into the body — callback ref +
  // state so the body re-renders once the node exists.
  const [sheetNode, setSheetNode] = useState<HTMLDivElement | null>(null);

  return (
    <Sheet open={subject !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        ref={setSheetNode}
        className="w-[600px] overflow-y-auto sm:max-w-[600px]"
      >
        {subject && (
          <AllocationSheetBody
            key={subject.id}
            subject={subject}
            canEdit={canEdit}
            formatAmount={formatAmount}
            sheetNode={sheetNode}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
