import Link from 'next/link';
import type { Row } from '@tanstack/react-table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import VendorIcon from '@/components/vendors/VendorIcon';
import { InvoiceStatusCell } from '@/components/contracts/columns';
import InvoiceValidationSummary from '@/components/contracts/InvoiceValidationSummary';
import type { ContractTableRow } from '@/lib/v2/core/types';
import type { InvoiceRow } from './InvoicesTable';

export default function InvoiceDiscrepancySheet({
  invoice,
  onClose,
}: {
  invoice: InvoiceRow | null;
  onClose: () => void;
}) {
  const discrepancyCount = invoice?.validation?.discrepancyCount ?? 0;

  return (
    <Sheet open={invoice != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[640px] overflow-y-auto sm:max-w-[640px]">
        {invoice && (
          <>
            <SheetHeader className="space-y-2 pb-4">
              <SheetTitle className="flex items-center gap-1.5 text-left">
                <VendorIcon
                  name={invoice.vendor}
                  domain={invoice.vendorDomain}
                  width={22}
                  height={22}
                />
                <span className="font-medium text-lg leading-none">
                  {invoice.vendor}
                </span>
              </SheetTitle>
              <div className="flex items-center gap-2">
                <span className="font-medium inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">
                  Invoice #{invoice.id}
                </span>
                {discrepancyCount > 0 && (
                  <span
                    className="font-medium whitespace-nowrap rounded-md px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: '#CC003F1a',
                      color: '#CC003F',
                    }}
                  >
                    {discrepancyCount}{' '}
                    {discrepancyCount === 1 ? 'Discrepancy' : 'Discrepancies'}
                  </span>
                )}
              </div>
            </SheetHeader>

            <div className="space-y-4">
              <Card className="flex items-center bg-card">
                <CardHeader className="min-w-40 px-5 py-4">
                  <CardTitle className="flex h-6 items-center text-sm">
                    Invoice Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 py-4">
                  <InvoiceStatusCell
                    row={
                      { original: invoice } as unknown as Row<ContractTableRow>
                    }
                  />
                </CardContent>
              </Card>

              {invoice.validation && (
                <InvoiceValidationSummary
                  validation={invoice.validation}
                  currency={invoice.currency}
                />
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="font-bold font-label text-xs uppercase tracking-wide">
                    Linked Contract
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Link
                    href={`/contracts/${invoice.id}`}
                    className="font-medium flex w-full items-center justify-between rounded-sm border px-3 py-2 text-sm transition-colors hover:bg-secondary/25"
                  >
                    <span>View Contract</span>
                    <span>&rarr;</span>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
