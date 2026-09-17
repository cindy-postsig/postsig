'use client';

import Link from 'next/link';
import { ArrowTopRightIcon } from '@radix-ui/react-icons';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import VendorIcon from '@/components/vendors/VendorIcon';
import { RenewedIcon } from '@/components/contracts/icons';
import { formatCurrency } from '@/app/lib/utils';
import { getProductYearLabel } from '@/app/lib/budget';
import type { ContractProductsResult } from '@/lib/v2/products/transforms';
import { useDateFormat } from '@/hooks/useDateFormat';

export interface ContractSummary {
  contractId: number;
  contractType: string;
  vendorName: string;
  vendorId?: number;
  vendorDomain?: string;
  status: string;
  termStartDate: string | null;
  termEndDate: string | null;
  // Original dates from term_start_date[length-1] / term_end_date[length-1]
  // — only set when the contract has been renewed (array has >1 entry).
  originalTermStartDate: string | null;
  originalTermEndDate: string | null;
  currency: string;
  renewalType: string | null;
  renewalPeriodMonths: number | null;
  subscriptionTermMonths: number | null;
  billingFrequency: string | null;
  willNotRenew: boolean;
  annualIncrease: number | null;
  annualIncreaseMonths: number | null;
  // Product fees grouped by year — same shape used by InventoryItemSheet
  // and ProductsLicensed via enrichContractProducts.
  currentTermProducts: ContractProductsResult;
}

function formatTermMonths(months: number | null): string {
  if (months == null) return '—';
  if (months === 12) return '1 year';
  if (months % 12 === 0) return `${months / 12} years`;
  return `${months} months`;
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-5 gap-0 py-2">
      <div className="col-span-2 pt-[.2rem] font-label text-xs uppercase leading-tight tracking-wide text-foreground/85">
        {label}
      </div>
      <div className="col-span-3 font-serif text-base">{children}</div>
    </div>
  );
}

interface Props {
  summary: ContractSummary | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ContractSummarySheet({ summary, isOpen, onClose }: Props) {
  const { formatDate } = useDateFormat();
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[600px] overflow-y-auto sm:max-w-[600px]">
        {summary && (
          <>
            <SheetHeader className="space-y-3 pb-2 pt-4">
              <div className="flex items-start gap-4">
                {summary.vendorId ? (
                  <Link
                    href={`/vendors/${summary.vendorId}`}
                    className="shrink-0 hover:opacity-80"
                  >
                    <VendorIcon
                      name={summary.vendorName}
                      domain={summary.vendorDomain}
                      width={56}
                      height={56}
                      className="rounded-sm"
                    />
                  </Link>
                ) : (
                  <VendorIcon
                    name={summary.vendorName}
                    domain={summary.vendorDomain}
                    width={56}
                    height={56}
                    className="rounded-sm"
                  />
                )}
                <div className="flex flex-col items-start gap-2">
                  <SheetTitle className="font-serif text-2xl leading-none">
                    {summary.vendorId ? (
                      <Link
                        href={`/vendors/${summary.vendorId}`}
                        className="hover:opacity-80"
                      >
                        {summary.vendorName}
                      </Link>
                    ) : (
                      summary.vendorName
                    )}
                  </SheetTitle>
                  <SheetDescription asChild>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {summary.contractType && (
                        <Badge variant="outline">{summary.contractType}</Badge>
                      )}
                      <Badge variant="secondary">ID {summary.contractId}</Badge>
                      {summary.status === 'inactive' && (
                        <Badge variant="destructive">Archived</Badge>
                      )}
                      {summary.willNotRenew && (
                        <Badge variant="secondary">Will Not Renew</Badge>
                      )}
                    </div>
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              <Card>
                <CardContent className="grid grid-cols-2 gap-4 pt-6">
                  <div>
                    <p className="font-bold font-label text-xs uppercase tracking-wide text-foreground/85">
                      Start Date
                    </p>
                    <p className="flex items-center gap-2 font-serif text-base">
                      {summary.termStartDate ? (
                        formatDate(summary.termStartDate)
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                      {summary.originalTermStartDate && (
                        <RenewedIcon
                          dateType="start"
                          originalDate={formatDate(
                            summary.originalTermStartDate,
                          )}
                        />
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="font-bold font-label text-xs uppercase tracking-wide text-foreground/85">
                      End Date
                    </p>
                    <p className="flex items-center gap-2 font-serif text-base">
                      {summary.termEndDate ? (
                        formatDate(summary.termEndDate)
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                      {summary.originalTermEndDate && (
                        <RenewedIcon
                          dateType="end"
                          originalDate={formatDate(summary.originalTermEndDate)}
                        />
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="font-bold font-label text-xs uppercase tracking-wide text-foreground/85">
                      Subscription Term
                    </p>
                    <p className="font-serif text-base">
                      {formatTermMonths(summary.subscriptionTermMonths)}
                    </p>
                  </div>
                  <div>
                    <p className="font-bold font-label text-xs uppercase tracking-wide text-foreground/85">
                      Renewal Type
                    </p>
                    <p className="font-serif text-base">
                      {summary.renewalType || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-bold font-label text-xs uppercase tracking-wide">
                    Fees
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {summary.currentTermProducts.sortedYears.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No products on this contract.
                    </p>
                  ) : (
                    summary.currentTermProducts.sortedYears.map((year) => (
                      <div
                        key={year}
                        className="my-1 flex border-t border-t-foreground/10 pt-1 first:border-t-0"
                      >
                        {summary.currentTermProducts.hasValidTermDate && (
                          <div className="mr-2 flex w-auto shrink-0 items-center justify-between border-r pr-3">
                            <p className="font-label text-[0.825rem] uppercase leading-tight tracking-wide text-foreground/85">
                              {getProductYearLabel(
                                parseInt(year, 10),
                                summary.currentTermProducts.termStartDate,
                                summary.currentTermProducts
                                  .fiscalYearStartMonth,
                              )}
                            </p>
                          </div>
                        )}
                        <div
                          className={
                            summary.currentTermProducts.hasValidTermDate
                              ? 'flex-1'
                              : 'w-full'
                          }
                        >
                          {summary.currentTermProducts.productsByYear[
                            year
                          ]?.map((product) => (
                            <div
                              key={`${product.vendor_products?.id ?? product.product_id}-${year}`}
                              className="flex justify-between gap-2 px-1 font-label leading-snug"
                            >
                              <div className="font-sans text-[.9rem] tracking-[0.02rem]">
                                {product.vendor_products.name}
                              </div>
                              <div className="flex items-center gap-0.5 font-label text-sm">
                                {formatCurrency(
                                  product.compoundedFee,
                                  summary.currency,
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-bold font-label text-xs uppercase tracking-wide">
                    Adjustments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-foreground/10">
                    <DetailRow label="Annual Increase">
                      {summary.annualIncrease && summary.annualIncrease > 0 ? (
                        `${summary.annualIncrease}%`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </DetailRow>
                    <DetailRow label="Increase Cadence">
                      {summary.annualIncreaseMonths ? (
                        `Every ${summary.annualIncreaseMonths} mo`
                      ) : summary.annualIncrease &&
                        summary.annualIncrease > 0 ? (
                        'Annual'
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </DetailRow>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-bold font-label text-xs uppercase tracking-wide">
                    Payment Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-foreground/10">
                    <DetailRow label="Billing Frequency">
                      {summary.billingFrequency || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </DetailRow>
                    <DetailRow label="Renewal Period">
                      {formatTermMonths(summary.renewalPeriodMonths)}
                    </DetailRow>
                  </div>
                </CardContent>
              </Card>

              <Link
                href={`/contracts/${summary.contractId}`}
                target="_blank"
                className="font-medium flex w-full items-center justify-between rounded-sm border px-3 py-2 text-sm transition-colors hover:bg-secondary/25"
              >
                <span>View full contract</span>
                <ArrowTopRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
