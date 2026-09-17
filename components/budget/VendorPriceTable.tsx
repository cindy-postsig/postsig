'use client';

import { useMemo, useState } from 'react';
import { useQueryStates, parseAsInteger } from 'nuqs';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Sparkline } from '@/components/Sparkline';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableHeader } from '@/components/ui/sortable-header';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import VendorIcon from '@/components/vendors/VendorIcon';
import ContractLabel from '@/components/contracts/ContractLabel';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { VendorProductChart } from './VendorTrendChart';
import {
  ContractSummarySheet,
  type ContractSummary,
} from './ContractSummarySheet';
// Shared price-history rollup types — one source of truth across the page,
// this table, and the get_price_history MCP tool.
import type {
  PeriodSummary,
  ProductContractDetail,
  ProductPriceSummary,
  VendorPriceSummary,
} from '@/lib/v2/reports/price-history/summary';

// Re-exported from the shared price-history rollup (imported at top) so
// existing importers of these types from this file keep working.
export type {
  PeriodSummary,
  ProductContractDetail,
  ProductPriceSummary,
  VendorPriceSummary,
};

interface Props {
  vendors: VendorPriceSummary[];
  periodLabels: string[];
  contractSummaries: ContractSummary[];
}

function formatContractType(type: string): string {
  if (!type) return '';
  const lower = type.toLowerCase();
  if (
    lower === 'master service agreement' ||
    lower === 'master services agreement'
  )
    return 'MSA';
  return type;
}

function formatCompact(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function PeriodCells({
  periodLabels,
  periods,
  currency,
  className,
}: {
  periodLabels: string[];
  periods: { label: string; fees: number }[];
  currency: string;
  className?: string;
}) {
  return (
    <>
      {periodLabels.map((label) => {
        const period = periods.find((p) => p.label === label);
        return (
          <TableCell
            key={label}
            className={cn('text-right text-sm', className)}
          >
            {period ? formatCompact(period.fees, currency) : '—'}
          </TableCell>
        );
      })}
    </>
  );
}

export function VendorPriceTable({
  vendors,
  periodLabels,
  contractSummaries,
}: Props) {
  const [chartParams, setChartParams] = useQueryStates(
    {
      vendor: parseAsInteger,
      product: parseAsInteger,
      contractId: parseAsInteger,
    },
    { history: 'replace' },
  );
  const selectedVendor =
    chartParams.vendor != null
      ? (vendors.find((v) => v.vendorId === chartParams.vendor) ?? null)
      : null;
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(
    new Set(),
  );
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    new Set(),
  );
  const [selectedContractId, setSelectedContractId] = useState<number | null>(
    null,
  );
  // null keeps the server's order — vendors arrive sorted by current ACV, so
  // the most expensive first is the default the page is built around. Cycling
  // back to it is why this is three states rather than a plain asc/desc flip.
  const [vendorSort, setVendorSort] = useState<'asc' | 'desc' | null>(null);
  const sortedVendors = useMemo(() => {
    if (vendorSort === null) return vendors;
    const sign = vendorSort === 'asc' ? 1 : -1;
    return [...vendors].sort(
      (a, b) =>
        a.vendorName.localeCompare(b.vendorName, undefined, { numeric: true }) *
        sign,
    );
  }, [vendors, vendorSort]);
  const cycleVendorSort = () =>
    setVendorSort((current) =>
      current === null ? 'asc' : current === 'asc' ? 'desc' : null,
    );

  const summariesById = new Map(
    contractSummaries.map((s) => [s.contractId, s]),
  );
  const selectedContract = selectedContractId
    ? (summariesById.get(selectedContractId) ?? null)
    : null;

  const toggle = (
    set: Set<string>,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    key: string,
  ) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  let vendorIndex = 0;

  return (
    <TooltipProvider delayDuration={150}>
      <ContractSummarySheet
        summary={selectedContract}
        isOpen={selectedContractId !== null}
        onClose={() => setSelectedContractId(null)}
      />
      {selectedVendor ? (
        <div className="h-[calc(100vh-16rem)] rounded-md border p-6">
          <VendorProductChart
            vendor={selectedVendor}
            periodLabels={periodLabels}
            focusProductId={chartParams.product ?? undefined}
            focusContractId={chartParams.contractId ?? undefined}
            onBack={() =>
              setChartParams({
                vendor: null,
                product: null,
                contractId: null,
              })
            }
            onDrilldown={(focus) =>
              setChartParams({
                vendor: chartParams.vendor,
                product: focus.productId ?? null,
                contractId: focus.contractId ?? null,
              })
            }
          />
        </div>
      ) : (
        <div className="h-[calc(100vh-16rem)] overflow-auto rounded-md border">
          <Table className="border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-20">
              <TableRow className="hover:bg-transparent">
                <SortableHeader
                  label="Vendor"
                  direction={vendorSort}
                  onSort={cycleVendorSort}
                  className="min-w-[200px] border-b bg-background"
                />
                <TableHead className="border-b bg-background">Type</TableHead>
                {periodLabels.map((label) => (
                  <TableHead
                    key={label}
                    className="border-b bg-background text-right"
                  >
                    {label}
                  </TableHead>
                ))}
                <TableHead className="w-[90px] border-b bg-background text-center">
                  Trend
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedVendors.flatMap((vendor) => {
                // Stable identity for keys/state — falls back to name only
                // for the rare case of a vendor with no vendor_id.
                const vendorKey =
                  vendor.vendorId != null
                    ? `v-${vendor.vendorId}`
                    : `n-${vendor.vendorName}`;
                const isVendorExpanded = expandedVendors.has(vendorKey);
                const hasProducts = vendor.products.length > 0;
                const allVendorContractsArchived =
                  hasProducts &&
                  vendor.products.every(
                    (p) =>
                      p.contracts.length > 0 &&
                      p.contracts.every((c) => c.isArchived),
                  );
                const isBanded = vendorIndex % 2 === 1;
                vendorIndex++;

                const rows = [
                  <TableRow
                    key={vendorKey}
                    className={cn(
                      hasProducts && 'cursor-pointer',
                      isBanded && 'bg-muted/40',
                    )}
                    onClick={
                      hasProducts
                        ? () =>
                            toggle(
                              expandedVendors,
                              setExpandedVendors,
                              vendorKey,
                            )
                        : undefined
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {hasProducts ? (
                          isVendorExpanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )
                        ) : (
                          <div className="w-4 shrink-0" />
                        )}
                        <VendorIcon
                          name={vendor.vendorName}
                          domain={vendor.vendorDomain}
                          width={36}
                          height={36}
                          className="shrink-0 rounded-sm"
                        />
                        <span className="font-medium">{vendor.vendorName}</span>
                        {vendor.contractCount > 1 && (
                          <span className="text-xs text-muted-foreground">
                            ({vendor.contractCount})
                          </span>
                        )}
                        {allVendorContractsArchived && (
                          <Badge variant="destructive" size="xs">
                            Archived
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell />
                    {periodLabels.map((label) => {
                      const period = vendor.periods.find(
                        (p) => p.label === label,
                      );
                      return (
                        <TableCell key={label} className="text-right">
                          {period
                            ? formatCompact(period.fees, vendor.currency)
                            : '—'}
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      <Sparkline
                        data={vendor.periods.map((p) => p.fees)}
                        onClick={
                          vendor.vendorId != null
                            ? () =>
                                setChartParams({
                                  vendor: vendor.vendorId!,
                                  product: null,
                                  contractId: null,
                                })
                            : undefined
                        }
                      />
                    </TableCell>
                  </TableRow>,
                ];

                if (isVendorExpanded) {
                  let subRowCount = 0;
                  for (const product of vendor.products) {
                    const productKey = `${vendorKey}__${product.productId}`;
                    const hasMultipleContracts = product.contracts.length > 1;
                    const isProductExpanded = expandedProducts.has(productKey);
                    const singleContractId = product.contracts[0]?.contractId;
                    const allContractsArchived =
                      product.contracts.length > 0 &&
                      product.contracts.every((c) => c.isArchived);
                    const isSubBanded = subRowCount % 2 === 1;
                    subRowCount++;

                    const productRowOnClick = hasMultipleContracts
                      ? (e: React.MouseEvent) => {
                          e.stopPropagation();
                          toggle(
                            expandedProducts,
                            setExpandedProducts,
                            productKey,
                          );
                        }
                      : singleContractId
                        ? (e: React.MouseEvent) => {
                            e.stopPropagation();
                            setSelectedContractId(singleContractId);
                          }
                        : undefined;

                    rows.push(
                      <TableRow
                        key={productKey}
                        className={cn(
                          (hasMultipleContracts || singleContractId) &&
                            'cursor-pointer',
                          isSubBanded
                            ? 'bg-muted dark:bg-muted/80'
                            : 'bg-muted/70 dark:bg-muted/50',
                        )}
                        onClick={productRowOnClick}
                      >
                        <TableCell className="pl-12">
                          <div className="flex items-center gap-2">
                            {hasMultipleContracts ? (
                              isProductExpanded ? (
                                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                              )
                            ) : (
                              <div className="w-3 shrink-0" />
                            )}
                            <span className="font-medium text-sm">
                              {product.productName}
                            </span>
                            {hasMultipleContracts && (
                              <span className="text-xs text-muted-foreground">
                                ({product.contracts.length})
                              </span>
                            )}
                            {allContractsArchived && (
                              <Badge variant="destructive" size="xs">
                                Archived
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {!hasMultipleContracts &&
                            product.contracts[0]?.contractType && (
                              <ContractLabel
                                name={product.contracts[0].contractType}
                                shorten
                              />
                            )}
                        </TableCell>
                        <PeriodCells
                          periodLabels={periodLabels}
                          periods={product.periods}
                          currency={vendor.currency}
                        />
                        <TableCell>
                          <Sparkline
                            data={product.periods.map((p) => p.fees)}
                            onClick={
                              vendor.vendorId != null
                                ? () =>
                                    setChartParams({
                                      vendor: vendor.vendorId!,
                                      product: Number(product.productId),
                                      contractId: null,
                                    })
                                : undefined
                            }
                          />
                        </TableCell>
                      </TableRow>,
                    );

                    if (isProductExpanded) {
                      for (const contract of product.contracts) {
                        const isContractBanded = subRowCount % 2 === 1;
                        subRowCount++;
                        rows.push(
                          <TableRow
                            key={`${productKey}__${contract.contractId}`}
                            className={cn(
                              'cursor-pointer',
                              isContractBanded
                                ? 'bg-muted/80 dark:bg-muted/70'
                                : 'bg-muted/50 dark:bg-muted/40',
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedContractId(contract.contractId);
                            }}
                          >
                            <TableCell className="pl-20">
                              <span className="text-sm">
                                {contract.amendsContractId != null && (
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 14 14"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1"
                                    shapeRendering="crispEdges"
                                    aria-hidden
                                    className="relative top-[-5px] mr-1.5 inline-block align-middle text-muted-foreground/40"
                                  >
                                    <path
                                      d="M3 0 V10 H13"
                                      vectorEffect="non-scaling-stroke"
                                    />
                                  </svg>
                                )}
                                {contract.contractType || 'Contract'}{' '}
                                <span className="text-muted-foreground">
                                  {contract.contractId}
                                </span>
                                {contract.amendsContractId != null && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span
                                        className="relative top-[-1px] ml-1.5 inline-block h-2 w-2 rounded-full bg-primary align-middle"
                                        aria-label="Amends another contract"
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      Amending{' '}
                                      {contract.amendsContractType ||
                                        'Contract'}{' '}
                                      {contract.amendsContractId} fee
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                {contract.isArchived && (
                                  <Badge
                                    variant="destructive"
                                    size="xs"
                                    className="ml-2"
                                  >
                                    Archived
                                  </Badge>
                                )}
                              </span>
                            </TableCell>
                            <TableCell />
                            <PeriodCells
                              periodLabels={periodLabels}
                              periods={contract.periods}
                              currency={vendor.currency}
                              className="text-xs"
                            />
                            <TableCell>
                              <Sparkline
                                data={contract.periods.map((p) => p.fees)}
                                onClick={
                                  vendor.vendorId != null
                                    ? () =>
                                        setChartParams({
                                          vendor: vendor.vendorId!,
                                          product: Number(product.productId),
                                          contractId: contract.contractId,
                                        })
                                    : undefined
                                }
                              />
                            </TableCell>
                          </TableRow>,
                        );
                      }
                    }
                  }
                }

                return rows;
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </TooltipProvider>
  );
}
