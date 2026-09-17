'use client';

import { useState, useMemo } from 'react';
import { ColumnDef, Row } from '@tanstack/react-table';
import MonthlyReportTable from '@/components/budget/MonthlyReportTable';
import { columns as contractColumns } from '@/components/contracts/columns';
import { formatCurrency } from '@/app/lib/utils';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import VendorIcon from '@/components/vendors/VendorIcon';
import { ColumnHeader } from '@/components/contracts/ColumnHeader';
import Link from 'next/link';
import { ContractSheet } from '@/components/budget/ContractSheet';
import { PriceChangeData } from '@/lib/v2/reports/monthly-report/transforms';
import {
  BusinessSponsorAndGroupData,
  ProductData,
} from '@/lib/v2/reports/monthly-report/transforms';
import {
  areAllProductsSuperseded,
  getSupersededClasses,
} from '@/lib/utils/superseded';
import type { PriceHistory } from '@/app/lib/budget/types';
import { DateDisplay } from '../contracts/DateDisplay';
import { TableSectionHeader } from '@/components/budget/TableSectionHeader';
import type { ContractTableRow } from '@/lib/v2/core/types';
import type { UserMetadata } from '@/constants/types';

type ViewMode = 'amortized' | 'actual';

interface MonthlyReportTablesProps {
  spendByBusinessGroup: BusinessSponsorAndGroupData[];
  spendByBusinessSponsor: BusinessSponsorAndGroupData[];
  priceChanges: PriceChangeData[];
  selectedTag?: string | null;
  alertRange?: number;
  contracts?: ContractTableRow[];
  enrichedContracts?: any[];
  priceHistories?: PriceHistory[];
  upcomingRenewalsContracts?: ContractTableRow[];
  userMetadata?: UserMetadata;
  viewMode?: ViewMode;
  onDataChange?: () => void;
}

/**
 * A table row whose amounts carry their own denomination (PSK-1796). Structural
 * rather than TanStack's Row<TData>: the same helpers serve price-change rows
 * and sponsor/group tree rows, which share these fields and nothing else.
 */
interface DenominatedRow {
  original: {
    currency?: string;
    displayNextMonth?: number;
    displayChange?: number;
  };
}

type CurrencyForRow = (row: DenominatedRow) => string;

/**
 * The denomination the transform resolved for this row. A price-change row is
 * a single contract, so it carries that contract's own currency; a sponsor/
 * group child likewise; a sponsor/group parent carries its children's shared
 * currency, or the org base when they differ. All read the same field.
 */
const rowCurrency: CurrencyForRow = (row) => row.original.currency || 'USD';

// Helper function to create styled value cell with color background
const createStyledValueCell = (
  accessorKey: string,
  title: string,
  currencyForRow: CurrencyForRow,
  changeAccessorKey = 'change',
  // Rows sort on the accessor (always base) but may render a different
  // denomination — see DisplayAmounts in the monthly-report transforms.
  valueForRow?: (row: DenominatedRow) => number,
  // The color states the direction of the amount shown, so it must read the
  // same denomination the cell renders — a flat foreign contract has a zero
  // native change but a nonzero base one, and coloring from base would paint
  // an unchanged amount red (the FX artefact this PR removes elsewhere).
  changeForRow?: (row: DenominatedRow) => number,
) => ({
  accessorKey,
  header: ({ column }: any) => (
    <ColumnHeader column={column} title={title} align="right" />
  ),
  cell: ({ getValue, row }: any) => {
    const value = valueForRow ? valueForRow(row) : (getValue() as number);
    const change = changeForRow
      ? changeForRow(row)
      : row.original[changeAccessorKey];
    const currency = currencyForRow(row);

    if (change > 0) {
      return (
        <span className="rounded bg-[#B90C41] bg-opacity-10 p-2 text-[#B90C41]">
          {formatCurrency(value, currency)}
        </span>
      );
    } else if (change < 0) {
      return (
        <span className="rounded bg-[#00A86B] bg-opacity-10 p-2 text-[#009861]">
          {formatCurrency(value, currency)}
        </span>
      );
    }

    return (
      <span className="rounded bg-secondary p-2">
        {formatCurrency(value, currency)}
      </span>
    );
  },
  meta: {
    className: 'w-1/6 text-right font-label',
  },
});

const createChangeColumn = (
  currencyForRow: CurrencyForRow,
  valueForRow?: (row: DenominatedRow) => number,
) => ({
  accessorKey: 'change',
  header: ({ column }: any) => (
    <ColumnHeader column={column} title="Change" align="right" />
  ),
  sortingFn: (rowA: any, rowB: any, columnId: string) => {
    const a = rowA.getValue(columnId) as number;
    const b = rowB.getValue(columnId) as number;
    // Prioritize non-zero values by treating zeros as very small negative values
    const aValue = a === 0 ? -999999 : a;
    const bValue = b === 0 ? -999999 : b;
    // Standard comparison: return 1, -1, or 0
    if (aValue > bValue) return 1;
    if (aValue < bValue) return -1;
    return 0;
  },
  cell: ({ getValue, row }: any) => {
    const value = valueForRow ? valueForRow(row) : (getValue() as number);
    if (value === 0) return '-';
    const isPositive = value > 0;
    return (
      <span className={isPositive ? 'text-[#B90C41]' : 'text-[#00A86B]'}>
        {isPositive ? '+' : '-'}
        {formatCurrency(Math.abs(value), currencyForRow(row))}
      </span>
    );
  },
  meta: {
    className: 'w-1/6 text-right font-label',
  },
});

export default function MonthlyReportTables({
  spendByBusinessGroup,
  spendByBusinessSponsor,
  priceChanges,
  selectedTag,
  alertRange = 90,
  contracts = [],
  enrichedContracts = [],
  priceHistories = [],
  upcomingRenewalsContracts = [],
  userMetadata,
  viewMode = 'amortized',
}: MonthlyReportTablesProps) {
  const { baseCurrency } = useBaseCurrency();
  const [selectedContract, setSelectedContract] =
    useState<ContractTableRow | null>(null);
  const [selectedEnrichedContract, setSelectedEnrichedContract] = useState<
    any | null
  >(null);
  const [selectedPriceHistory, setSelectedPriceHistory] =
    useState<PriceHistory | null>(null);
  const [isContractSheetOpen, setIsContractSheetOpen] = useState(false);

  const handleContractClick = (contractId: number) => {
    const contract = contracts.find((c) => Number(c.id) === contractId);
    const enrichedContract = enrichedContracts.find((c) => c.id === contractId);
    const priceHistory = priceHistories.find((ph) => ph.id === contractId);

    if (contract) {
      setSelectedContract(contract);
      setSelectedEnrichedContract(enrichedContract || null);
      setSelectedPriceHistory(priceHistory || null);
      setIsContractSheetOpen(true);
    }
  };

  const handleCloseContractSheet = () => {
    setIsContractSheetOpen(false);
    setSelectedContract(null);
    setSelectedEnrichedContract(null);
    setSelectedPriceHistory(null);
  };

  const handleBusinessSponsorRowClick = (rowData: any) => {
    if (rowData.contractId) {
      handleContractClick(rowData.contractId);
    }
  };

  const handlePriceChangeRowClick = (rowData: any) => {
    if (rowData.contractId) {
      handleContractClick(rowData.contractId);
    }
  };

  const handleUpcomingRenewalRowClick = (rowData: any) => {
    if (rowData.id) {
      handleContractClick(rowData.id);
    }
  };

  // Select specific columns from contractColumns for renewals table
  const renewalsColumns = useMemo(() => {
    const columnIds = [
      'vendorAndProduct',
      'tags',
      'renewalType',
      'cancelByDate',
      'termEndDate',
      'currentBudget',
      'projectedBudget',
      'annualDifference',
    ];

    // Create a map of columns by their id/accessorKey
    const columnsMap = new Map();
    contractColumns.forEach((col: any) => {
      const key = col.accessorKey || col.id;
      if (key) {
        columnsMap.set(key, col);
      }
    });

    // Build columns array in the order specified by columnIds
    return columnIds
      .map((colId) => {
        const col = columnsMap.get(colId);
        if (!col) return null;

        // Override header for currentBudget
        if (col.accessorKey === 'currentBudget') {
          return {
            ...col,
            header: ({ column }: any) => (
              <ColumnHeader
                column={column}
                title="Current Annual"
                align="right"
              />
            ),
          };
        }
        // Override header for projectedBudget
        if (col.accessorKey === 'projectedBudget') {
          return {
            ...col,
            header: ({ column }: any) => (
              <ColumnHeader
                column={column}
                title="Projected Annual"
                align="right"
              />
            ),
          };
        }
        return col;
      })
      .filter(Boolean);
  }, []);

  // Create dynamic columns for business sponsor and business group tables
  const businessSponsorAndGroupColumns: ColumnDef<BusinessSponsorAndGroupData>[] =
    [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <ColumnHeader column={column} title="Name" align="left" />
        ),
        cell: ({ getValue, row }) => {
          const value = getValue<string>();
          const isContract = row.depth > 0;

          if (isContract) {
            return null;
          }

          return (
            <div
              className={`font-sans text-[0.9rem] leading-tight tracking-[0.02rem] ${
                value === 'Unassigned' ? 'font-bold' : ''
              }`}
            >
              {value}
            </div>
          );
        },
        meta: {
          className: 'w-1/6',
        },
      },
      {
        accessorKey: 'vendor',
        header: ({ column }) => (
          <ColumnHeader column={column} title="Vendor" align="left" />
        ),
        cell: ({ getValue, row }) => {
          const value = getValue<string>();
          const isContract = row.depth > 0;

          if (!isContract) {
            return null;
          }

          const vendorName = value;
          const vendorDomain = (
            'vendorDomain' in row.original
              ? row.original.vendorDomain
              : undefined
          ) as string | undefined;
          const supersededClasses = getSupersededClasses(
            areAllProductsSuperseded(row),
          );

          return (
            <div className={`flex items-center gap-2 ${supersededClasses}`}>
              <VendorIcon
                name={vendorName}
                domain={vendorDomain}
                width={30}
                height={30}
                className=""
              />
              <span className="line-clamp-2 font-sans text-[0.85rem] leading-tight tracking-[0.02rem]">
                {vendorName}
              </span>
            </div>
          );
        },
        meta: {
          className: 'w-1/4',
        },
      },
      {
        accessorKey: 'product',
        header: ({ column }) => (
          <ColumnHeader column={column} title="Product" align="left" />
        ),
        cell: ({ getValue, row }) => {
          const value = getValue<string>();
          const isContract = row.depth > 0;

          if (!isContract) {
            return null;
          }

          return (
            <span
              className={`line-clamp-2 font-sans text-[0.85rem] leading-tight tracking-[0.02rem] ${getSupersededClasses(areAllProductsSuperseded(row))}`}
            >
              {value}
            </span>
          );
        },
        meta: {
          className: 'w-1/6',
        },
      },
      {
        accessorKey: 'tags',
        header: ({ column }) => (
          <ColumnHeader column={column} title="Tags" align="left" />
        ),
        cell: ({ getValue, row }) => {
          const value = getValue<string[]>();
          const isVendor = row.depth > 0;
          if (!isVendor || !value || value.length === 0) return null;

          return (
            <div className="flex flex-wrap gap-1">
              {value.map((tag) => (
                <Badge
                  key={tag}
                  variant="user"
                  className="line-clamp-1 max-w-48 text-ellipsis break-words text-xs"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          );
        },
        meta: {
          className: 'w-1/6',
        },
      },
      {
        accessorKey: 'vendors',
        header: ({ column }) => (
          <ColumnHeader column={column} title="Vendors" align="right" />
        ),
        cell: ({ getValue, row }) => {
          const value = getValue<number>();
          const isVendor = row.depth > 0;
          if (isVendor) return null;

          return (
            <Badge variant="outline" className="text-xs">
              {value}
            </Badge>
          );
        },
        meta: {
          className: 'w-1/6 text-right font-label',
        },
      },
      {
        accessorKey: 'currentMonth',
        header: ({ column }) => (
          <ColumnHeader column={column} title="Current Month" align="right" />
        ),
        cell: ({ row }) => {
          const isContract = row.depth > 0;
          const rowData = row.original as any;
          const isSplit = isContract && rowData.isSplit === true;
          // Support split badges for both Business Sponsor and Business Group tables
          const splitNames = (rowData.businessSponsors ||
            rowData.businessGroups) as string[] | undefined;
          const splitCount = (rowData.sponsorCount ?? rowData.groupCount) as
            | number
            | undefined;

          return (
            <div className="flex items-center justify-end gap-2">
              {isSplit && splitNames && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Badge variant="notice" className="cursor-pointer">
                        Split
                      </Badge>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="text-left">
                    <div className="space-y-1">
                      <div className="font-medium">
                        {rowData.businessSponsors
                          ? `Split among ${splitCount} sponsors`
                          : `Split among ${splitCount} business groups`}
                      </div>
                      <div className="text-xs opacity-90">
                        {splitNames.map((name, index) => (
                          <div key={index}>{name}</div>
                        ))}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
              <span>
                {formatCurrency(rowData.displayCurrentMonth, rowCurrency(row))}
              </span>
            </div>
          );
        },
        meta: {
          className: 'w-1/6 text-right font-label',
        },
      },
      createStyledValueCell(
        'nextMonth',
        'Next Month',
        rowCurrency,
        'change',
        (row) => row.original.displayNextMonth ?? 0,
        (row) => row.original.displayChange ?? 0,
      ),
      createChangeColumn(rowCurrency, (row) => row.original.displayChange ?? 0),
    ];

  // Create dynamic columns for price changes table
  const priceChangesColumns: ColumnDef<PriceChangeData>[] = useMemo(
    () => [
      {
        accessorKey: 'vendor',
        header: ({ column }) => (
          <ColumnHeader column={column} title="Vendor/Product" align="left" />
        ),
        cell: ({ getValue, row }) => {
          const value = getValue() as string;
          return (
            <div className="flex items-center gap-3">
              <VendorIcon
                name={value}
                domain={row.original.vendorDomain}
                width={36}
                height={36}
                className=""
              />
              <div>
                <div>
                  <span className="font-medium font-sans text-[0.85rem] leading-[1.4] tracking-[0.02rem]">
                    {value}
                  </span>
                </div>
                <div className="leading-tight">
                  <span className="font-normal line-clamp-2 font-sans text-[0.85rem] leading-tight tracking-[0.02rem] text-muted-foreground">
                    {row.original.product}
                  </span>
                </div>
              </div>
            </div>
          );
        },
        meta: {
          className: 'w-1/4',
        },
      },
      {
        accessorKey: 'tags',
        header: ({ column }) => (
          <ColumnHeader column={column} title="Tags" align="left" />
        ),
        cell: ({ getValue }) => {
          const value = getValue() as string[];
          if (!value || value.length === 0) return null;

          return (
            <div className="flex flex-wrap gap-1">
              {value.map((tag: string) => (
                <Badge
                  key={tag}
                  variant="user"
                  className="line-clamp-1 max-w-48 text-ellipsis break-words text-xs"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          );
        },
        meta: {
          className: 'w-1/6',
        },
      },
      {
        accessorKey: 'previousPrice',
        header: ({ column }) => (
          <ColumnHeader
            column={column}
            title={
              viewMode === 'actual' ? 'Current (Actual Cost)' : 'Current Month'
            }
            align="right"
          />
        ),
        // A price change is one contract, so it reads in its own currency.
        cell: ({ getValue, row }) =>
          formatCurrency(getValue() as number, rowCurrency(row)),
        meta: {
          className: 'w-1/6 text-right font-label',
        },
      },
      createStyledValueCell(
        'newPrice',
        viewMode === 'actual' ? 'Projected (Actual Cost)' : 'Next Month',
        rowCurrency,
      ),
      createChangeColumn(rowCurrency),
      {
        accessorKey: 'reasonForChange',
        header: ({ column }) => (
          <ColumnHeader
            column={column}
            title="Reason for Change"
            align="left"
          />
        ),
        cell: ({ getValue }) => (
          <span className="font-label text-[0.85rem]">
            {getValue() as string}
          </span>
        ),
        meta: {
          className: 'w-1/6',
        },
      },
    ],
    [viewMode, baseCurrency],
  );

  return (
    <TooltipProvider>
      {/* Spend by Business Group */}
      <div className="space-y-6">
        <TableSectionHeader
          title="Spend by Business Group"
          description={(() => {
            const groupsWithIncreases = spendByBusinessGroup.filter(
              (group) =>
                group.change > 0 ||
                group.subRows.some((subRow) => subRow.change > 0),
            ).length;
            return groupsWithIncreases > 0
              ? `${groupsWithIncreases} business group${groupsWithIncreases === 1 ? ' has' : 's have'} vendor increases this month`
              : 'No business groups have vendor increases this month';
          })()}
        />
        {spendByBusinessGroup.length > 0 ? (
          <MonthlyReportTable
            data={spendByBusinessGroup}
            columns={businessSponsorAndGroupColumns}
            enableExpansion={true}
            onRowClick={handleBusinessSponsorRowClick}
          />
        ) : (
          <div className="flex h-24 items-center justify-center rounded-md border bg-secondary/50">
            <p className="text-sm italic text-muted-foreground">
              No business groups
            </p>
          </div>
        )}
      </div>

      {/* Spend by Business Sponsor */}
      <div className="space-y-6">
        <TableSectionHeader
          title="Spend by Business Sponsor"
          description={(() => {
            const sponsorsWithIncreases = spendByBusinessSponsor.filter(
              (sponsor) =>
                sponsor.change > 0 ||
                sponsor.subRows.some((subRow) => subRow.change > 0),
            ).length;
            return sponsorsWithIncreases > 0
              ? `${sponsorsWithIncreases} business sponsor${sponsorsWithIncreases === 1 ? ' has' : 's have'} vendor increases this month`
              : 'No business sponsors have vendor increases this month';
          })()}
        />
        {spendByBusinessSponsor.length > 0 ? (
          <MonthlyReportTable
            data={spendByBusinessSponsor}
            columns={businessSponsorAndGroupColumns}
            enableExpansion={true}
            onRowClick={handleBusinessSponsorRowClick}
          />
        ) : (
          <div className="flex h-24 items-center justify-center rounded-md border bg-secondary/50">
            <p className="text-sm italic text-muted-foreground">
              No business sponsors
            </p>
          </div>
        )}
      </div>

      {/* Price Changes */}
      <div className="space-y-6">
        <TableSectionHeader
          title="Price Changes"
          description={(() => {
            const increases = priceChanges.filter((item) => item.change > 0);
            const decreases = priceChanges.filter((item) => item.change < 0);
            // This one figure spans rows, which are each in their own currency,
            // so it sums the base-denominated change instead (PSK-1796).
            const totalChange = priceChanges.reduce(
              (sum, item) => sum + item.changeBase,
              0,
            );
            const count = priceChanges.length;

            if (count === 0) return 'No price changes this month';

            if (increases.length > 0 && decreases.length > 0) {
              const netChange = totalChange >= 0 ? 'increase' : 'decrease';
              return `Net price ${netChange} of ${formatCurrency(Math.abs(totalChange), baseCurrency)} across ${count} product${count === 1 ? '' : 's'} (${increases.length} up, ${decreases.length} down)`;
            } else if (increases.length > 0) {
              return `Price increases of ${formatCurrency(totalChange, baseCurrency)} across ${count} product${count === 1 ? '' : 's'}`;
            } else {
              return `Price decreases of ${formatCurrency(Math.abs(totalChange), baseCurrency)} across ${count} product${count === 1 ? '' : 's'}`;
            }
          })()}
        />
        {priceChanges.length > 0 ? (
          <MonthlyReportTable
            data={priceChanges}
            columns={priceChangesColumns}
            onRowClick={handlePriceChangeRowClick}
          />
        ) : (
          <div className="flex h-24 items-center justify-center rounded-md border bg-secondary/50">
            <p className="text-sm italic text-muted-foreground">
              No price changes
            </p>
          </div>
        )}
      </div>

      {/* Upcoming Renewals */}
      <div className="space-y-6">
        <TableSectionHeader
          title="Renewals"
          description={
            upcomingRenewalsContracts.length > 0
              ? (() => {
                  const totalProjectedFees = upcomingRenewalsContracts.reduce(
                    (sum: number, contract: any) =>
                      sum +
                      (contract.effectiveProjectedBudgetUSD ??
                        contract.convertedProjectedBudget ??
                        contract.projectedBudget ??
                        0),
                    0,
                  );
                  return `${upcomingRenewalsContracts.length} contract${upcomingRenewalsContracts.length === 1 ? '' : 's'} with a projected annual spend of ${formatCurrency(totalProjectedFees, baseCurrency)} will renew within ${alertRange} days`;
                })()
              : `No renewals within ${alertRange} days`
          }
        />
        {upcomingRenewalsContracts.length > 0 ? (
          <MonthlyReportTable
            data={upcomingRenewalsContracts}
            columns={renewalsColumns}
            onRowClick={handleUpcomingRenewalRowClick}
            defaultSortColumn="cancelByDate"
            defaultSortDirection="asc"
            enablePagination={true}
            initialPageSize={10}
            userMetadata={userMetadata}
          />
        ) : (
          <div className="flex h-24 items-center justify-center rounded-md border bg-secondary/50">
            <p className="text-sm italic text-muted-foreground">
              No renewals within {alertRange} days
            </p>
          </div>
        )}
      </div>

      {/* Contract Sheet */}
      <ContractSheet
        contract={selectedContract}
        priceHistory={selectedPriceHistory}
        enrichedContract={selectedEnrichedContract}
        isOpen={isContractSheetOpen}
        onClose={handleCloseContractSheet}
      />
    </TooltipProvider>
  );
}
