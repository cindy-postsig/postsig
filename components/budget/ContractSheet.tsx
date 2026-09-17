'use client';

import Link from 'next/link';
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
import { formatCurrency } from '@/app/lib/utils';
import { extractBudgetFromPriceHistory } from '@/app/lib/budget/priceHistoryProducts';
import { getProductYearLabel } from '@/app/lib/budget';
import type { PriceHistory } from '@/app/lib/budget/types';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { contractOwners, ownerSponsorNames } from '@/lib/v2/owners/embed';

interface ContractSheetProps {
  contract: any | null;
  priceHistory?: PriceHistory | null;
  enrichedContract?: ContractWithPricing | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ContractSheet({
  contract,
  priceHistory,
  enrichedContract,
  isOpen,
  onClose,
}: ContractSheetProps) {
  const { formatDate } = useDateFormat();
  const { baseCurrency, formatBaseCurrency } = useBaseCurrency();
  if (!contract) return null;

  const budgetData = priceHistory
    ? extractBudgetFromPriceHistory(priceHistory)
    : null;

  // Find products with fees from amendments (V2 pattern)
  const productsWithAmendments =
    enrichedContract?.products.filter(
      (p) => p.feeSourceContractId !== undefined,
    ) || [];

  const contractTags =
    contract.contract_tags
      ?.map((tagItem: any) => tagItem.user_tags?.name)
      .filter(Boolean) || [];

  const sponsorNames = ownerSponsorNames(contractOwners(contract));

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[600px] overflow-y-auto sm:max-w-[600px]">
        <SheetHeader className="space-y-2 py-2">
          <SheetTitle className="font-medium flex items-center gap-3 text-left leading-none">
            <VendorIcon
              name={contract.vendors?.name || ''}
              domain={contract.vendors?.domain}
              width={50}
              height={50}
            />
            <div>
              <div className="font-medium text-lg">
                {contract.vendors?.name || 'Unknown Vendor'}
              </div>
              <div className="font-label text-xs text-muted-foreground">
                {contract.vendor_products_details?.length || 0} Product
                {(contract.vendor_products_details?.length || 0) === 1
                  ? ''
                  : 's'}
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Linked Contract */}
          <Link
            href={`/contracts/${contract.id}`}
            className="font-medium flex w-full items-center justify-between rounded-sm border px-4 py-3 text-sm transition-colors hover:bg-secondary/25"
          >
            <span>View Full Contract</span>
            <span>&rarr;</span>
          </Link>

          {/* Status & Key Info */}
          <Card>
            <CardContent className="mt-6 space-y-4">
              <div className="flex h-24 gap-6">
                {/* Data grid - fills remaining space */}
                <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-4">
                  {/* Top row: Annual Cost and Annual Increase */}
                  <div>
                    <p className="font-bold font-label text-xs uppercase tracking-wide">
                      Annual Cost
                    </p>
                    <p className="font-serif">
                      {budgetData?.currentUSD ? (
                        formatBaseCurrency(budgetData.currentUSD)
                      ) : contract.currentBudget ? (
                        formatCurrency(
                          contract.currentBudget,
                          contract.currency || 'USD',
                        )
                      ) : contract.annualCost ? (
                        formatCurrency(
                          contract.annualCost,
                          contract.currency || 'USD',
                        )
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="font-bold font-label text-xs uppercase tracking-wide">
                      Annual Increase
                    </p>
                    <p className="font-serif">
                      {contract.annualIncrease &&
                      contract.annualIncrease > 0 ? (
                        `${contract.annualIncrease}%`
                      ) : budgetData?.annualDifference &&
                        budgetData.annualDifference !== 0 ? (
                        `${budgetData.annualDifference.toFixed(0)}%`
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </p>
                  </div>

                  {/* Bottom row: Start Date and End Date */}
                  <div>
                    <p className="font-bold font-label text-xs uppercase tracking-wide">
                      Start Date
                    </p>
                    <p className="font-serif">
                      {contract.term_start_date &&
                      contract.term_start_date.length > 0 ? (
                        formatDate(contract.term_start_date[0].date)
                      ) : contract.execution_date ? (
                        formatDate(contract.execution_date)
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="font-bold font-label text-xs uppercase tracking-wide">
                      End Date
                    </p>
                    <p className="font-serif">
                      {contract.term_end_date &&
                      contract.term_end_date.length > 0 ? (
                        formatDate(contract.term_end_date[0].date)
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current Term Fees */}
          {budgetData?.currentYearProducts &&
            budgetData.currentYearProducts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-bold font-label text-xs uppercase tracking-wide">
                    Current Term Fees
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div>
                    {budgetData.currentYearProducts.map((product, index) => {
                      const productId =
                        product.vendor_products?.id ?? product.product_id;

                      // Get enriched product with effective fee
                      const enrichedProduct = enrichedContract?.products.find(
                        (p) => String(p.product_id) === String(productId),
                      );

                      // Use effectiveFeeUSD if available, fallback to original
                      const displayFee =
                        enrichedProduct?.effectiveFeeUSD ??
                        product.convertedFees ??
                        product.fees ??
                        0;

                      // Normalized fees are converted into the org base
                      // currency; raw fees stay in the contract's own currency.
                      const displayCurrency =
                        enrichedProduct?.effectiveFeeUSD !== undefined ||
                        product.convertedFees !== undefined
                          ? baseCurrency
                          : contract.currency || 'USD';

                      const hasAmendment =
                        enrichedProduct?.feeSourceContractId !== undefined;

                      return (
                        <div
                          key={index}
                          className="flex justify-between gap-2 border-b border-b-foreground/10 py-2 last:border-b-0"
                        >
                          <div className="font-sans text-sm tracking-[0.02rem]">
                            {product.vendor_products?.name || 'Unknown Product'}
                          </div>
                          <div className="flex items-center gap-1.5 font-label text-[0.825rem] leading-5">
                            {hasAmendment && (
                              <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            )}
                            {formatCurrency(displayFee, displayCurrency)}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Amendment indicator */}
                  {productsWithAmendments.length > 0 && (
                    <div className="!mt-4 border-t pt-3 text-xs">
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Fees updated by:{' '}
                        <Link
                          href={`/contracts/${productsWithAmendments[0].feeSourceContractId}`}
                          className="font-medium text-foreground hover:opacity-80"
                        >
                          Amendment
                        </Link>
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          {/* All Products */}
          {contract.product && contract.product.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="font-bold font-label text-xs uppercase tracking-wide">
                  All Products ({contract.product.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {contract.product.map((product: any, index: number) => (
                    <div
                      key={index}
                      className="flex justify-between gap-2 border-b border-b-foreground/10 px-1 py-2 last:border-b-0"
                    >
                      <div className="font-sans text-sm tracking-[0.02rem]">
                        {product.name ||
                          product.productName ||
                          'Unknown Product'}
                      </div>
                      <div className="font-label text-sm">
                        {formatCurrency(
                          product.fees ?? 0,
                          contract.currency || 'USD',
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* End Users */}
          <Card>
            <CardHeader>
              <CardTitle className="font-bold font-label text-xs uppercase tracking-wide">
                End Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contract.end_users && contract.end_users.trim() !== '' ? (
                <div className="font-serif">{contract.end_users}</div>
              ) : (
                <p className="text-sm text-muted-foreground">No end users.</p>
              )}
            </CardContent>
          </Card>

          {/* Business Sponsor */}
          <Card>
            <CardHeader>
              <CardTitle className="font-bold font-label text-xs uppercase tracking-wide">
                Business Sponsor
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sponsorNames.length > 0 ? (
                <div className="font-serif">{sponsorNames.join(', ')}</div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No business sponsor.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Contract Tags */}
          {contractTags && contractTags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="font-bold font-label text-xs uppercase tracking-wide">
                  Tags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {contractTags.map((tag: string, index: number) => (
                    <Badge key={index} variant="user">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
