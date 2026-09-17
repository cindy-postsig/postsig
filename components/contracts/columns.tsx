'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ColumnDef, Row } from '@tanstack/react-table';
import { type ContractTableRow } from '@/lib/v2/core/types';
import { formatInheritedCancelByTooltip } from '@/lib/v2/core/lineage';
import { sanitizeOrderNumber } from '@/lib/v2/contracts/orderNumber';
import { contractRowHref } from '@/lib/v2/contracts/rowHref';
import { Checkbox } from '@/components/ui/checkbox';
import {
  customTotalContractValueSort,
  formatCurrency,
  formatNumberOfMonths,
} from '@/app/lib/utils';
import Link from 'next/link';
import VendorIcon from '@/components/vendors/VendorIcon';
import ContractLabel from '@/components/contracts/ContractLabel';
import ContractReplacementIndicator from '@/components/contracts/ContractReplacementIndicator';
import { hasReplacementPrompt } from '@/lib/contracts/replacementPrompt';
import { Button, buttonVariants } from '@/components/ui/button';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import { InlineExpandToggle } from '@/components/contracts/InlineExpandToggle';

import { ColumnHeader } from './ColumnHeader';
import StatusDropdown from './StatusDropdown';
import InvoiceStatusDropdown from './InvoiceStatusDropdown';
import {
  DEFAULT_INVOICE_STATUS,
  type InvoiceStatus,
} from '@/constants/invoiceStatus';
import { useContractStatusUpdate } from '@/hooks/useContractStatusUpdate';
import { useInvoiceStatusUpdate } from '@/hooks/useInvoiceStatusUpdate';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/date-format';
import { RenewedIcon } from './icons';
import {
  isProductRow,
  isVendorRow,
  isReportRow,
  isLeafDetailRow,
} from './rowTypeGuards';
import { LineageIndent, lineageGuidesFor } from './LineageIndent';
import { DateDisplay, calculateDaysRemaining } from './DateDisplay';
import { Badge } from '../ui/badge';
import { DoraScoreIndicator } from '@/app/ui/contracts/dora-score';
import { NdaRiskLevelIndicator } from '@/app/ui/contracts/nda-risk-level';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getProductYearLabel } from '@/app/lib/budget';
import {
  billedInvoiceAmount,
  invoiceGapCents,
} from '@/app/lib/budget/invoiceUtils';
import { FolderAssignmentCell } from './FolderAssignmentCell';
import { useAbility } from '@/components/providers/AbilityProvider';
import {
  areAllProductsSuperseded,
  formatProductFeeWithSuperseded,
} from '@/lib/utils/superseded';
import UploadContractVersionButton from '@/components/contracts/UploadContractVersionButton';
import { userRoles } from '@/constants/data';

const isProductUsageRow = (row: any): boolean =>
  row.original.isProductUsageRow === true;
const isInvoiceProductRow = (row: any): boolean =>
  row.original.isInvoiceProductRow === true;

const AddUsersButton: React.FC<{ contractId: number | string }> = ({
  contractId,
}) => {
  const ability = useAbility();
  const canManageUsers = ability.can('manage', 'ContractUser');

  if (!canManageUsers) {
    return (
      <div className="flex justify-center">
        <Button
          variant="accent"
          size="sm"
          className="px-3 py-1 text-xs"
          disabled
        >
          Add Users
        </Button>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <Link
        href={`/contracts/${contractId}?view=users`}
        prefetch={false}
        onClick={(e) => e.stopPropagation()}
        className={buttonVariants({
          variant: 'accent',
          size: 'sm',
          className: 'px-3 py-1 text-xs',
        })}
      >
        Add Users
      </Link>
    </div>
  );
};

const ReAllocateSeatsButton: React.FC<{ contractId: number | string }> = ({
  contractId,
}) => {
  const ability = useAbility();
  const canManageUsers = ability.can('manage', 'ContractUser');

  if (!canManageUsers) {
    return (
      <div className="flex justify-center">
        <Button
          variant="accent"
          size="sm"
          className="px-3 py-1 text-xs"
          disabled
        >
          Re-Allocate Seats
        </Button>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <Link
        href={`/contracts/${contractId}?view=users`}
        prefetch={false}
        onClick={(e) => e.stopPropagation()}
        className={buttonVariants({
          variant: 'accent',
          size: 'sm',
          className: 'px-3 py-1 text-xs',
        })}
      >
        Re-Allocate Seats
      </Link>
    </div>
  );
};

// Specialized product column renderers
// These functions handle different ways to display products based on report type

// 1. Underutilized Report - Show allocated products only
function renderUnderutilizedProductColumn(row: Row<any>, table: any) {
  // Handle product usage subrows first
  if (isProductUsageRow(row)) {
    // For product usage subrows in the utilization report
    const product = row.original.product?.[0];
    const isSuperseded = row.original.isSuperseded || false;
    return (
      <div className="w-full">
        <span
          className={`line-clamp-2 font-sans text-[0.9rem] leading-tight tracking-[0.02rem] ${isSuperseded ? 'line-through opacity-60' : ''}`}
        >
          {product?.vendor_products?.name || ''}
        </span>
      </div>
    );
  }

  // Skip other types of subrows
  if (isProductRow(row) || isVendorRow(row) || isReportRow(row)) {
    return null;
  }

  // Check for productUsage data
  const productUsage = row.original.productUsage;
  if (productUsage && productUsage.byProduct) {
    // Filter to only products with allocations
    const allocatedProducts = Object.values(productUsage.byProduct).filter(
      (product: any) => product.seats?.licensed > 0,
    );

    // If we have exactly one allocated product, show just that product name
    if (allocatedProducts.length === 1) {
      const product = allocatedProducts[0] as { name: string };
      // Check if all products are superseded (will be true if the single product is superseded)
      const allProductsSuperseded = areAllProductsSuperseded(row);
      return (
        <div className="flex items-center">
          <Link
            href={contractRowHref(row.original.id)}
            prefetch={false}
            className={`line-clamp-2 text-balance font-sans text-[0.9rem] leading-tight tracking-[0.02rem] underline-offset-2 hover:underline ${allProductsSuperseded ? 'line-through opacity-60' : ''}`}
          >
            {product.name}
          </Link>
        </div>
      );
    }
    // If we have multiple allocated products, show the count
    else if (allocatedProducts.length > 1) {
      return (
        <div className="flex items-center space-x-2">
          <Link
            href={contractRowHref(row.original.id)}
            prefetch={false}
            className="line-clamp-2 text-balance font-sans text-[0.9rem] leading-tight tracking-[0.02rem] underline-offset-2 hover:underline"
          >
            {allocatedProducts.length} Products
          </Link>
          <InlineExpandToggle
            expanded={row.getIsExpanded()}
            onToggle={() => row.toggleExpanded()}
          />
        </div>
      );
    }
  }

  // Fallback to standard display if no product usage data
  return renderStandardProductColumn(row, table);
}

// 2. Invoice Report - Special handling for invoice products
// Struck test against the row's supersededProducts keys (`${product_id}-${year}`,
// superseded AND cancelled per isStruckProduct). Matches on product_id alone —
// cancellations strike a product across every year row.
function isStruckOnRow(row: Row<any>, productId: unknown): boolean {
  if (productId == null) return false;
  const keys: string[] = row.original.supersededProducts || [];
  return keys.some((key) => key.split('-')[0] === String(productId));
}

function renderInvoiceProductColumn(row: Row<any>, table: any) {
  if (isInvoiceProductRow(row)) {
    // For invoice product subrows; struck products (superseded or cancelled,
    // PSK-1830) render crossed out like the contracts table.
    const product = row.original.product?.[0];
    const isSuperseded = row.original.isSuperseded || false;
    return (
      <div className="w-full">
        <Link
          href={contractRowHref(row.original.contract_id)}
          prefetch={false}
          className={`line-clamp-2 text-balance font-sans text-[0.8rem] leading-tight tracking-[0.02rem] underline-offset-2 hover:underline ${isSuperseded ? 'line-through opacity-60' : ''}`}
        >
          {product?.vendor_products?.name || ''}
        </Link>
      </div>
    );
  }

  // A vendor-group row's subRows are sibling contracts, not products; its
  // expand toggle lives in the left-hand expander column instead.
  if (isVendorRow(row)) {
    return null;
  }

  // With the discrepancy sheet enabled, the row itself opens it — the
  // product cell's own link would just be a second, competing way to
  // navigate away, so it renders as plain text instead.
  const enableDiscrepancySheet = !!table.options.meta?.enableDiscrepancySheet;
  const renderProductName = (
    content: React.ReactNode,
    isSuperseded: boolean,
    href: string,
  ) => {
    const className = cn(
      'line-clamp-2 text-balance font-sans text-[0.9rem] leading-tight tracking-[0.02rem]',
      !enableDiscrepancySheet && 'underline-offset-2 hover:underline',
      isSuperseded && 'line-through opacity-60',
    );
    return enableDiscrepancySheet ? (
      <span className={className}>{content}</span>
    ) : (
      <Link href={href} prefetch={false} className={className}>
        {content}
      </Link>
    );
  };

  // Count total products (matched + unmatched) from subRows
  const subRows = row.original.subRows || [];
  const totalProductCount = subRows.length;

  if (totalProductCount > 1) {
    const firstProduct = subRows[0];
    const productName =
      firstProduct?.vendor_products?.name ||
      firstProduct?.product?.[0]?.vendor_products?.name ||
      '';
    const isSuperseded = firstProduct?.isSuperseded || false;
    const content = (
      <>
        {productName}
        <span className="text-muted-foreground">
          {` +${totalProductCount - 1}`}
        </span>
      </>
    );
    return (
      <div className="flex items-center justify-between space-x-2">
        <div className="min-w-0 flex-1">
          {renderProductName(
            content,
            isSuperseded,
            contractRowHref(row.original.id),
          )}
        </div>
        <InlineExpandToggle
          expanded={row.getIsExpanded()}
          onToggle={() => row.toggleExpanded()}
        />
      </div>
    );
  }

  // Single product — show name inline (matched or unmatched)
  if (totalProductCount === 1) {
    const product = subRows[0]?.product?.[0];
    const isSuperseded = subRows[0]?.isSuperseded || false;
    const name = product?.vendor_products?.name || '';
    return renderProductName(
      name,
      isSuperseded,
      contractRowHref(row.original.id),
    );
  }

  // Fallback: use matchedProducts if no subrows (single matched product)
  const matchedProducts = row.original.matchedProducts || [];
  if (matchedProducts.length === 1) {
    const isSuperseded = isStruckOnRow(row, matchedProducts[0]?.product_id);
    const name = matchedProducts[0]?.product_name || '';
    return renderProductName(
      name,
      isSuperseded,
      contractRowHref(row.original.id),
    );
  }

  // Fallback to standard display
  return renderStandardProductColumn(row, table);
}

// 3. Standard Product Column - For all other reports and cases
function renderStandardProductColumn(row: Row<any>, table: any) {
  // Handle product usage rows
  if (isProductUsageRow(row)) {
    const product = row.original.product?.[0];
    return (
      <div className="w-full">
        <span className="line-clamp-2 font-sans text-[0.9rem] leading-tight tracking-[0.02rem]">
          {product?.vendor_products?.name || ''}
        </span>
      </div>
    );
  }

  // Handle product rows
  if (isProductRow(row)) {
    const isSuperseded = row.original.isSuperseded || false;

    return (
      <div
        className={`flex w-full items-center gap-2 ${isSuperseded ? 'line-through opacity-60' : ''}`}
      >
        <span className="rounded-sm border border-gray-700/60 px-[3px] pt-[2px] text-xs text-gray-700">
          {getProductYearLabel(
            row.original.year,
            row.original.termStartDate,
            row.original.fiscalYearStart || 1,
          )}
        </span>
        <span className="line-clamp-2 font-sans text-[0.9rem] leading-tight tracking-[0.02rem]">
          {
            // @ts-ignore
            row.original.vendor_products.name || ''
          }
        </span>
      </div>
    );
  }

  // For standard contract rows - use currentYearProducts (products for current fiscal year)
  const products = row.original.currentYearProducts || row.original.product;
  const productCount = Array.isArray(products)
    ? products.length
    : products
      ? 1
      : 0;
  // Lineage children replace the product sub-rows, and the gutter (or the
  // nested row's vendor cell) already carries the toggle that opens them; a
  // second toggle here would open the same rows.
  const showProductExpander =
    productCount > 1 &&
    !row.original.isProductRow &&
    !row.original.hasLineageChildren;

  let productName = '';
  let firstProduct: any = null;
  if (productCount > 0) {
    if (Array.isArray(products)) {
      firstProduct = products[0];
      productName = firstProduct?.vendor_products?.name || '';
    } else {
      productName = typeof products === 'string' ? products : '';
    }
  }

  // Check if products are superseded
  // For grouped views, we need to check if ALL displayed products are superseded
  // Leavers report intentionally ignores supersede styling - the whole point is
  // active leftover allocations, regardless of contract lineage.
  const reportType = table.options.meta?.reportType;
  const allProductsSuperseded =
    reportType === 'leavers' ? false : areAllProductsSuperseded(row);

  // Group by vendor cases
  const groupByVendor = table.options.meta?.groupByVendor;
  const isReport = table.options.meta?.includeReportSubRows;

  if (groupByVendor || isReport) {
    // Vendor groups and report sub-rows carry synthetic ids (`vendor-3`,
    // `report-dora-7`), so /contracts/<id> is a 404 that Next would prefetch.
    const linksToContract = !row.original.isGroup && !isReportRow(row);
    const nameClasses = `line-clamp-2 text-balance font-sans text-[0.9rem] leading-tight tracking-[0.02rem] underline-offset-2 hover:underline ${allProductsSuperseded ? 'line-through opacity-60' : ''}`;
    const nameContent = (
      <>
        {productName}
        <span className="text-muted-foreground">
          {productCount > 1 ? ` +${productCount - 1}` : ''}
        </span>
      </>
    );

    return (
      <div className="flex items-center justify-between space-x-2">
        <div className="min-w-0 flex-1">
          {linksToContract ? (
            <Link
              href={contractRowHref(row.original.id)}
              prefetch={false}
              className={nameClasses}
            >
              {nameContent}
            </Link>
          ) : (
            <span className={nameClasses}>{nameContent}</span>
          )}
        </div>
        {showProductExpander && (
          <InlineExpandToggle
            expanded={row.getIsExpanded()}
            onToggle={() => row.toggleExpanded()}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between space-x-2">
      <div className="min-w-0 flex-1">
        <Link
          href={contractRowHref(row.original.id)}
          prefetch={false}
          className={`line-clamp-2 text-balance font-sans text-[0.9rem] leading-tight tracking-[0.02rem] underline-offset-2 hover:underline ${allProductsSuperseded ? 'line-through opacity-60' : ''}`}
        >
          {productName}
          <span className="text-muted-foreground">
            {productCount > 1 ? ` +${productCount - 1}` : ''}
          </span>
        </Link>
      </div>
      {showProductExpander && (
        <InlineExpandToggle
          expanded={row.getIsExpanded()}
          onToggle={() => row.toggleExpanded()}
        />
      )}
    </div>
  );
}

export function getVendorNameAndSuccessStatus(data: any) {
  if (
    (data.isGroup || data.aiExtractionStatus === 'h_success') &&
    data.vendor
  ) {
    return { name: data.vendor, isSuccess: true, allowContractAccess: true };
  }
  if (data.aiExtractionStatus === 'h_failed') {
    return {
      name: 'Document cannot be processed',
      isSuccess: false,
      allowContractAccess: true,
    };
  }
  return { name: 'Pending', isSuccess: false, allowContractAccess: true };
}

const VENDOR_ICON_SIZES = [36, 28, 22] as const;
const COMPACT_VENDOR_ICON_SIZES = [24, 20, 18] as const;
const VENDOR_NAME_CLASSES = [
  'text-[1.05em]',
  'text-[0.9rem]',
  'text-[0.82rem]',
] as const;
const MAX_VENDOR_DEPTH_STEP = VENDOR_ICON_SIZES.length - 1;

// AnnualDifference component
const AnnualDifference: React.FC<{ difference: number | null }> = ({
  difference,
}) => {
  // Null means "no projection exists" (invoices) — blank, not 0%.
  if (difference == null) {
    return null;
  }
  if (difference > 0) {
    return <span className="text-[#B90C41]">+{difference.toFixed(2)}%</span>;
  } else if (difference < 0) {
    return <span className="text-[#009E65]">{difference.toFixed(2)}%</span>;
  } else {
    return <span className="text-muted-foreground">0%</span>;
  }
};

const StatusCell = React.memo(({ row }: { row: Row<ContractTableRow> }) => {
  const router = useRouter();
  const { updateContractStatus, isLoading } = useContractStatusUpdate({
    onSuccess: () => {
      router.refresh();
    },
  });

  return (
    <StatusDropdown
      currentStatus={
        row.original.contract_status as 'unconfirmed' | 'active' | 'inactive'
      }
      onStatusUpdate={(newStatus) =>
        updateContractStatus(
          row.original.id,
          newStatus,
          row.original.vendor,
          row.original.termEndDate,
          row.original.contract_status as 'unconfirmed' | 'active' | 'inactive',
        )
      }
      isLoading={isLoading}
      isDuplicate={row.original.isDuplicate}
    />
  );
});

StatusCell.displayName = 'StatusCell';

export const InvoiceStatusCell = React.memo(
  ({ row }: { row: Row<ContractTableRow> }) => {
    const { updateInvoiceStatus, isLoading } = useInvoiceStatusUpdate();

    const currentStatus = (row.original.invoiceStatus ||
      DEFAULT_INVOICE_STATUS) as InvoiceStatus;

    return (
      <div className="flex items-center gap-1.5">
        <InvoiceStatusDropdown
          currentStatus={currentStatus}
          onStatusUpdate={(newStatus, reason) =>
            updateInvoiceStatus(Number(row.original.id), newStatus, reason)
          }
          isLoading={isLoading}
          currentReason={row.original.invoiceDecisionReason ?? undefined}
          externalInvoiceStatus={
            row.original.externalInvoiceStatus ?? undefined
          }
          externalSource={row.original.externalSource ?? undefined}
        />
        {row.original.externalInvoiceStatus && (
          <Badge variant="outline" className="h-6 whitespace-nowrap text-xs">
            External: {row.original.externalInvoiceStatus}
          </Badge>
        )}
        {row.original.invoiceDecisionReason && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoCircledIcon className="h-3.5 w-3.5 shrink-0 cursor-default text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                {row.original.invoiceDecisionReason}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    );
  },
);

InvoiceStatusCell.displayName = 'InvoiceStatusCell';

/**
 * A contract-table amount, in the currency it is denominated in: contract and
 * product rows carry native amounts, while a vendor group row carries sums
 * rolled up across its contracts and so reads in the org's base currency.
 */
const RowMoney = ({
  row,
  amount,
}: {
  row: Row<ContractTableRow>;
  amount: number;
}) => {
  const { baseCurrency } = useBaseCurrency();
  const currency = isVendorRow(row) ? baseCurrency : row.original.currency;
  return <>{formatCurrency(amount, currency)}</>;
};

/**
 * How the invoice report colors a billed-vs-expected gap: over-billed reads
 * red, under-billed green, and a gap that rounds away to nothing is neither —
 * it keeps the table's default color, since red and green already carry a
 * meaning a row with no discrepancy should not claim (PSK-1929).
 */
function invoiceGapClass(gapCents: number): string {
  if (gapCents > 0) return 'text-[#B90C41]';
  if (gapCents < 0) return 'text-[#00A86B]';
  return '';
}

const TotalContractValueCell = ({
  row,
  table,
}: {
  row: Row<ContractTableRow>;
  table: any;
}) => {
  // Different display logic based on row type

  // For unpublished contracts
  if (
    isReportRow(row) ||
    (row.original.contractStatus && row.original.contractStatus !== 4)
  ) {
    return null;
  }

  // For product sub-rows: TCV is a cross-year aggregate, not meaningful per product
  if (isProductRow(row)) {
    return null;
  }

  // For all other rows (parent rows), check if all products are superseded
  const allProductsSuperseded = areAllProductsSuperseded(row);
  return (
    <span className={allProductsSuperseded ? 'line-through opacity-60' : ''}>
      <RowMoney row={row} amount={row.original.totalContractValue || 0} />
    </span>
  );
};

export const columns: ColumnDef<ContractTableRow>[] = [
  {
    id: 'uploadExecuted',
    header: () => null,
    cell: ({ row, table }) => {
      if (isProductRow(row) || isReportRow(row) || isVendorRow(row))
        return null;

      const contractId = row.original.id as unknown as number;
      const originalUserId = row.original.uploadedBy?.id || null;
      const currentUser = table.options.meta?.userMetadata;
      const role = currentUser?.userRole;
      const userId = currentUser?.userId;

      const canUpload =
        role === userRoles.clientSupervisor ||
        (role === userRoles.clientAdmin &&
          originalUserId &&
          userId &&
          originalUserId === userId);

      if (!contractId || !canUpload) return null;

      return (
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex justify-center"
        >
          <UploadContractVersionButton
            contractId={contractId}
            originalUserId={originalUserId}
            variant="icon"
            tooltip="Upload executed version"
          />
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
    meta: {
      className: 'w-[44px] text-center',
    },
  },
  {
    id: 'tags',
    accessorFn: (row) => {
      const tags = row.tags || [];
      return tags.length > 0 ? (tags[0]?.name || '').toLowerCase() : '';
    },
    // @ts-expect-error - subrowAware is a custom filter function defined in ContractsTableClient
    filterFn: 'subrowAware',
    header: ({ column }) => <ColumnHeader column={column} title="Tags" />,
    cell: ({ row }) => {
      // Display all tags (back to original full functionality)
      const tags = row.original.tags || [];

      if (!Array.isArray(tags) || tags.length === 0) return null;

      return (
        <div className={tags.length > 1 ? 'min-w-56' : ''}>
          <div className="flex flex-wrap gap-1">
            {tags.map((tag, index) => (
              <Badge
                key={tag.id || index}
                variant="user"
                className="line-clamp-1 max-w-48 text-ellipsis break-words text-xs"
              >
                {tag.name}
              </Badge>
            ))}
          </div>
        </div>
      );
    },
    meta: {
      className: 'w-1/6',
    },
  },
  {
    id: 'expander',
    header: () => null,
    cell: ({ row, table }) => {
      // Detail rows (products, report sub-rows) never carry an expander.
      if (isLeafDetailRow(row)) {
        return null;
      }

      // Nested rows carry their expander inside the vendor column, at the end
      // of their tree connector. This gutter holds the vendor group's control
      // only, so the two do not compete.
      if (table.options.meta?.nestByLineage && row.depth > 0) return null;

      const expandableChildren = row.subRows.filter(
        (sub) => !isLeafDetailRow(sub),
      ).length;

      return (
        <div className="flex items-center justify-center">
          {/*
            Expandable whenever there is anything to reveal. The old rule
            required two children, which is now wrong in both directions: a
            vendor group whose contracts form one chain has a single top-level
            child, and a contract with exactly one amendment still needs to
            open. Either way, hiding the control strands the rows below it.
          */}
          {row.getCanExpand() && expandableChildren > 0 ? (
            <InlineExpandToggle
              expanded={row.getIsExpanded()}
              onToggle={() => row.toggleExpanded()}
            />
          ) : null}
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="mx-1 block"
        variant="minus"
      />
    ),
    cell: ({ row }) => {
      // Every contract row is selectable at any nesting level; only detail
      // rows (products, report sub-rows) are not.
      return !isLeafDetailRow(row) && !isProductUsageRow(row) ? (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
          className="mx-1 block"
        />
      ) : null;
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'vendor',
    header: ({ column }) => <ColumnHeader column={column} title="Vendor" />,
    cell: ({ row, table }) => {
      if (isProductRow(row) || isReportRow(row)) return null;
      const isVendorsPage = table.options.meta?.isVendorsPage;
      const isCompact = table.options.meta?.compact;
      const { name, isSuccess } = getVendorNameAndSuccessStatus(row.original);
      const showReplacementPrompt = hasReplacementPrompt(
        row.original.id,
        table.options.meta?.replacementFlaggedContractIds,
      );
      const depth = Math.min(row.depth, MAX_VENDOR_DEPTH_STEP);
      const iconSize = isCompact
        ? COMPACT_VENDOR_ICON_SIZES[depth]
        : VENDOR_ICON_SIZES[depth];
      const nameClass = VENDOR_NAME_CLASSES[depth];
      const reportType = table.options.meta?.reportType;
      const allProductsSuperseded =
        reportType === 'leavers' ? false : areAllProductsSuperseded(row);

      if (table.options.meta?.nestByLineage && row.depth > 0) {
        const guides = lineageGuidesFor(table.getRowModel().rows).get(row.id);
        const expandableChildren = row.subRows.filter(
          (sub) => !isLeafDetailRow(sub),
        ).length;

        return (
          <div className="flex min-w-0 items-stretch">
            <LineageIndent
              rails={guides?.rails ?? []}
              isLast={guides?.isLast ?? true}
              compact={isCompact}
            />
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {row.getCanExpand() && expandableChildren > 0 ? (
                <InlineExpandToggle
                  size="sm"
                  expanded={row.getIsExpanded()}
                  onToggle={() => row.toggleExpanded()}
                />
              ) : (
                <span className="w-[18px] shrink-0" aria-hidden />
              )}
              <Link
                href={isSuccess ? contractRowHref(row.original.id) : ''}
                prefetch={false}
                onClick={(e) => e.stopPropagation()}
                scroll={false}
                className="min-w-0"
              >
                <span
                  className={cn(
                    'block truncate font-sans text-[0.9rem] leading-[1.15] tracking-[0.02rem]',
                    row.original.contractStatus &&
                      row.original.contractStatus !== 4
                      ? 'text-muted-foreground'
                      : 'text-foreground/90',
                    isSuccess && !isVendorsPage
                      ? 'underline-offset-2 hover:underline'
                      : '',
                  )}
                >
                  {name}
                </span>
              </Link>
              {showReplacementPrompt ? <ContractReplacementIndicator /> : null}
            </div>
          </div>
        );
      }

      const vendorContent = (
        <>
          <Link
            href={isSuccess ? `/vendors/${row.original.vendorId}` : ''}
            prefetch={false}
            onClick={(e) => e.stopPropagation()}
          >
            <VendorIcon
              name={isSuccess ? row.original.vendor : ''}
              domain={row.original.vendorDomain}
              width={iconSize}
              height={iconSize}
              className={cn(
                'shrink-0',
                depth > 0 ? 'ml-2' : '',
                depth > 1 ? 'opacity-80' : '',
                row.original.contractStatus && row.original.contractStatus !== 4
                  ? 'opacity-60'
                  : '',
              )}
            />
          </Link>
          {row.original.isGroup ? (
            <span
              className={cn(
                `ml-4 ${nameClass} font-medium block cursor-pointer truncate font-sans leading-[1.15] tracking-[0.02rem]`,
                isSuccess
                  ? row.original.contractStatus &&
                    row.original.contractStatus !== 4
                    ? 'text-muted-foreground'
                    : ''
                  : 'text-muted-foreground',
              )}
              onClick={(e) => {
                e.stopPropagation();
                row.toggleExpanded();
              }}
            >
              {name}
            </span>
          ) : (
            <Link
              href={isSuccess ? contractRowHref(row.original.id) : ''}
              prefetch={false}
              onClick={(e) => e.stopPropagation()}
              scroll={false}
            >
              <span
                className={cn(
                  `ml-4 ${nameClass} font-medium block truncate font-sans leading-[1.15] tracking-[0.02rem] ${
                    !isVendorsPage && isSuccess
                      ? 'underline-offset-2 hover:underline'
                      : ''
                  }`,
                  isSuccess
                    ? row.original.contractStatus &&
                      row.original.contractStatus !== 4
                      ? 'text-muted-foreground'
                      : depth > 0
                        ? 'text-foreground/75'
                        : ''
                    : 'text-muted-foreground',
                )}
              >
                {name}
              </span>
            </Link>
          )}
          {showReplacementPrompt ? <ContractReplacementIndicator /> : null}
        </>
      );

      return (
        <div className="flex min-w-0 items-center">
          {isVendorsPage ? (
            vendorContent
          ) : (
            <div className="flex min-w-0 items-center">{vendorContent}</div>
          )}
        </div>
      );
    },
    meta: {
      className: 'w-1/4 min-w-[300px]',
    },
  },
  {
    accessorKey: 'orderNumber',
    header: ({ column, table }) => {
      const reportType = table.options.meta?.reportType;
      const isInvoice =
        reportType === 'invoices' || reportType === 'invoices-folder';
      return (
        <ColumnHeader
          column={column}
          title={isInvoice ? 'Invoice No.' : 'Contract No.'}
        />
      );
    },
    cell: ({ row }) => {
      if (isProductRow(row) || isReportRow(row)) return null;
      return sanitizeOrderNumber(row.original.orderNumber) ?? '';
    },
  },
  {
    accessorKey: 'vendorAndProduct',
    header: ({ column }) => <ColumnHeader column={column} title="Vendor" />,
    cell: ({ row, table }) => {
      if (isProductRow(row) || isReportRow(row)) return null;
      const isVendorsPage = table.options.meta?.isVendorsPage;
      const isCompact = table.options.meta?.compact;
      const { name, isSuccess } = getVendorNameAndSuccessStatus(row.original);
      const showReplacementPrompt = hasReplacementPrompt(
        row.original.id,
        table.options.meta?.replacementFlaggedContractIds,
      );
      const depth = row.depth;
      const iconSize = isCompact ? (depth > 0 ? 20 : 24) : depth > 0 ? 28 : 34;

      const products = row.original.currentYearProducts || row.original.product;
      const productCount = Array.isArray(products)
        ? products.length
        : products
          ? 1
          : 0;

      let productName = '';
      if (productCount > 0) {
        productName = Array.isArray(products)
          ? products[0]?.vendor_products?.name || ''
          : typeof products === 'string'
            ? products
            : '';
      }

      const vendorContent = (
        <>
          <Link
            href={`/vendors/${row.original.vendorId}`}
            prefetch={false}
            className="z-10 flex"
          >
            <VendorIcon
              name={isSuccess ? row.original.vendor : ''}
              domain={row.original.vendorDomain}
              width={iconSize}
              height={iconSize}
              className={cn(
                depth > 0 ? 'ml-2' : '',
                row.original.contractStatus && row.original.contractStatus !== 4
                  ? 'opacity-60'
                  : '',
              )}
            />
          </Link>
          <span
            className={cn(
              `font-medium ml-[10px] font-sans text-[0.85rem] leading-[1.4] tracking-[0.02rem]`,
              isSuccess
                ? row.original.contractStatus &&
                  row.original.contractStatus !== 4
                  ? 'text-muted-foreground'
                  : ''
                : 'text-muted-foreground',
            )}
          >
            <Link
              href={contractRowHref(row.original.id)}
              prefetch={false}
              className="underline-offset-2 hover:underline"
            >
              <div className="z-10 line-clamp-1 flex items-center">{name}</div>
              <p className="font-normal line-clamp-1 text-balance font-sans text-[0.85rem] leading-tight tracking-[0.02rem]">
                {productName}
                <span className="text-muted-foreground">
                  {productCount > 1 ? ` +${productCount - 1}` : ''}
                </span>
              </p>
            </Link>
          </span>
          {showReplacementPrompt ? <ContractReplacementIndicator /> : null}
        </>
      );

      return <div className="flex items-center">{vendorContent}</div>;
    },
    meta: {
      className: 'w-1/2',
    },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <ColumnHeader column={column} title="Status" />,
    enableColumnFilter: true,
    cell: ({ row }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      const isVendorRow = (row: any): boolean =>
        row.original.id?.toString().startsWith('vendor-');
      const isProductRow = (row: any): boolean =>
        'vendor_products' in row.original;
      if (isVendorRow(row) || isProductRow(row)) {
        return null;
      }

      return (
        <div onClick={(e) => e.stopPropagation()}>
          <StatusCell row={row} />
        </div>
      );
    },
  },
  // Product column - Delegates to specialized renderers based on report type
  {
    id: 'product',
    accessorFn: (row) => {
      // For grouped rows, use empty string (similar to renewalType pattern)
      if (!row.product) {
        return '';
      }
      if (Array.isArray(row.product)) {
        return row.product.length > 0
          ? (
              row.product[0]?.vendor_products?.name ||
              row.product[0]?.name ||
              ''
            ).toLowerCase()
          : '';
      }
      return (
        typeof row.product === 'object' && row.product && row.product[0]
          ? (row.product[0] as any)?.vendor_products?.name ||
            (row.product[0] as any)?.name ||
            ''
          : ''
      ).toLowerCase();
    },
    header: ({ column }) => <ColumnHeader column={column} title="Product" />,
    cell: ({ row, table }) => {
      // Access the reportType from table.options.meta
      const reportType = table.options.meta?.reportType;

      // Non-publishable contracts
      if (row.original.aiExtractionStatus === 'h_failed') {
        return <span className="opacity-60">{row.original.fileName}</span>;
      }
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return <span className="text-muted-foreground">Pending</span>;
      }

      // Delegate to specialized renderers based on report type
      if (reportType === 'utilization') {
        return renderUnderutilizedProductColumn(row, table);
      } else if (
        reportType === 'invoices' ||
        reportType === 'invoices-folder'
      ) {
        return renderInvoiceProductColumn(row, table);
      } else {
        return renderStandardProductColumn(row, table);
      }
    },
    meta: {
      className: 'min-w-[200px]',
    },
  },

  {
    id: 'type',
    accessorFn: (row) => {
      // Handle array of types (grouped parent rows) - same pattern as tags
      if (Array.isArray(row.type)) {
        return row.type.length > 0 ? row.type[0].toLowerCase() : '';
      }
      // Handle single type (regular rows)
      return (row.type || '').toLowerCase();
    },
    header: ({ column }) => <ColumnHeader column={column} title="Type" />,
    enableColumnFilter: true,
    cell: ({ row, table }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      if (isProductRow(row)) return null;

      // Handle both array (grouped) and string (single) types
      const types = Array.isArray(row.original.type)
        ? row.original.type
        : [row.original.type].filter(Boolean);

      if (types.length === 0) return null;

      const groupByVendor = table.options.meta?.groupByVendor;

      return (
        <div
          className={cn(
            'flex flex-wrap gap-1',
            groupByVendor && types.length > 1 && 'min-w-[190px]',
          )}
        >
          {types.map((type, index) => (
            <ContractLabel key={index} name={type} shorten={true} />
          ))}
        </div>
      );
    },
  },
  {
    accessorKey: 'renewalType',
    // @ts-expect-error - subrowAware is a custom filter function defined in ContractsTableClient
    filterFn: 'subrowAware',
    header: ({ column }) => <ColumnHeader column={column} title="Renewal" />,
    enableColumnFilter: true,
    cell: ({ row }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      return row.original.renewalType || '';
    },
  },
  {
    accessorKey: 'cancelByDate',
    sortingFn: (rowA, rowB) => {
      const cancelByA = rowA.original.cancelByDate;
      const cancelByB = rowB.original.cancelByDate;

      // Both have cancelByDate - sort by date (ascending)
      if (cancelByA && cancelByB) {
        return cancelByA.localeCompare(cancelByB);
      }

      // Only A has cancelByDate - A comes first
      if (cancelByA && !cancelByB) {
        return -1;
      }

      // Only B has cancelByDate - B comes first
      if (!cancelByA && cancelByB) {
        return 1;
      }

      // Neither has cancelByDate - sort by termEndDate instead
      const termEndA = Array.isArray(rowA.original.termEndDate)
        ? rowA.original.termEndDate[0]?.date
        : rowA.original.termEndDate;
      const termEndB = Array.isArray(rowB.original.termEndDate)
        ? rowB.original.termEndDate[0]?.date
        : rowB.original.termEndDate;

      if (termEndA && termEndB) {
        return termEndA.localeCompare(termEndB);
      }
      if (termEndA && !termEndB) return -1;
      if (!termEndA && termEndB) return 1;
      return 0;
    },
    header: ({ column }) => <ColumnHeader column={column} title="Cancel By" />,
    cell: ({ row, table }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      const alertRange =
        table.options.meta?.userMetadata.userProfile.advance_notice_period;
      const inherited = row.original.cancelByDateInherited;
      return (
        <div className="flex items-center gap-1">
          {!isProductRow(row) && !isVendorRow(row) && (
            <>
              <DateDisplay
                date={row.original.cancelByDate}
                variant="date"
                alertRange={alertRange}
                formatPattern={table.options.meta?.userMetadata.dateFormat}
              />
              {inherited && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoCircledIcon className="h-3.5 w-3.5 shrink-0 cursor-default text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-[220px] text-xs"
                    >
                      {formatInheritedCancelByTooltip(inherited.noticeDays)}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </>
          )}
        </div>
      );
    },
    meta: {
      className: 'font-label',
    },
  },
  {
    accessorKey: 'executionDate',
    sortingFn: 'alphanumeric',
    header: ({ column, table }) => {
      const reportType = table.options.meta?.reportType;
      const isInvoice =
        reportType === 'invoices' || reportType === 'invoices-folder';
      return (
        <ColumnHeader
          column={column}
          title={isInvoice ? 'Invoice Date' : 'Execution Date'}
        />
      );
    },
    cell: ({ row, table }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      return (
        <div className="flex items-center gap-1 whitespace-nowrap">
          {!isProductRow(row) && !isVendorRow(row)
            ? formatDate(
                row.original.executionDate,
                table.options.meta?.userMetadata.dateFormat,
                row.original.executionDate ?? '',
              )
            : ''}
        </div>
      );
    },
    meta: {
      className: 'whitespace-nowrap font-label',
    },
  },
  {
    accessorKey: 'termStartDate',
    sortingFn: 'alphanumeric',
    header: ({ column, table }) => {
      const reportType = table.options.meta?.reportType;
      const isInvoice =
        reportType === 'invoices' || reportType === 'invoices-folder';
      return (
        <ColumnHeader
          column={column}
          title={isInvoice ? 'Billing Period Start Date' : 'Start Date'}
        />
      );
    },
    cell: ({ row, table }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      return (
        <div className="flex items-center gap-1 whitespace-nowrap">
          {!isProductRow(row) && !isVendorRow(row)
            ? formatDate(
                row.original.termStartDate,
                table.options.meta?.userMetadata.dateFormat,
                row.original.termStartDate ?? '',
              )
            : ''}
          {!isProductRow(row) &&
            !isVendorRow(row) &&
            row.original.renewed &&
            row.original.termStartDate && (
              <RenewedIcon
                originalDate={row.original.originalStartDate}
                dateType="start"
                height={12}
                width={12}
              />
            )}
        </div>
      );
    },
    meta: {
      className: 'whitespace-nowrap font-label',
    },
  },
  {
    accessorKey: 'termEndDate',
    sortingFn: 'alphanumeric',
    header: ({ column, table }) => {
      const reportType = table.options.meta?.reportType;
      const isInvoice =
        reportType === 'invoices' || reportType === 'invoices-folder';
      return (
        <ColumnHeader
          column={column}
          title={isInvoice ? 'Billing Period End Date' : 'End Date'}
        />
      );
    },
    cell: ({ row, table }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      const alertRange =
        table.options.meta?.userMetadata.userProfile.advance_notice_period;
      return (
        <div className="flex items-start gap-1">
          {!isProductRow(row) && !isVendorRow(row) && (
            <DateDisplay
              date={row.original.termEndDate}
              variant="date"
              alertRange={alertRange}
              formatPattern={table.options.meta?.userMetadata.dateFormat}
            />
          )}
          {!isProductRow(row) &&
            !isVendorRow(row) &&
            row.original.renewed &&
            row.original.termEndDate && (
              <RenewedIcon
                originalDate={row.original.originalEndDate}
                dateType="end"
                height={12}
                width={12}
              />
            )}
        </div>
      );
    },
    meta: {
      className: 'font-label',
    },
  },
  {
    accessorKey: 'extendedTermEndDate',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Extended Confidentiality Term" />
    ),
    cell: ({ row, table }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      const alertRange =
        table.options.meta?.userMetadata.userProfile.advance_notice_period;
      return (
        <div className="flex items-start gap-1">
          {!isProductRow(row) && (
            <DateDisplay
              date={row.original.extendedTermEndDate || null}
              variant="date"
              alertRange={alertRange}
              formatPattern={table.options.meta?.userMetadata.dateFormat}
            />
          )}
        </div>
      );
    },
    meta: {
      className: 'font-label',
    },
  },
  {
    accessorKey: 'ndaRiskLevel',
    header: ({ column }) => <ColumnHeader column={column} title="Risk Level" />,
    cell: ({ row }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      if (isProductRow(row)) return null;

      return (
        <div className="flex items-center">
          <NdaRiskLevelIndicator
            riskLevel={row.original.ndaRiskLevel}
            riskFlags={row.original.ndaRiskFlags}
            ndaInsights={row.original.ndaInsights}
            size="md"
            showLabel={false}
            showTooltip={true}
          />
        </div>
      );
    },
  },
  {
    accessorKey: 'billingFrequency',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Billing Frequency" />
    ),
    cell: ({ row }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      return row.original.billingFrequency !== null
        ? row.original.billingFrequency
        : '';
    },
  },
  {
    accessorKey: 'discount',
    header: ({ column }) => <ColumnHeader column={column} title="Discount" />,
    cell: ({ row }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      return !isProductRow(row) && row.original.discount ? (
        <span className=" text-[#009E65]">-{row.original.discount}%</span>
      ) : (
        ''
      );
    },
    meta: {
      className: 'font-label',
    },
  },
  {
    accessorKey: 'totalContractValue',
    header: ({ column }) => (
      <ColumnHeader column={column} title="TCV" align="right" />
    ),
    cell: ({ row, table }) => (
      <TotalContractValueCell row={row} table={table} />
    ),
    sortingFn: customTotalContractValueSort,
    meta: {
      className: 'text-right font-label',
    },
  },
  {
    accessorKey: 'currentBudget',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Current Spend" align="right" />
    ),
    cell: ({ row }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      if (isProductRow(row) || isReportRow(row)) {
        if (isProductRow(row)) {
          const fee = row.original.fees || 0;
          const isSuperseded = row.original.isSuperseded || false;
          return formatProductFeeWithSuperseded(
            fee,
            row.original.currency,
            isSuperseded,
          );
        }
        return null;
      }

      // Check if all products are superseded for parent rows
      const allProductsSuperseded = areAllProductsSuperseded(row);
      const value = <RowMoney row={row} amount={row.original.currentBudget} />;

      // Add tooltip for renewed contracts with annual increases
      if (row.original.renewed && row.original.annualIncrease > 0) {
        return (
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <div
                  className={
                    allProductsSuperseded ? 'line-through opacity-60' : ''
                  }
                >
                  {value}
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] text-left">
                <p>
                  <strong>Current Budget</strong> reflects renewals and annual
                  increases.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      return (
        <span
          className={allProductsSuperseded ? 'line-through opacity-60' : ''}
        >
          {value}
        </span>
      );
    },
    meta: {
      className:
        'text-right font-label bg-gradient-to-r border-l from-gray-700/5 pl-4',
    },
  },
  {
    // The invoices folder's amount column. An invoice's amount is a property
    // of the document, not of a fiscal window, so this reads the engine's
    // window-independent stamp — currentBudget answers "spend in the current
    // FY", which is correctly $0 for a prior-period invoice and wrong as a
    // register entry. Falls back to currentBudget where the row was built
    // without engine stamps.
    accessorKey: 'recordedAmount',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Amount" align="right" />
    ),
    cell: ({ row }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      if (isProductRow(row)) {
        const fee = row.original.fees || 0;
        return formatProductFeeWithSuperseded(
          fee,
          row.original.currency,
          row.original.isSuperseded || false,
        );
      }
      if (isReportRow(row)) return null;

      const amount = row.original.recordedAmount ?? row.original.currentBudget;
      return (
        <span
          className={
            areAllProductsSuperseded(row) ? 'line-through opacity-60' : ''
          }
        >
          <RowMoney row={row} amount={amount} />
        </span>
      );
    },
    meta: {
      className: 'text-right font-label',
    },
  },
  {
    accessorKey: 'annualCost',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Annual Cost" align="right" />
    ),
    cell: ({ row }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      if (isProductRow(row)) {
        const fee = row.original.compoundedFees || row.original.fees || 0;
        const isSuperseded = row.original.isSuperseded || false;
        return formatProductFeeWithSuperseded(
          fee,
          row.original.currency,
          isSuperseded,
        );
      }
      // Check if all products are superseded for parent rows
      const allProductsSuperseded = areAllProductsSuperseded(row);
      return (
        <span
          className={allProductsSuperseded ? 'line-through opacity-60' : ''}
        >
          <RowMoney row={row} amount={row.original.currentBudget} />
        </span>
      );
    },
    meta: {
      className: 'text-right font-label',
    },
  },
  {
    accessorKey: 'projectedBudget',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Projected Spend" align="right" />
    ),
    cell: ({ row }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }

      if (isProductRow(row) || isReportRow(row)) {
        if (isProductRow(row)) {
          const fee = row.original.compoundedFees ?? row.original.fees ?? 0;
          const isSuperseded = row.original.isSuperseded || false;
          return formatProductFeeWithSuperseded(
            fee,
            row.original.currency,
            isSuperseded,
          );
        }
        return null;
      }

      // Null means "no projection exists" (invoices, decision #11) — the
      // cell stays blank instead of showing a $0 that reads like a price.
      if (row.original.projectedBudget == null) {
        return null;
      }

      const currentBudget = row.original.currentBudget || 0;
      const projectedBudget = row.original.projectedBudget || 0;
      const change = projectedBudget - currentBudget;

      // Check if all products are superseded for parent rows
      const allProductsSuperseded = areAllProductsSuperseded(row);
      const supersededClass = allProductsSuperseded
        ? 'line-through opacity-60'
        : '';

      // Add tooltip for renewed contracts with annual increases
      if (row.original.renewed && row.original.annualIncrease > 0) {
        let bgClass = 'bg-secondary';
        let textClass = '';
        if (change > 0) {
          bgClass = 'bg-[#B90C41] bg-opacity-10';
          textClass = 'text-[#B90C41]';
        } else if (change < 0) {
          bgClass = 'bg-[#00A86B] bg-opacity-10';
          textClass = 'text-[#009E65]';
        }

        return (
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <span
                  className={`rounded p-2 ${bgClass} ${textClass} ${supersededClass}`}
                >
                  <RowMoney row={row} amount={row.original.projectedBudget} />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] text-left">
                <p>
                  <strong>Projected Budget</strong> reflects renewals and annual
                  increases.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      if (change > 0) {
        return (
          <span
            className={`rounded bg-[#B90C41] bg-opacity-10 p-2 text-[#B90C41] ${supersededClass}`}
          >
            <RowMoney row={row} amount={projectedBudget} />
          </span>
        );
      } else if (change < 0) {
        return (
          <span
            className={`rounded bg-[#00A86B] bg-opacity-10 p-2 text-[#009861] ${supersededClass}`}
          >
            <RowMoney row={row} amount={projectedBudget} />
          </span>
        );
      }

      return (
        <span className={`rounded bg-secondary p-2 ${supersededClass}`}>
          <RowMoney row={row} amount={projectedBudget} />
        </span>
      );
    },
    meta: {
      className: 'text-right font-label',
    },
  },
  {
    accessorKey: 'annualDifference',
    header: ({ column }) => (
      <ColumnHeader
        column={column}
        title={`Annual\nDifference`}
        align="right"
      />
    ),
    cell: ({ row }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      if (!isProductRow(row) && row.original.willNotRenewNextYear) {
        return (
          <span className="text-xs italic text-muted-foreground">
            Will Not Renew
          </span>
        );
      }
      return (
        !isProductRow(row) && (
          <AnnualDifference difference={row.original.annualDifference} />
        )
      );
    },
    meta: {
      className: 'text-right font-label',
    },
  },
  {
    accessorKey: 'term',
    header: ({ column }) => <ColumnHeader column={column} title="Term" />,
    cell: ({ row }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }

      return (
        <span className="whitespace-nowrap">
          {formatNumberOfMonths(row.original.term) || ''}
        </span>
      );
    },
    meta: {
      className: 'font-label',
    },
  },
  {
    accessorKey: 'missingClausesCount', // Updated to use the count for sorting
    header: ({ column }) => (
      <ColumnHeader column={column} title="Missing Clauses" />
    ),
    cell: ({ row, table }) => {
      // Check if this is a missing clauses subrow
      // @ts-ignore
      if (row.original.isMissingClausesRow) {
        const missingClauses = Array.isArray(row.original.missingClauses)
          ? row.original.missingClauses
          : [];

        // For the missing clauses row, display all the clauses as badges
        return (
          <div className="flex w-full flex-wrap gap-1 py-2">
            {missingClauses.map((clause: string, i: number) => (
              <Badge
                key={i}
                variant="outline"
                className="whitespace-normal break-words"
              >
                {clause}
              </Badge>
            ))}
          </div>
        );
      }

      // Regular row handling
      if (!row.original.missingClauses) return null;

      const missingClauses = Array.isArray(row.original.missingClauses)
        ? row.original.missingClauses
        : [];

      const clauseCount = missingClauses.length;
      if (clauseCount === 0) return null;

      // Toggle function for showing missing clauses
      const toggleMissingClausesExpansion = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click event
        row.toggleExpanded();
      };

      // For the main row, just show the badge with count and expand button
      return (
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="h-8 w-8 cursor-pointer items-center justify-center border-amber-200 bg-amber-100 px-0 text-sm text-amber-800 hover:bg-amber-200"
            onClick={toggleMissingClausesExpansion}
          >
            {clauseCount}
          </Badge>
        </div>
      );
    },
    meta: {
      className: 'min-w-[300px]',
    },
  },
  {
    accessorKey: 'doraScoreValue', // Updated to use numeric value for sorting
    header: ({ column }) => <ColumnHeader column={column} title="DORA Score" />,
    cell: ({ row }) => {
      // Check if this is a DORA categories subrow
      if (row.original.isMissingDoraCategoriesRow) {
        const missingCategories = Array.isArray(
          row.original.missingDoraCategories,
        )
          ? row.original.missingDoraCategories
          : [];

        return (
          <>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Missing
            </div>
            <div className="flex w-full flex-wrap gap-1 py-2">
              {missingCategories.map((category: string, i: number) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="line-clamp-1 whitespace-normal break-all"
                >
                  {category}
                </Badge>
              ))}
            </div>
          </>
        );
      }

      if (isVendorRow(row) || isProductRow(row)) {
        return null;
      }

      const doraScore = row.original.doraScore;
      if (!doraScore) return null;

      // Calculate how many categories are missing
      const missingCategoriesCount =
        row.original.missingDoraCategories?.length || 0;

      // Toggle function for showing missing DORA categories
      const toggleDoraCategoriesExpansion = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click event
        row.toggleExpanded();
      };

      return (
        <div
          className={`flex items-center gap-2 ${!row.original.hasICTVendor && 'opacity-30'}`}
          onClick={(e) => {
            e.stopPropagation();
            if (missingCategoriesCount > 0) {
              toggleDoraCategoriesExpansion(e);
            }
          }}
        >
          <DoraScoreIndicator
            score={doraScore.score}
            variant="progress"
            showLabel={false}
            size="md"
            details={doraScore.details}
            showTooltip={row.original.hasICTVendor}
          />
        </div>
      );
    },
    meta: {
      className: 'w-1/6',
    },
  },
  {
    accessorKey: 'invoiceStatus',
    // @ts-expect-error - subrowAware is a custom filter function defined in ContractsTableClient
    filterFn: 'subrowAware',
    header: ({ column }) => <ColumnHeader column={column} title="Status" />,
    enableColumnFilter: true,
    cell: ({ row }) => {
      if (isVendorRow(row) || isProductRow(row) || isInvoiceProductRow(row)) {
        return null;
      }

      return (
        <div onClick={(e) => e.stopPropagation()}>
          <InvoiceStatusCell row={row} />
        </div>
      );
    },
  },
  {
    id: 'frequencyMismatch',
    header: ({ column }) => <ColumnHeader column={column} title="Issues" />,
    cell: ({ row }) => {
      const issues: Array<{ label: string; tooltip: React.ReactNode }> = [];

      // Billing mismatch: frequencies don't align
      if (!row.original.frequencyAligned) {
        const parentFreq = row.original.parentBillingFrequency;
        const invoiceFreq = row.original.invoiceBillingFrequency;

        issues.push({
          label: 'Billing Mismatch',
          tooltip: (
            <div>
              <p className="font-medium mb-2">Billing Frequency Mismatch</p>
              <div className="grid grid-cols-2 gap-2 font-sans">
                <div className="rounded-sm border p-2">
                  <p className="font-medium text-xs">Parent Contract</p>
                  <p className="text-sm">
                    {parentFreq === 'Unknown' ? 'Unknown*' : parentFreq}
                  </p>
                </div>
                <div className="rounded-sm border p-2">
                  <p className="font-medium text-xs">Invoice</p>
                  <p className="text-sm">
                    {invoiceFreq === 'Unknown' ? 'Unknown*' : invoiceFreq}
                  </p>
                </div>
              </div>
              {(parentFreq === 'Unknown' || invoiceFreq === 'Unknown') && (
                <p className="mt-2 text-xs text-muted-foreground">
                  *When billing frequency is unknown, we default to annually for
                  calculation purposes.
                </p>
              )}
            </div>
          ),
        });
      }

      // Unexpected product: on subrows, flag individual unmatched products;
      // on parent rows, flag if any unmatched products exist
      if (isInvoiceProductRow(row) && row.original.isUnmatched) {
        issues.push({
          label: 'Unexpected Product',
          tooltip: <p>This product is not found on the parent contract.</p>,
        });
      } else if (
        !isInvoiceProductRow(row) &&
        row.original.hasUnmatchedProducts
      ) {
        issues.push({
          label: 'Unexpected Product',
          tooltip: (
            <p>
              This invoice contains products not found on the parent contract.
            </p>
          ),
        });
      }

      if (issues.length === 0) return null;

      return (
        <div className="flex flex-wrap gap-1">
          <TooltipProvider>
            {issues.map((issue) => (
              <Tooltip key={issue.label} delayDuration={0}>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="cursor-default whitespace-nowrap text-xs"
                  >
                    {issue.label}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px] text-left" side="top">
                  {issue.tooltip}
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>
      );
    },
    meta: {
      className: 'w-1/6',
    },
  },
  {
    accessorKey: 'expectedInvoiceAmount',
    header: ({ column }) => (
      <ColumnHeader
        column={column}
        title="Expected Invoice Amount"
        align="right"
      />
    ),
    cell: ({ row }) => {
      const invoiceBillingFrequency =
        row.original.invoiceBillingFrequency || 'Annually';

      // Show the billing frequency next to the amount. The comparison is
      // per-invoice, so both sides stay in the invoice's source currency —
      // only a parent priced in another currency was converted across.
      return (
        <div>
          <span>
            {formatCurrency(
              (row.original.adjustedParentAmount ||
                row.original.expectedInvoiceAmount) ??
                0,
              row.original.currency,
              true,
            )}
          </span>
          {invoiceBillingFrequency && invoiceBillingFrequency !== 'Unknown' && (
            <span className="mt-1 pl-1 text-xs text-muted-foreground">
              {invoiceBillingFrequency.toLowerCase()}
            </span>
          )}
        </div>
      );
    },
    meta: {
      className: 'text-right font-label',
    },
  },
  {
    accessorKey: 'invoiceAmount',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Billed Amount" align="right" />
    ),
    cell: ({ row }) => {
      const invoiceBillingFrequency =
        row.original.invoiceBillingFrequency || 'Annually';

      const invoiceAmount = billedInvoiceAmount(row.original);

      return (
        <div>
          <span className={invoiceGapClass(invoiceGapCents(row.original))}>
            {formatCurrency(invoiceAmount, row.original.currency, true)}
          </span>
          {invoiceBillingFrequency && invoiceBillingFrequency !== 'Unknown' && (
            <span className="mt-1 pl-1 text-xs text-muted-foreground">
              {invoiceBillingFrequency.toLowerCase()}
            </span>
          )}
        </div>
      );
    },
    meta: {
      className: 'text-right font-label',
    },
  },
  {
    accessorKey: 'difference',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Difference" align="right" />
    ),
    cell: ({ row }) => {
      // @ts-ignore
      const difference = row.original.difference || 0;
      // Zero off the same gap the Discrepancy column shows, so one row cannot
      // read "0%" next to a real gap — or a colored percentage next to none.
      const gapCents = invoiceGapCents(row.original);

      if (gapCents === 0) {
        return <span>0%</span>;
      }

      return (
        <span className={invoiceGapClass(gapCents)}>
          {difference > 0 ? '+' : ''}
          {difference.toFixed(2)}%
        </span>
      );
    },
    meta: {
      className: 'text-right font-label',
    },
  },
  {
    accessorKey: 'discrepancy',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Discrepancy" align="right" />
    ),
    cell: ({ row }) => {
      // The gap between the two amounts as this table renders them, in cents
      // (already adjusted to invoice frequency). Taking it from the rounded
      // amounts is what keeps this column equal to the subtraction a reader
      // does from the two columns to its left.
      const gapCents = invoiceGapCents(row.original);
      const invoiceBillingFrequency =
        row.original.invoiceBillingFrequency || 'Annually';

      // Cents on every row: a whole-dollar invoice would otherwise render a
      // real two-cent gap as "+$0". The gap is between two amounts in the
      // invoice's source currency; only the report total converts to base.
      const prefix = gapCents > 0 ? '+' : gapCents < 0 ? '-' : '';

      return (
        <div>
          <span className={`${invoiceGapClass(gapCents)} whitespace-nowrap`}>
            {prefix}
            {formatCurrency(
              Math.abs(gapCents) / 100,
              row.original.currency,
              true,
            )}
          </span>
          {invoiceBillingFrequency && invoiceBillingFrequency !== 'Unknown' && (
            <span className="mt-1 pl-1 text-xs text-muted-foreground">
              {invoiceBillingFrequency.toLowerCase()}
            </span>
          )}
        </div>
      );
    },
    meta: {
      className: 'text-right font-label',
    },
  },
  {
    accessorKey: 'seatUsageDisplay', // Updated to use display string for sorting
    header: ({ column }) => <ColumnHeader column={column} title="Seat Usage" />,
    cell: ({ row }) => {
      if (row.original.isEnterprise) {
        return (
          <span className="text-sm text-muted-foreground">Enterprise</span>
        );
      }

      const toggleRowExpansion = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click event
        row.toggleExpanded();
      };

      // For product usage rows - show the specific product's seat usage
      if (isProductUsageRow(row)) {
        const { assigned, licensed } = row.original.productUsage
          ?.totalSeats || {
          assigned: 0,
          licensed: 0,
        };

        return (
          <div className="flex w-full items-center whitespace-nowrap text-muted-foreground">
            <span>
              <Badge variant={'outline'} className="text-sm">
                {assigned}
              </Badge>{' '}
              {licensed > 0 ? `/ ${licensed} seats` : 'seats used'}
            </span>
          </div>
        );
      }

      // For normal contract rows - show total seat usage with expand option
      if (
        !isProductRow(row) &&
        !isVendorRow(row) &&
        !isReportRow(row) &&
        row.original.productUsage?.totalSeats
      ) {
        // Get all products with licensed seats
        const productsWithLicenses = Object.values(
          row.original.productUsage.byProduct || {},
        ).filter((product: any) => product.seats?.licensed > 0);

        // If we only have one licensed product, show just that product's usage
        if (productsWithLicenses.length === 1) {
          const product = productsWithLicenses[0];

          // NOTE: We don't need to set singleAllocatedProduct here as it's now
          // set directly in the utils.ts addProductUsageSubRows function

          return (
            <div className="flex w-full items-center whitespace-nowrap text-muted-foreground">
              <span>
                <Badge variant={'outline'} className="text-sm">
                  {product.seats.assigned}
                </Badge>{' '}
                / {product.seats.licensed} seats
              </span>
            </div>
          );
        }

        // For multiple licensed products, just show the badge with total assigned seats
        if (productsWithLicenses.length > 1) {
          // Calculate total assigned seats for licensed products
          const totalAssigned = productsWithLicenses.reduce(
            (sum, product: any) => sum + (product.seats?.assigned || 0),
            0,
          );

          return (
            <div className="flex w-full items-center gap-2 whitespace-nowrap text-muted-foreground">
              <span onClick={toggleRowExpansion}>
                <Badge variant={'outline'} className="text-sm">
                  {totalAssigned}
                </Badge>
              </span>
            </div>
          );
        }
      }

      return null;
    },
    meta: {
      className: 'w-1/12 font-label',
    },
  },
  {
    accessorKey: 'utilizationPercentage', // Updated to use percentage for sorting
    header: ({ column }) => (
      <ColumnHeader column={column} title="Utilization" />
    ),
    cell: ({ row, table }) => {
      if (row.original.isEnterprise) {
        return <span className="text-sm text-muted-foreground">N/A</span>;
      }

      // Check if this is the utilization report
      const reportType = table.options.meta?.reportType;
      const isUnderutilizedReport = reportType === 'utilization';

      // Check if there are any contract users
      const hasContractUsers = row.original.productUsage?.totalSeats?.assigned
        ? row.original.productUsage.totalSeats.assigned > 0
        : false;

      // Flag for dimming the display for rows without contract users
      const shouldDim =
        isUnderutilizedReport &&
        !hasContractUsers &&
        !row.original.isProductUsageRow;

      // Helper function to calculate utilization percentage
      const calculateUtilization = (
        assigned: number,
        licensed: number,
      ): number => {
        if (licensed <= 0) return 0;
        return Math.round((assigned / licensed) * 100);
      };

      // Helper function to render the utilization percentage with appropriate color
      const renderUtilizationBadge = (
        percentage: number,
        canExpand: boolean = false,
        onToggleExpand?: () => void,
        dimmed: boolean = false,
      ) => {
        // Determine color based on utilization percentage
        let colorClass = '';
        if (percentage <= 40) {
          colorClass = 'bg-[#B90C41]/10 text-[#B90C41]'; // Red for low utilization
        } else if (percentage <= 75) {
          colorClass = 'bg-amber-100 text-amber-800'; // Amber for medium utilization
        } else {
          colorClass = 'bg-[#00A86B]/10 text-[#00A86B]'; // Green for high utilization
        }

        // Add cursor-pointer class if the row can expand
        const cursorClass = canExpand ? 'cursor-pointer hover:opacity-80' : '';

        // Add opacity class if the value should be dimmed
        const dimClass = dimmed ? 'opacity-50' : '';

        return (
          <span
            className={`font-medium rounded px-2 py-1 text-sm ${colorClass} ${cursorClass} ${dimClass}`}
            onClick={(e) => {
              if (canExpand && onToggleExpand) {
                e.stopPropagation();
                onToggleExpand();
              }
            }}
            title={
              dimmed
                ? 'No users added yet'
                : canExpand
                  ? 'Click to view breakdown'
                  : undefined
            }
          >
            {percentage}%
          </span>
        );
      };

      // For product usage subrows
      if (row.original.isProductUsageRow) {
        const seats = row.original.productUsage?.totalSeats;
        if (seats) {
          const utilization = calculateUtilization(
            seats.assigned,
            seats.licensed,
          );

          // Check if this is a subrow of a row without users
          const parentRow = row.getParentRow();
          const parentHasNoUsers =
            parentRow &&
            isUnderutilizedReport &&
            !(parentRow.original.productUsage?.totalSeats?.assigned
              ? parentRow.original.productUsage.totalSeats.assigned > 0
              : false);

          // Dim if parent has no users
          return renderUtilizationBadge(
            utilization,
            false,
            undefined,
            parentHasNoUsers || shouldDim,
          );
        }
        return null;
      }

      // For parent rows with product usage data
      if (
        !isProductRow(row) &&
        !isVendorRow(row) &&
        !isReportRow(row) &&
        row.original.productUsage
      ) {
        // Get all products with licensed seats
        const productsWithLicenses = Object.values(
          row.original.productUsage.byProduct || {},
        ).filter((product: any) => product.seats?.licensed > 0);

        // Single product case
        if (productsWithLicenses.length === 1) {
          const product = productsWithLicenses[0];
          const utilization = calculateUtilization(
            product.seats.assigned,
            product.seats.licensed,
          );
          return renderUtilizationBadge(
            utilization,
            false,
            undefined,
            shouldDim,
          );
        }

        // Multiple products case - calculate overall utilization
        if (productsWithLicenses.length > 1) {
          // Don't show utilization for primary row with multiple products
          return null;
        }
      }

      // For utilization report with no user data, show default utilization of 0%
      if (shouldDim) {
        return renderUtilizationBadge(0, false, undefined, true);
      }

      return null;
    },
    meta: {
      className: 'w-1/12 font-label',
    },
  },
  {
    accessorKey: 'pricePerSeat',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Price Per Seat" />
    ),
    cell: ({ row, table }) => {
      if (row.original.isEnterprise) {
        return <span className="text-sm text-muted-foreground">N/A</span>;
      }

      // Check if this is the utilization report
      const reportType = table.options.meta?.reportType;
      const isUnderutilizedReport = reportType === 'utilization';

      // Check if there are any contract users
      const hasContractUsers = row.original.productUsage?.totalSeats?.assigned
        ? row.original.productUsage.totalSeats.assigned > 0
        : false;

      // Flag for dimming the display for rows without contract users
      const shouldDim =
        isUnderutilizedReport &&
        !hasContractUsers &&
        !row.original.isProductUsageRow;

      // For product usage subrows, show individual product's price per seat
      if (row.original.isProductUsageRow) {
        const pricePerSeat =
          row.original.productUsage?.totalSeats?.valuePerSeat || 0;

        // Check if this is a subrow of a row without users
        const parentRow = row.getParentRow();
        const parentHasNoUsers =
          parentRow &&
          isUnderutilizedReport &&
          !(parentRow.original.productUsage?.totalSeats?.assigned
            ? parentRow.original.productUsage.totalSeats.assigned > 0
            : false);

        // Apply dimming if parent has no users
        const dimThisRow = parentHasNoUsers || shouldDim;

        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`w-full ${dimThisRow ? 'opacity-50' : ''}`}>
                  {formatCurrency(pricePerSeat, row.original.currency)}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {dimThisRow
                    ? 'Estimated price per seat (no users added yet)'
                    : 'Calculated from the annual cost divided by allocated seats'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      // For parent rows with product usage data
      if (
        !isProductRow(row) &&
        !isVendorRow(row) &&
        !isReportRow(row) &&
        row.original.productUsage
      ) {
        // Get all products with allocated seats
        const productsWithAllocations = Object.values(
          row.original.productUsage.byProduct || {},
        ).filter((product: any) => product.seats?.licensed > 0);

        // If we only have one product with allocations, show just that product's price per seat
        if (productsWithAllocations.length === 1) {
          const product = productsWithAllocations[0];
          const pricePerSeat = product.seats.valuePerSeat || 0;
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`w-full ${shouldDim ? 'opacity-50' : ''}`}>
                    {formatCurrency(pricePerSeat, row.original.currency)}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {shouldDim
                      ? 'Estimated price per seat (no users added yet)'
                      : 'Calculated from the annual cost divided by allocated seats'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }

        // If multiple products with allocations, don't show anything in the primary row
        if (productsWithAllocations.length > 1) {
          return null;
        }
      }

      return null;
    },
    meta: {
      className: 'w-1/12 font-label',
    },
  },
  {
    accessorKey: 'potentialOverage',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Potential Overage" align="right" />
    ),
    cell: ({ row, table }) => {
      if (row.original.isEnterprise) {
        return <span className="text-sm text-muted-foreground">N/A</span>;
      }

      // Check if this is the utilization report
      const reportType = table.options.meta?.reportType;
      const isUnderutilizedReport = reportType === 'utilization';

      // Check if there are any contract users
      const hasContractUsers = row.original.productUsage?.totalSeats?.assigned
        ? row.original.productUsage.totalSeats.assigned > 0
        : false;

      // Flag for dimming the display for rows without contract users
      const shouldDim =
        isUnderutilizedReport &&
        !hasContractUsers &&
        !row.original.isProductUsageRow;

      // For product usage subrows, show individual product's unused seats value
      if (row.original.isProductUsageRow) {
        const unusedSeatsValue =
          row.original.productUsage?.totalSeats?.unusedSeatsValue || 0;
        if (unusedSeatsValue <= 0) return null;

        // Check if this is a subrow of a row without users
        const parentRow = row.getParentRow();
        const parentHasNoUsers =
          parentRow &&
          isUnderutilizedReport &&
          !(parentRow.original.productUsage?.totalSeats?.assigned
            ? parentRow.original.productUsage.totalSeats.assigned > 0
            : false);

        // Apply dimming if parent has no users
        const dimThisRow = parentHasNoUsers || shouldDim;

        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`w-full text-[#B90C41] ${dimThisRow ? 'opacity-50' : ''}`}
                >
                  {formatCurrency(unusedSeatsValue, row.original.currency)}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {dimThisRow
                    ? 'Estimated value of unused seats (no users added yet)'
                    : 'Value of unused seats derived from the annual cost'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      // For parent rows with product usage data
      if (
        !isProductRow(row) &&
        !isVendorRow(row) &&
        !isReportRow(row) &&
        row.original.productUsage
      ) {
        // Get all products with allocated seats
        const productsWithAllocations = Object.values(
          row.original.productUsage.byProduct || {},
        ).filter((product: any) => product.seats?.licensed > 0);

        // If we only have one product with allocations, show just that product's unused seats value
        if (productsWithAllocations.length === 1) {
          const product = productsWithAllocations[0];
          const unusedSeatsValue = product.seats.unusedSeatsValue || 0;

          if (unusedSeatsValue > 0) {
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`w-full text-[#B90C41] ${shouldDim ? 'opacity-50' : ''}`}
                    >
                      {formatCurrency(unusedSeatsValue, row.original.currency)}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {shouldDim
                        ? 'Potential value of unused seats (no users added yet)'
                        : 'Value of unused seats derived from the annual cost'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }
          return null;
        }

        // If we have multiple products with allocations, sum up their unusedSeatsValue
        if (productsWithAllocations.length > 1) {
          // Calculate the total unusedSeatsValue from allocated products only
          const totalUnusedSeatsValue = productsWithAllocations.reduce(
            (sum: number, product: any) => {
              return sum + (product.seats?.unusedSeatsValue || 0);
            },
            0,
          );

          // Only display if there is an actual value
          if (totalUnusedSeatsValue > 0) {
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`w-full text-[#B90C41] ${shouldDim ? 'opacity-50' : ''}`}
                    >
                      {formatCurrency(
                        totalUnusedSeatsValue,
                        row.original.currency,
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {shouldDim
                        ? 'Potential value of unused seats (no users added yet)'
                        : 'Value of unused seats based on allocated but unused licenses'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }
        }
      }

      // For parent rows with subrows, sum up unusedSeatsValue from all subrows
      // This is a fallback for when the productUsage approach doesn't apply
      if (
        !isProductRow(row) &&
        !isVendorRow(row) &&
        !isReportRow(row) &&
        row.subRows?.length > 0
      ) {
        // Calculate the total unusedSeatsValue from all subrows
        const totalUnusedSeatsValue = row.subRows
          .filter((subRow) => subRow.original.isProductUsageRow)
          .reduce((sum, subRow) => {
            const unusedValue =
              subRow.original.productUsage?.totalSeats?.unusedSeatsValue || 0;
            return sum + unusedValue;
          }, 0);

        // Only display if there is an actual value
        if (totalUnusedSeatsValue > 0) {
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`w-full text-[#B90C41] ${shouldDim ? 'opacity-50' : ''}`}
                  >
                    {formatCurrency(
                      totalUnusedSeatsValue,
                      row.original.currency,
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {shouldDim
                      ? 'Potential value of unused seats (no users added yet)'
                      : 'Value of unused seats based on allocated but unused licenses'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }
      }

      return null;
    },
    meta: {
      className: 'w-1/6 font-label',
    },
  },
  {
    accessorKey: 'addUsers',
    header: ({ column }) => <ColumnHeader column={column} title="" />,
    cell: ({ row, table }) => {
      // Only show the button for the utilization report
      const reportType = table.options.meta?.reportType;
      const isUnderutilizedReport = reportType === 'utilization';

      if (!isUnderutilizedReport) return null;

      // Check if there are any contract users
      const hasContractUsers = row.original.productUsage?.totalSeats?.assigned
        ? row.original.productUsage.totalSeats.assigned > 0
        : false;

      // Only show for main rows, not product rows, vendor rows, report rows
      // and only for rows without contract users
      if (
        !isProductRow(row) &&
        !isVendorRow(row) &&
        !isReportRow(row) &&
        !row.original.isProductUsageRow &&
        !hasContractUsers
      ) {
        return <AddUsersButton contractId={row.original.id} />;
      }

      return null;
    },
    meta: {
      className: 'w-1/12',
    },
  },
  {
    accessorKey: 'departedLicensesCount',
    header: ({ column }) => <ColumnHeader column={column} title="Licenses" />,
    cell: ({ row }) => {
      // @ts-ignore - LeaverSubRow flag
      if (row.original.isLeaverSubRow) {
        const names: string[] = Array.isArray(
          // @ts-ignore - LeaverSubRow shape
          row.original.departedEmployeeNames,
        )
          ? // @ts-ignore - LeaverSubRow shape
            row.original.departedEmployeeNames
          : [];

        return (
          <div className="flex w-full flex-wrap gap-1 py-2">
            {names.map((name, i) => (
              <Badge
                key={i}
                variant="outline"
                className="whitespace-normal break-words"
              >
                {name}
              </Badge>
            ))}
          </div>
        );
      }

      if (isProductRow(row) || isVendorRow(row) || isReportRow(row)) {
        return null;
      }
      const count = row.original.departedLicensesCount ?? 0;
      if (count === 0) return null;

      const toggleExpansion = (e: React.MouseEvent) => {
        e.stopPropagation();
        row.toggleExpanded();
      };

      return (
        <Badge
          variant="secondary"
          className="h-8 cursor-pointer items-center justify-center border-amber-200 bg-amber-100 px-3 text-sm text-amber-800 hover:bg-amber-200"
          onClick={toggleExpansion}
        >
          {count}
        </Badge>
      );
    },
    meta: {
      className: 'min-w-[300px] font-label',
    },
  },
  {
    accessorKey: 'reAllocateSeats',
    header: ({ column }) => <ColumnHeader column={column} title="" />,
    cell: ({ row, table }) => {
      const reportType = table.options.meta?.reportType;
      if (reportType !== 'leavers') return null;

      if (isProductRow(row) || isVendorRow(row) || isReportRow(row)) {
        return null;
      }

      return <ReAllocateSeatsButton contractId={row.original.id} />;
    },
    meta: {
      className: 'w-1/12',
    },
  },
  {
    accessorKey: 'daysRemaining',
    sortingFn: (rowA, rowB) => {
      const daysA = calculateDaysRemaining(rowA.original.termEndDate);
      const daysB = calculateDaysRemaining(rowB.original.termEndDate);
      if (daysA === null && daysB === null) return 0;
      if (daysA === null) return 1;
      if (daysB === null) return -1;
      return daysA - daysB;
    },
    header: ({ column }) => (
      <ColumnHeader column={column} title="Days Remaining" />
    ),
    cell: ({ row }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      if (isProductRow(row) || isVendorRow(row) || isReportRow(row)) {
        return null;
      }

      const termEndDate = row.original.termEndDate;
      if (!termEndDate) return null;

      return <DateDisplay date={termEndDate} variant="daysRemaining" />;
    },
    meta: {
      className: 'font-label',
    },
  },
  {
    accessorKey: 'businessGroup',
    // @ts-expect-error - subrowAware is a custom filter function defined in ContractsTableClient
    filterFn: 'subrowAware',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Business Group" />
    ),
    cell: ({ row }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      if (isProductRow(row) || isReportRow(row)) {
        return null;
      }
      const groups = row.original.businessGroup;
      if (!groups) return null;
      return (
        <div className="line-clamp-2 font-sans" title={groups}>
          {groups}
        </div>
      );
    },
    meta: {
      className: 'min-w-[220px]',
    },
  },
  {
    accessorKey: 'businessSponsor',
    // @ts-expect-error - subrowAware is a custom filter function defined in ContractsTableClient
    filterFn: 'subrowAware',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Business Sponsor" />
    ),
    cell: ({ row }) => {
      if (row.original.contractStatus && row.original.contractStatus !== 4) {
        return null;
      }
      const sponsors = row.original.businessSponsor;
      if (!sponsors || !Array.isArray(sponsors) || sponsors.length === 0) {
        return null;
      }
      return (
        <div className="line-clamp-1 break-all font-sans">
          {sponsors.join(', ')}
        </div>
      );
    },
  },
  {
    accessorKey: 'folder',
    header: ({ column }) => <ColumnHeader column={column} title="Folder" />,
    cell: ({ row, table }) => {
      if (
        isProductRow(row) ||
        isReportRow(row) ||
        row.original.isProductUsageRow
      ) {
        return null;
      }

      return <FolderAssignmentCell contract={row.original} table={table} />;
    },
    meta: {
      className: 'w-auto',
    },
  },
];
