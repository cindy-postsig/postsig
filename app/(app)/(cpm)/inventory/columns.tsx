'use client';

import { useState } from 'react';
import { ColumnDef, Row } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Input } from '@/components/ui/input';
import { formatCurrency, getDaysUntilDate } from '@/app/lib/utils';
import { ColumnHeader } from '@/components/contracts/ColumnHeader';
import VendorIcon from '@/components/vendors/VendorIcon';
import { PlusIcon, MinusIcon } from '@heroicons/react/24/outline';
import { UserMetadata } from '@/constants/types';
import { formatDate, DATE_FORMAT_DEFAULT } from '@/lib/date-format';
import { type InventoryItem } from '@/lib/v2/inventory/types';

// Re-export InventoryItem for backwards compatibility
export type { InventoryItem } from '@/lib/v2/inventory/types';

// Delivery method options - simplified for badge display
const DELIVERY_METHODS = [
  'API',
  'SFTP',
  'Web Portal',
  'Email',
  'Terminal',
  'Database',
  'Cloud Storage',
  'Embedded',
  'Physical',
  'Other',
];

// Status options - updated to match contract status
const STATUS_OPTIONS = ['Active', 'Inactive'] as const;

// Inline editable status cell component
const EditableStatusCell = ({ row }: { row: Row<InventoryItem> }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(row.original.status);

  const handleStatusChange = (newStatus: string) => {
    setCurrentStatus(newStatus as InventoryItem['status']);
    setIsEditing(false);
    // TODO: Implement actual update logic
  };

  if (isEditing) {
    return (
      <Select value={currentStatus} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((status) => (
            <SelectItem key={status} value={status}>
              {status}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Badge
      variant={currentStatus === 'Active' ? 'default' : 'outline'}
      className="cursor-pointer hover:opacity-80"
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      {currentStatus}
    </Badge>
  );
};

// Inline editable delivery methods cell
const EditableDeliveryMethodsCell = ({ row }: { row: Row<InventoryItem> }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedMethods, setSelectedMethods] = useState(
    row.original.deliveryMethods,
  );

  const handleMethodToggle = (method: string) => {
    const newMethods = selectedMethods.includes(method)
      ? selectedMethods.filter((m) => m !== method)
      : [...selectedMethods, method];

    setSelectedMethods(newMethods);
    // TODO: Implement actual update logic
  };

  if (isEditing) {
    return (
      <Popover open={isEditing} onOpenChange={setIsEditing}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => e.stopPropagation()}
          >
            Edit Methods
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <div className="space-y-2">
            <h4 className="font-medium">Delivery Methods</h4>
            {DELIVERY_METHODS.map((method) => (
              <div key={method} className="flex items-center space-x-2">
                <Checkbox
                  id={method}
                  checked={selectedMethods.includes(method)}
                  onCheckedChange={() => handleMethodToggle(method)}
                />
                <label htmlFor={method} className="text-sm">
                  {method}
                </label>
              </div>
            ))}
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(false);
              }}
            >
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return <div className="flex flex-wrap gap-1"></div>;
};

// Alert badge component factory
const createAlertBadge = (advanceNoticePeriod: number) => {
  function AlertBadge({ row }: { row: Row<InventoryItem> }) {
    const alerts = [];

    // Check if this is a grouped row with subrows
    const hasSubRows = row.getCanExpand();

    if (hasSubRows) {
      // For grouped rows, aggregate alerts from FILTERED/VISIBLE subrows only
      let renewalCount = 0;
      let utilizationCount = 0;
      const alertRange = advanceNoticePeriod;

      // Get the filtered subrows from the table model instead of raw data
      const visibleSubRows = row.subRows || [];

      visibleSubRows.forEach((subRow) => {
        const subRowData = subRow.original;

        // Check renewal for each visible subrow
        if (subRowData.endDate && subRowData.status === 'Active') {
          const daysDifference = getDaysUntilDate(subRowData.endDate);

          if (daysDifference <= alertRange && daysDifference > 0) {
            renewalCount++;
          }
        }

        // Check utilization for each visible subrow (skip enterprise products)
        if (
          !subRowData.enterprise &&
          subRowData.activeUsers.length > 0 &&
          subRowData.licensesCount > 0
        ) {
          const utilization =
            (subRowData.activeUsers.length / subRowData.licensesCount) * 100;
          if (utilization < 50) {
            utilizationCount++;
          }
        }
      });

      // Add aggregated alerts only if there are filtered/visible subrows with issues
      if (renewalCount > 0) {
        alerts.push({
          type: 'renewal',
          message: `${renewalCount} ${renewalCount === 1 ? 'license' : 'licenses'} approaching renewal`,
        });
      }

      if (utilizationCount > 0) {
        alerts.push({
          type: 'utilization',
          message: `${utilizationCount} ${utilizationCount === 1 ? 'product' : 'products'} with low utilization`,
        });
      }
    } else {
      // For individual rows, check normally
      // Check for nearing renewal date (end date approaching)
      if (row.original.endDate && row.original.status === 'Active') {
        const daysDifference = getDaysUntilDate(row.original.endDate);

        const alertRange = advanceNoticePeriod;

        if (daysDifference <= alertRange && daysDifference > 0) {
          alerts.push({
            type: 'renewal',
            message: `Contract expires in ${daysDifference} days`,
          });
        }
      }

      // Check for low utilization (below 50% when there are active users, skip enterprise)
      if (
        !row.original.enterprise &&
        row.original.activeUsers.length > 0 &&
        row.original.licensesCount > 0
      ) {
        const utilization =
          (row.original.activeUsers.length / row.original.licensesCount) * 100;
        if (utilization < 50) {
          alerts.push({
            type: 'utilization',
            message: `${row.original.activeUsers.length}/${row.original.licensesCount} seats used (${Math.round(utilization)}%)`,
          });
        }
      }
    }

    if (alerts.length === 0) return null;

    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <div
            className="flex h-6 w-6 cursor-pointer items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-3 w-3 rounded-full bg-amber-500" />
          </div>
        </HoverCardTrigger>
        <HoverCardContent side="right" align="center" className="w-80">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Alerts</h4>
            {alerts.map((alert, index) => (
              <div
                key={index}
                className="font-label text-sm text-muted-foreground"
              >
                <div className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-500" />
                {alert.message}
              </div>
            ))}
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }

  return AlertBadge;
};

export const createInventoryColumns = (
  advanceNoticePeriod = 90,
  dateFormat: string = DATE_FORMAT_DEFAULT,
): ColumnDef<InventoryItem>[] => {
  const AlertBadge = createAlertBadge(advanceNoticePeriod);

  return [
    // Expander column for vendor groups
    {
      id: 'expander',
      header: () => null,
      cell: ({ row }) => {
        if (row.getCanExpand()) {
          return (
            <div className="flex items-center justify-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  row.toggleExpanded();
                }}
                className="bg-transparent p-0 hover:bg-transparent"
              >
                {row.getIsExpanded() ? (
                  <MinusIcon
                    className="min-w-6 cursor-pointer rounded-full bg-primary p-1 text-background"
                    width={24}
                    height={24}
                  />
                ) : (
                  <PlusIcon
                    className="min-w-6 cursor-pointer rounded-full bg-primary/15 p-1 text-primary"
                    width={24}
                    height={24}
                  />
                )}
              </button>
            </div>
          );
        }
        return null;
      },
      enableSorting: false,
      enableHiding: false,
      meta: {
        className: 'w-12',
      },
    },
    {
      id: 'alerts',
      header: () => null,
      cell: AlertBadge,
      enableSorting: false,
      enableHiding: false,
      meta: {
        className: 'w-12',
      },
    },
    {
      accessorKey: 'vendor',
      header: ({ column }) => <ColumnHeader column={column} title="Vendor" />,
      cell: ({ row }) => {
        // Hide vendor info for subrows (expanded items)
        if (row.depth > 0) {
          return <div />;
        }

        return (
          <div className="flex items-center space-x-3">
            <VendorIcon
              name={row.original.vendor}
              domain={row.original.vendorDomain}
              width={36}
              height={36}
            />
            <span className="font-medium font-sans text-[1.05em] leading-[1.15] tracking-[0.02rem]">
              {row.original.vendor}
            </span>
          </div>
        );
      },
      meta: {
        className: 'w-1/6',
      },
    },
    {
      accessorKey: 'productName',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Product / Dataset / Service" />
      ),
      cell: ({ row }) => {
        // Check if this is a product subrow (from expanded vendor groups)
        if (
          'vendor_products' in row.original &&
          row.original.vendor_products?.name
        ) {
          return (
            <div className="font-sans text-[0.9rem] leading-tight tracking-[0.02rem]">
              {row.original.vendor_products.name}
            </div>
          );
        }

        // Handle productName array
        const productName = row.original.productName;
        const isMultipleProducts = productName.length > 1;

        if (productName.length === 0) {
          return <div />;
        }

        if (productName.length === 1) {
          return (
            <div className="font-sans text-[0.9rem] leading-tight tracking-[0.02rem]">
              {productName[0]}
            </div>
          );
        }

        // Multiple products - show with badge
        return (
          <div className="flex items-center gap-2">
            <Badge
              variant={row.getIsExpanded() ? 'default' : 'secondary'}
              className="cursor-pointer text-xs hover:opacity-80"
              onClick={(e) => {
                e.stopPropagation();
                row.toggleExpanded();
              }}
            >
              {productName.length} Products
            </Badge>
          </div>
        );
      },
      meta: {
        className: 'w-1/4',
      },
    },
    {
      accessorKey: 'licensesCount',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Licenses / Seats" />
      ),
      cell: ({ row }) => {
        if (row.getCanExpand()) return <div />;
        if (row.original.enterprise) {
          return (
            <div className="text-center text-sm text-muted-foreground">
              Enterprise
            </div>
          );
        }
        return (
          <div
            className={`text-center ${row.original.licensesCount === 0 ? 'text-muted-foreground' : ''}`}
          >
            {row.original.licensesCount === 0
              ? '-'
              : row.original.licensesCount}
          </div>
        );
      },
      meta: {
        className: 'w-24 text-center font-label',
      },
    },
    {
      accessorKey: 'activeUsers',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Active Users" />
      ),
      cell: ({ row }) => {
        if (row.getCanExpand()) return <div />;
        return (
          <div
            className={`text-center ${row.original.activeUsers.length === 0 ? 'text-muted-foreground' : ''}`}
          >
            {row.original.activeUsers.length}
          </div>
        );
      },
      meta: {
        className: 'w-auto text-center font-label',
      },
    },
    {
      accessorKey: 'deliveryMethods',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Delivery Method" />
      ),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.deliveryMethods.map((method, index) => (
            <Badge
              key={index}
              variant="outline"
              className="whitespace-nowrap text-xs"
            >
              {method}
            </Badge>
          ))}
        </div>
      ),
      // @ts-ignore - Custom filter function
      filterFn: 'arrayIncludes',
      meta: {
        className: 'w-1/6',
      },
    },
    {
      accessorKey: 'startDate',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Start Date" />
      ),
      cell: ({ row }) =>
        row.original.isVendorGroup ? null : (
          <div className="whitespace-nowrap">
            {formatDate(row.original.startDate, dateFormat, '')}
          </div>
        ),
      meta: {
        className: 'w-24 font-label',
      },
    },
    {
      accessorKey: 'endDate',
      header: ({ column }) => <ColumnHeader column={column} title="End Date" />,
      cell: ({ row }) => {
        const endDate = row.original.endDate;
        if (!endDate || row.original.isVendorGroup) return null;

        const daysUntil = getDaysUntilDate(endDate);
        const alertRange = advanceNoticePeriod;
        const isApproaching = daysUntil <= alertRange && daysUntil > 0;

        return (
          <div
            className={`whitespace-nowrap ${isApproaching ? 'text-[#c52e50]' : ''}`}
          >
            {isApproaching
              ? `${daysUntil} days`
              : formatDate(endDate, dateFormat)}
          </div>
        );
      },
      meta: {
        className: 'w-24 font-label',
      },
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <ColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <Badge
          variant={row.original.status === 'Active' ? 'secondary' : 'outline'}
        >
          {row.original.status}
        </Badge>
      ),
      enableColumnFilter: true,
      meta: {
        className: 'w-24',
      },
    },
    {
      accessorKey: 'cost',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Cost" align="right" />
      ),
      // A row is one product on one contract, so it displays its fee
      // unconverted in the fee-source currency; a vendor group resolved its
      // own denomination when it was built (shared currency, else org base).
      // Sorting stays on the base-denominated accessor either way (PSK-1796).
      cell: ({ row }) => (
        <span className="block text-right">
          {formatCurrency(row.original.costNative, row.original.currency)}
        </span>
      ),
      meta: {
        className: 'w-24 text-right font-label',
      },
    },
    {
      accessorKey: 'businessSponsor',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Business Sponsor" />
      ),
      cell: ({ row }) => (
        <div className="text-sm">
          {Array.isArray(row.original.businessSponsor)
            ? row.original.businessSponsor.join(', ')
            : row.original.businessSponsor || ''}
        </div>
      ),
      // @ts-ignore - Custom filter function
      filterFn: 'arrayIncludes',
      meta: {
        className: 'w-32',
      },
    },
    {
      accessorKey: 'businessGroup',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Business Group" />
      ),
      cell: ({ row }) => (
        <div className="text-sm">{row.original.businessGroup || ''}</div>
      ),
      meta: {
        className: 'w-32',
      },
    },
  ];
};

// Default columns for backward compatibility
export const inventoryColumns = createInventoryColumns();
