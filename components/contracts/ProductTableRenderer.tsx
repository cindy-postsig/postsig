'use client';

import React, { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatCurrencyFull } from '@/app/lib/utils';
import { getProductYearLabel } from '@/app/lib/budget';
import { excludeRemovedProductsForYear } from '@/lib/contracts/productLineageResolution';
import CitationField from './CitationField';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RenewedIcon } from './icons';
import { Badge } from '@/components/ui/badge';
import { useEdit } from '@/app/ui/contracts/edit/EditContext';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ContractProduct } from '@/lib/v2/products/transforms';
import type { Citation } from '@/constants/types';
import type {
  DateEntry,
  SalesTaxDetail,
  RawProductData,
  VendorProductsDetail,
  VendorProductsUser,
  VendorProduct,
} from '@/lib/v2/products/types';

// Constant for consistent badge styling
const CHANGE_BADGE_STYLES =
  'ml-2 rounded-full border border-blue-200 px-2 bg-blue-50 dark:bg-blue-300/20 py-0 tracking-tight font-label text-xs text-blue-600 dark:border-blue-300/30 dark:text-blue-200';

interface ProductsData {
  productsByYear: Record<string, ContractProduct[]>;
  hasValidTermDate: boolean;
  sortedYears: string[];
}

interface ContractMetadata {
  currency?: string;
  hasAnnualIncrease?: boolean;
  isInvoice?: boolean;
  salesTaxDetails?: SalesTaxDetail[];
  termStartDate?: DateEntry[];
  fiscalYearStartMonth?: number;
  termEndDate?: DateEntry[];
  renewed?: boolean;
}

interface ProductTableRendererProps {
  productsData: ProductsData;
  contractMetadata: ContractMetadata;
  citations?: Citation;
  comparisonData?: {
    // Optional: the products-licensed table passes only removedProducts.
    productDifferences?: Map<
      string,
      'added' | 'price_increased' | 'price_decreased' | 'unchanged' | 'removed'
    >;
    predecessorYears?: Set<number>;
    supersededProducts?: Set<string>;
    removedProducts?: Set<string>;
  };
  isAmendmentView?: boolean;
  rawProductData?: RawProductData;
  deliveryMethods?: Array<{ id: number; name: string }>;
  isProductEditMode?: boolean;
}

/**
 * Get the original term start date from the contract
 */
function getOriginalTermStartDate(
  termStartDate: DateEntry[] | string | null | undefined,
): string | null {
  if (!termStartDate) return null;

  // Handle array format - use LAST element (oldest/original date)
  if (Array.isArray(termStartDate)) {
    if (termStartDate.length === 0) return null;
    const originalEntry = termStartDate[termStartDate.length - 1];
    return originalEntry?.date || null;
  }
  // Handle string format
  else if (typeof termStartDate === 'string') {
    return termStartDate;
  }

  return null;
}

export function ProductTableRenderer({
  productsData,
  contractMetadata,
  citations,
  comparisonData,
  isAmendmentView = false,
  rawProductData,
  deliveryMethods = [],
  isProductEditMode = false,
}: ProductTableRendererProps) {
  const { productsByYear, hasValidTermDate, sortedYears } = productsData;
  const {
    currency,
    hasAnnualIncrease = false,
    isInvoice = false,
    salesTaxDetails = [],
    termStartDate = [],
    fiscalYearStartMonth,
    termEndDate = [],
    renewed = false,
  } = contractMetadata;

  const edit = useEdit();
  const searchParams = useSearchParams();
  const isViewingOriginal = searchParams.get('viewOriginal') === 'true';
  const isGlobalEditMode =
    (edit?.isEditMode ?? false) && (edit?.canEdit ?? false);
  const isEditMode = isGlobalEditMode || isProductEditMode;

  // Build lookup maps for edit mode
  const detailsLookup = useMemo(() => {
    if (!rawProductData?.vendorProductsDetails) return new Map();
    const map = new Map<
      string,
      { id: number; fees: number; sort_order?: number | null }
    >();
    for (const detail of rawProductData.vendorProductsDetails) {
      // Key: productId-year
      const key = `${detail.product_id}-${detail.year}`;
      map.set(key, {
        id: detail.id,
        fees: detail.fees,
        sort_order: detail.sort_order ?? null,
      });
    }
    return map;
  }, [rawProductData?.vendorProductsDetails]);

  const usersLookup = useMemo(() => {
    if (!rawProductData?.vendorProductsUsers) return new Map();
    const map = new Map<
      number,
      { id: number; number_of_users: number | null; enterprise?: boolean }
    >();
    for (const user of rawProductData.vendorProductsUsers) {
      map.set(user.product_id, {
        id: user.id,
        number_of_users: user.number_of_users,
        enterprise: user.enterprise,
      });
    }
    return map;
  }, [rawProductData?.vendorProductsUsers]);

  const productsLookup = useMemo(() => {
    if (!rawProductData?.vendorProducts) return new Map();
    const map = new Map<
      number,
      { id: number; delivery_method_id: number | null }
    >();
    for (const product of rawProductData.vendorProducts) {
      map.set(product.id, {
        id: product.id,
        delivery_method_id: product.delivery_method_id ?? null,
      });
    }
    return map;
  }, [rawProductData?.vendorProducts]);

  const hasProducts = Object.keys(productsByYear).length > 0;

  // Check if contract has been renewed
  const isContractRenewed =
    renewed || termEndDate?.length > 1 || termStartDate?.length > 1;

  // Determine which optional columns to show based on data availability
  const allProducts = Object.values(productsByYear).flat();
  const hasAnyUsersData = allProducts.some(
    (product: ContractProduct) =>
      product.enterprise ||
      (product.numberOfUsers != null && product.numberOfUsers > 0),
  );
  const hasAnyDeliveryData = allProducts.some(
    (product: ContractProduct) =>
      product.dataDeliveryMethod != null && product.dataDeliveryMethod !== '',
  );
  // Only Exchange Agreement products carry a code, so the column stays hidden on
  // every other contract rather than showing an empty column everywhere.
  const hasAnyProductCode = allProducts.some(
    (product: ContractProduct) => !!product.vendor_products.product_code,
  );

  if (!hasProducts || !productsByYear || !sortedYears.length) {
    return null;
  }

  // Calculate column count for totals row colspan
  const baseColumnCount = hasValidTermDate ? 2 : 1; // Year + Product or just Product
  const optionalColumns =
    (hasAnyProductCode ? 1 : 0) +
    (hasAnyUsersData ? 1 : 0) +
    (hasAnyDeliveryData ? 1 : 0);
  const totalColumns = baseColumnCount + optionalColumns + 1; // +1 for Fee

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {hasValidTermDate && (
            <TableHead className="w-1/4 px-2 py-1 align-bottom" />
          )}
          <TableHead className="w-2/5 px-2 py-1 align-bottom">
            Product
          </TableHead>
          {hasAnyProductCode && (
            <TableHead className="w-32 px-2 py-1 align-bottom">
              Product Code
            </TableHead>
          )}
          {hasAnyUsersData && (
            <TableHead className="w-20 px-1 py-1 align-bottom">Users</TableHead>
          )}
          {hasAnyDeliveryData && (
            <TableHead className="px-1 py-1 align-bottom">Delivery</TableHead>
          )}
          <TableHead className="w-32 px-2 py-1 text-right align-bottom">
            Fee
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedYears.map((year: string) => {
          const productsInYear = productsByYear[year];
          const productCount = productsInYear.length;

          // Check if this entire year is new (the year itself didn't exist in predecessor)
          const isNewYear = comparisonData?.predecessorYears
            ? !comparisonData.predecessorYears.has(parseInt(year, 10))
            : false;

          // Only show "Added Year" badge if the year is new AND at least one product
          // in this year is NOT a new product (i.e., it's an extension of existing products)
          const hasExtendedProducts =
            isNewYear &&
            productsInYear.some((product: ContractProduct) => {
              const productKey = `${product.vendor_products?.id || product.product_id}-${year}`;
              const differenceType =
                comparisonData?.productDifferences?.get(productKey);
              return differenceType !== 'added';
            });

          // Get original date for tooltip (only show for non-renewed contracts in amendment view)
          const originalDate =
            isAmendmentView && !isContractRenewed
              ? getOriginalTermStartDate(termStartDate)
              : null;

          return (
            <React.Fragment key={year}>
              {productsInYear.map((product: ContractProduct, index: number) => {
                const originalFee = product.originalFees;
                const compoundedFee = product.compoundedFee;
                const renewalCount = product.renewalCount;
                const hasIncrease = product.hasIncrease;

                // Determine highlighting based on comparison data
                const productKey = `${product.vendor_products?.id || product.product_id}-${year}`;
                const differenceType =
                  comparisonData?.productDifferences?.get(productKey);

                // Check if this product has been superseded by a later amendment,
                // or cancelled outright by a later contract's confirmed lineage
                // declaration (PSK-1830). Both render with the same
                // strike-through treatment.
                const isSuperseded =
                  comparisonData?.supersededProducts?.has(productKey) ||
                  comparisonData?.removedProducts?.has(productKey);

                const isFirstProduct = index === 0;
                const isLastProduct = index === productCount - 1;

                // Border styling for product cells (not the year cell)
                const shouldHaveNoBorder = isAmendmentView && isLastProduct;
                const shouldUseSolidBorder =
                  !isAmendmentView && productCount > 1 && isLastProduct;
                const borderClass = shouldHaveNoBorder
                  ? 'border-b-0'
                  : shouldUseSolidBorder
                    ? 'border-b border-solid border-b-foreground/10'
                    : 'border-b border-dashed border-b-foreground/10';

                return (
                  <TableRow
                    key={`${year}-${index}`}
                    className="border-b-0 hover:bg-transparent"
                  >
                    {/* Year cell - only render for first product, with rowSpan */}
                    {hasValidTermDate && isFirstProduct && (
                      <TableCell
                        rowSpan={productCount}
                        className="w-1/4 border-b-0 px-2 py-2 align-top"
                      >
                        <div className="flex items-start gap-1">
                          {isAmendmentView && isContractRenewed ? (
                            <TooltipProvider>
                              <Tooltip delayDuration={100}>
                                <TooltipTrigger asChild>
                                  <p className="cursor-pointer font-label text-[0.825rem] uppercase leading-tight tracking-wide text-foreground/85">
                                    {getProductYearLabel(
                                      parseInt(year, 10),
                                      termStartDate,
                                      fiscalYearStartMonth || 1,
                                    )}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="flex flex-col gap-0">
                                    <strong>Renewed</strong>
                                    <div className="text-xs capitalize">
                                      Original Start Date:{' '}
                                      {getOriginalTermStartDate(
                                        termStartDate,
                                      ) || 'N/A'}
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : isAmendmentView && originalDate ? (
                            <TooltipProvider>
                              <Tooltip delayDuration={100}>
                                <TooltipTrigger asChild>
                                  <p className="cursor-pointer font-label text-[0.825rem] uppercase leading-tight tracking-wide text-foreground/85">
                                    {getProductYearLabel(
                                      parseInt(year, 10),
                                      termStartDate,
                                      fiscalYearStartMonth || 1,
                                    )}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{originalDate}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <p className="font-label text-[0.825rem] uppercase leading-tight tracking-wide text-foreground/85">
                              {getProductYearLabel(
                                parseInt(year, 10),
                                termStartDate,
                                fiscalYearStartMonth || 1,
                              )}
                            </p>
                          )}
                          {isAmendmentView && isContractRenewed && (
                            <RenewedIcon
                              dateType="start"
                              originalDate={getOriginalTermStartDate(
                                termStartDate,
                              )}
                            />
                          )}
                          {hasExtendedProducts && (
                            <span className={CHANGE_BADGE_STYLES}>
                              Added Year
                            </span>
                          )}
                        </div>
                      </TableCell>
                    )}

                    {/* Product name cell */}
                    <TableCell
                      className={`w-2/5 px-2 py-2 align-top ${borderClass}`}
                    >
                      <div className="flex items-center gap-0.5 font-sans text-[.9rem] tracking-[0.02rem]">
                        <div
                          className={
                            isSuperseded ? 'line-through opacity-60' : ''
                          }
                        >
                          {citations ? (
                            <CitationField citation={citations}>
                              {product.vendor_products.name}
                            </CitationField>
                          ) : (
                            product.vendor_products.name
                          )}
                        </div>
                        {differenceType === 'added' && (
                          <span className={CHANGE_BADGE_STYLES}>
                            Added Product
                          </span>
                        )}
                        {product.one_time_only && (
                          <Badge variant="secondary" size="xs" className="ml-2">
                            One-time
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Product code cell */}
                    {hasAnyProductCode && (
                      <TableCell
                        className={`w-32 px-2 py-2 align-top font-label text-sm ${borderClass} ${isSuperseded ? 'line-through opacity-60' : ''}`}
                      >
                        {product.vendor_products.product_code || '-'}
                      </TableCell>
                    )}

                    {/* Number of users cell */}
                    {hasAnyUsersData && (
                      <TableCell
                        className={`w-20 px-1 py-2 align-top font-label text-sm ${borderClass} ${isSuperseded ? 'line-through opacity-60' : ''}`}
                      >
                        {(() => {
                          const productId =
                            product.vendor_products?.id || product.product_id;
                          const userData = usersLookup.get(productId);

                          if (product.enterprise || userData?.enterprise) {
                            return 'Enterprise';
                          }
                          const usersId = userData?.id;
                          const originalUsers =
                            userData?.number_of_users ?? null;

                          if (isEditMode && usersId) {
                            const displayValue = edit?.getFieldValue(
                              'vendor_products_users',
                              usersId,
                              'number_of_users',
                              originalUsers,
                            ) as number | null;
                            const isModified = edit?.isFieldModified(
                              'vendor_products_users',
                              usersId,
                              'number_of_users',
                            );

                            const productName =
                              product.vendor_products?.name ||
                              'Unknown Product';
                            return (
                              <Input
                                type="number"
                                min={0}
                                value={displayValue ?? ''}
                                onChange={(e) => {
                                  const trimmed = e.target.value.trim();
                                  const parsed = parseInt(trimmed, 10);
                                  const newValue =
                                    trimmed === ''
                                      ? null
                                      : Number.isNaN(parsed)
                                        ? null
                                        : parsed;
                                  edit?.setFieldValue(
                                    'vendor_products_users',
                                    usersId,
                                    'number_of_users',
                                    originalUsers,
                                    newValue,
                                    { productId, productName },
                                  );
                                }}
                                className={`h-7 w-20 text-sm ${isModified ? 'border-blue-500' : ''}`}
                              />
                            );
                          }

                          const displayValue = usersId
                            ? (edit?.getFieldValue(
                                'vendor_products_users',
                                usersId,
                                'number_of_users',
                                originalUsers,
                              ) as number | null)
                            : product.numberOfUsers;

                          return displayValue != null && displayValue > 0
                            ? displayValue.toLocaleString()
                            : '—';
                        })()}
                      </TableCell>
                    )}

                    {/* Data delivery method cell */}
                    {hasAnyDeliveryData && (
                      <TableCell
                        className={`px-1 py-2 align-top font-label text-sm ${borderClass} ${isSuperseded ? 'line-through opacity-60' : ''}`}
                      >
                        {(() => {
                          const productId =
                            product.vendor_products?.id || product.product_id;
                          const productData = productsLookup.get(productId);
                          const originalDeliveryMethodId =
                            productData?.delivery_method_id ?? null;

                          if (isEditMode) {
                            // Use the delivery_method_id from the enriched product data if lookup fails
                            const lookupDeliveryMethodId =
                              productData?.delivery_method_id;
                            const enrichedDeliveryMethodId = (
                              product.vendor_products as Record<string, unknown>
                            )?.delivery_method_id as number | undefined;
                            const originalDeliveryMethodIdResolved =
                              lookupDeliveryMethodId ??
                              enrichedDeliveryMethodId ??
                              null;

                            const displayValue = edit?.getFieldValue(
                              'vendor_products',
                              productId,
                              'delivery_method_id',
                              originalDeliveryMethodIdResolved,
                            ) as number | null;
                            const isModified = edit?.isFieldModified(
                              'vendor_products',
                              productId,
                              'delivery_method_id',
                            );
                            const productName =
                              product.vendor_products?.name ||
                              'Unknown Product';

                            // Resolve delivery method names for activity log
                            const getDeliveryMethodName = (id: number | null) =>
                              deliveryMethods.find((m) => m.id === id)?.name ||
                              null;

                            // Show loading state if delivery methods haven't loaded yet
                            if (deliveryMethods.length === 0) {
                              return (
                                <Select disabled>
                                  <SelectTrigger className="h-7 w-32 text-sm">
                                    <SelectValue placeholder="Loading..." />
                                  </SelectTrigger>
                                  <SelectContent />
                                </Select>
                              );
                            }

                            return (
                              <Select
                                value={displayValue?.toString() ?? ''}
                                onValueChange={(value) => {
                                  const newValue =
                                    value === '' ? null : parseInt(value, 10);
                                  edit?.setFieldValue(
                                    'vendor_products',
                                    productId,
                                    'delivery_method_id',
                                    originalDeliveryMethodIdResolved,
                                    newValue,
                                    {
                                      productId,
                                      productName,
                                      oldDisplayValue: getDeliveryMethodName(
                                        originalDeliveryMethodIdResolved,
                                      ),
                                      newDisplayValue:
                                        getDeliveryMethodName(newValue),
                                    },
                                  );
                                }}
                              >
                                <SelectTrigger
                                  className={`h-7 w-32 text-sm ${isModified ? 'border-blue-500' : ''}`}
                                >
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {deliveryMethods.map((method) => (
                                    <SelectItem
                                      key={method.id}
                                      value={method.id.toString()}
                                    >
                                      {method.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            );
                          }

                          const displayDeliveryMethodId = edit?.getFieldValue(
                            'vendor_products',
                            productId,
                            'delivery_method_id',
                            originalDeliveryMethodId,
                          ) as number | null;

                          const displayMethodName =
                            deliveryMethods.find(
                              (m) => m.id === displayDeliveryMethodId,
                            )?.name || product.dataDeliveryMethod;

                          return displayMethodName || '—';
                        })()}
                      </TableCell>
                    )}

                    {/* Fee cell */}
                    <TableCell
                      className={`w-32 px-2 py-2 text-right align-top ${borderClass}`}
                    >
                      {(() => {
                        const productId =
                          product.vendor_products?.id || product.product_id;
                        const detailsKey = `${productId}-${year}`;
                        const detailData = detailsLookup.get(detailsKey);
                        // An invoice row carries its own row id: two lines can
                        // share a product and a year, and the key above would
                        // point both of them at the same row (psk-996).
                        const detailsId = product.id ?? detailData?.id;
                        const originalDbFee =
                          product.id != null
                            ? product.fees
                            : (detailData?.fees ?? null);

                        if (isEditMode && detailsId) {
                          const displayValue = edit?.getFieldValue(
                            'vendor_products_details',
                            detailsId,
                            'fees',
                            originalDbFee,
                          ) as number | null;
                          const isModified = edit?.isFieldModified(
                            'vendor_products_details',
                            detailsId,
                            'fees',
                          );
                          const productName =
                            product.vendor_products?.name || 'Unknown Product';

                          return (
                            <div className="flex justify-end">
                              <Input
                                type="number"
                                min={0}
                                step="1"
                                value={displayValue ?? ''}
                                onChange={(e) => {
                                  const trimmed = e.target.value.trim();
                                  const parsed = parseInt(trimmed, 10);
                                  const newValue =
                                    trimmed === ''
                                      ? null
                                      : Number.isNaN(parsed)
                                        ? null
                                        : parsed;
                                  edit?.setFieldValue(
                                    'vendor_products_details',
                                    detailsId,
                                    'fees',
                                    originalDbFee,
                                    newValue,
                                    {
                                      productId,
                                      productName,
                                      year: parseInt(year, 10),
                                    },
                                  );
                                }}
                                className={`h-7 w-28 text-sm ${isModified ? 'border-blue-500' : ''}`}
                              />
                            </div>
                          );
                        }

                        const displayFee =
                          detailsId && !isViewingOriginal
                            ? ((edit?.getFieldValue(
                                'vendor_products_details',
                                detailsId,
                                'fees',
                                compoundedFee,
                              ) as number | null) ?? compoundedFee)
                            : compoundedFee;

                        return (
                          <div className="flex items-center justify-end gap-2">
                            {(differenceType === 'price_increased' ||
                              differenceType === 'price_decreased') && (
                              <span className={CHANGE_BADGE_STYLES}>
                                <span className="pr-1 text-[0.6rem]">
                                  {differenceType === 'price_increased'
                                    ? '▲'
                                    : '▼'}
                                </span>
                                {differenceType === 'price_increased'
                                  ? 'Increase'
                                  : 'Decrease'}
                              </span>
                            )}
                            {hasAnnualIncrease &&
                            hasIncrease &&
                            !isAmendmentView ? (
                              <div
                                className={`flex gap-3 font-label text-sm ${isSuperseded ? 'line-through opacity-60' : ''}`}
                              >
                                <div className="text-muted-foreground line-through">
                                  {formatCurrencyFull(originalFee, currency)}
                                </div>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div>
                                        {formatCurrencyFull(
                                          displayFee,
                                          currency,
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Fee after {renewalCount} renewal
                                      {renewalCount !== 1 ? 's' : ''} with
                                      annual increase
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            ) : (
                              <div
                                className={`font-label text-sm ${isSuperseded ? 'line-through opacity-60' : ''}`}
                              >
                                {formatCurrencyFull(displayFee, currency)}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Subtotal/sales tax/total breakdown — redundant for a single product with no tax */}
              {!isAmendmentView &&
                (productCount > 1 ||
                  (isInvoice &&
                    (isEditMode ||
                      salesTaxDetails.some(
                        (tax) => Number(tax.year) === parseInt(year, 10),
                      )))) && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={totalColumns}
                      className="border-b-0 px-2 py-8"
                    >
                      <div className="flex flex-col items-end gap-1">
                        {(() => {
                          const yearNum = parseInt(year, 10);

                          // Cancelled products render struck-through above;
                          // their fees must not count toward the year's total.
                          const subtotal = excludeRemovedProductsForYear(
                            productsInYear,
                            year,
                            comparisonData?.removedProducts,
                          ).reduce((acc: number, product: ContractProduct) => {
                            const productId =
                              product.vendor_products?.id || product.product_id;
                            const detailsKey = `${productId}-${year}`;
                            const detailData = detailsLookup.get(detailsKey);
                            // See above: an invoice line is identified by its
                            // own row id, not by product and year.
                            const detailsId = product.id ?? detailData?.id;

                            const fee =
                              detailsId && !isViewingOriginal
                                ? ((edit?.getFieldValue(
                                    'vendor_products_details',
                                    detailsId,
                                    'fees',
                                    product.compoundedFee,
                                  ) as number | null) ?? product.compoundedFee)
                                : product.compoundedFee;

                            return acc + fee;
                          }, 0);

                          const salesTaxForYear = salesTaxDetails.find(
                            (tax) => tax.year === yearNum,
                          );
                          const originalSalesTax = salesTaxForYear
                            ? parseFloat(String(salesTaxForYear.sales_tax)) || 0
                            : 0;

                          const displaySalesTax = isViewingOriginal
                            ? originalSalesTax
                            : ((edit?.getFieldValue(
                                'contracts_other_attributes',
                                yearNum,
                                'sales_tax',
                                originalSalesTax,
                              ) as number) ?? originalSalesTax);
                          const isSalesTaxModified =
                            isEditMode &&
                            edit?.isFieldModified(
                              'contracts_other_attributes',
                              yearNum,
                              'sales_tax',
                            );

                          const hasSalesTax =
                            isInvoice && (displaySalesTax > 0 || isEditMode);
                          const total = subtotal + displaySalesTax;

                          return (
                            <div className="grid grid-cols-[auto_minmax(100px,auto)] items-center gap-x-4 gap-y-1 font-label">
                              {hasSalesTax && (
                                <>
                                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Subtotal
                                  </span>
                                  <span className="text-right text-sm tabular-nums text-muted-foreground">
                                    {formatCurrencyFull(subtotal, currency)}
                                  </span>
                                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Sales Tax
                                  </span>
                                  {isEditMode ? (
                                    <Input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={displaySalesTax || ''}
                                      onChange={(e) => {
                                        const trimmed = e.target.value.trim();
                                        const parsed = parseFloat(trimmed);
                                        const newValue =
                                          trimmed === ''
                                            ? 0
                                            : Number.isNaN(parsed)
                                              ? 0
                                              : parsed;
                                        edit?.setFieldValue(
                                          'contracts_other_attributes',
                                          yearNum,
                                          'sales_tax',
                                          originalSalesTax,
                                          newValue,
                                          { year: yearNum },
                                        );
                                      }}
                                      className={`h-7 w-28 text-right text-sm ${isSalesTaxModified ? 'border-blue-500' : ''}`}
                                    />
                                  ) : (
                                    <span className="text-right text-sm tabular-nums text-muted-foreground">
                                      {formatCurrencyFull(
                                        displaySalesTax,
                                        currency,
                                      )}
                                    </span>
                                  )}
                                </>
                              )}
                              <span className="text-xs uppercase tracking-wide">
                                {isInvoice ? 'Sub-Total' : 'Total'}
                              </span>
                              <span className="text-right text-base tabular-nums">
                                {formatCurrencyFull(
                                  hasSalesTax ? total : subtotal,
                                  currency,
                                )}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
            </React.Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
