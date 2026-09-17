'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@/app/lib/utils';
import {
  SeatDetailRow,
  SeatExpanderCell,
  hasSeatDetail,
} from '@/components/assignments/SeatDetail';
import { SeatStatusBadge } from '@/components/seats/SeatStatusBadge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate } from '@/lib/date-format';
import type { ProductRow } from '@/lib/v2/assignments/rows';
import type {
  AssignmentSeat,
  AssignmentsPayload,
} from '@/lib/v2/assignments/types';
import {
  isSidContractId,
  sidExchangeHref,
  sidSubscriptionsHref,
} from '@/lib/v2/bloomberg-sid/keys';
import { PLACEHOLDER } from './placeholders';

const PRODUCT_SHEET_TABS = ['details', 'users', 'inactive'] as const;
export type ProductSheetTab = (typeof PRODUCT_SHEET_TABS)[number];
const isProductSheetTab = (value: string): value is ProductSheetTab =>
  (PRODUCT_SHEET_TABS as readonly string[]).includes(value);

/**
 * One panel for all three of the ticket's click targets — the product name,
 * the Users count and the Inactive count — which differ only in the tab they
 * open on.
 */
export function ProductSheet({
  product,
  payload,
  defaultTab,
  baseCurrency,
  dateFormat,
  onClose,
}: {
  product: ProductRow | null;
  payload: AssignmentsPayload;
  defaultTab: ProductSheetTab;
  baseCurrency: string;
  dateFormat: string;
  onClose: () => void;
}) {
  if (!product) return null;
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <ProductSheetBody
          // Fresh tab state per product and per entry point, so opening from
          // the Inactive count lands on Inactive rather than the last tab.
          key={`${product.key}:${defaultTab}`}
          product={product}
          payload={payload}
          defaultTab={defaultTab}
          baseCurrency={baseCurrency}
          dateFormat={dateFormat}
        />
      </SheetContent>
    </Sheet>
  );
}

/**
 * Split out so the tab state is created fresh per product: keyed on the row,
 * re-opening from a different count lands on the right tab instead of keeping
 * the last one.
 */
function ProductSheetBody({
  product,
  payload,
  defaultTab,
  baseCurrency,
  dateFormat,
}: {
  product: ProductRow;
  payload: AssignmentsPayload;
  defaultTab: ProductSheetTab;
  baseCurrency: string;
  dateFormat: string;
}) {
  const [tab, setTab] = useState<ProductSheetTab>(defaultTab);

  const seats = product.seatIds
    .map((id) => payload.seats[id])
    .filter((seat): seat is AssignmentSeat => seat !== undefined);
  const inactive = seats.filter((seat) => seat.underused);
  const detail = product.detail;
  // A Bloomberg terminal is billed off an imported seat report rather than a
  // contract record, so its product opens the inventory view instead.
  const sidVendorId =
    product.vendorId !== null && product.contractIds.every(isSidContractId)
      ? product.vendorId
      : null;
  const contractId = product.contractIds[0];
  const contractHref =
    product.contractIds.length === 1 && !isSidContractId(contractId)
      ? `/contracts/${contractId}`
      : undefined;

  const tabs: { key: ProductSheetTab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'users', label: `Users (${product.userCount})` },
    { key: 'inactive', label: `Inactive (${product.inactiveCount})` },
  ];

  return (
    <>
      <SheetHeader className="space-y-0 border-b border-border px-5 pb-4 pt-5 text-left">
        <p className="text-sm text-muted-foreground">{product.vendorName}</p>
        <SheetTitle className="font-serif text-lg">
          {product.productName}
        </SheetTitle>
      </SheetHeader>

      <Tabs
        size="sm"
        value={tab}
        onValueChange={(next) => {
          if (isProductSheetTab(next)) setTab(next);
        }}
      >
        <TabsList className="w-full justify-start border-b px-3">
          {tabs.map((entry) => (
            <TabsTrigger key={entry.key} value={entry.key}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="details" className="px-5 py-5">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-5 text-sm">
            <Field
              label="Start date"
              value={
                detail?.startDate
                  ? formatDate(detail.startDate, dateFormat)
                  : null
              }
            />
            <Field
              label="End date"
              value={
                detail?.endDate ? formatDate(detail.endDate, dateFormat) : null
              }
            />
            <Field
              label="Annual cost (per licence)"
              value={
                detail?.ratePerLicence != null
                  ? formatCurrency(detail.ratePerLicence, baseCurrency, true)
                  : null
              }
            />
            <Field
              label="Annual cost (in scope)"
              // The allocated cost of the seats this scope holds, back to the
              // annual figure the Cost Allocation tab prints.
              value={formatCurrency(
                product.monthlyCost * 12,
                baseCurrency,
                true,
              )}
            />
            <Field
              label="Annual increase"
              value={
                detail?.annualIncrease != null
                  ? `${detail.annualIncrease}%`
                  : null
              }
            />
            {sidVendorId === null ? (
              <Field
                label="Linked contract"
                value={
                  product.contractIds.length > 1
                    ? `${product.contractIds.length} contracts`
                    : (detail?.orderNumber ??
                      detail?.contractType ??
                      (contractHref ? 'View contract' : null))
                }
                href={contractHref}
              />
            ) : (
              <>
                <Field
                  label="Terminal subscriptions"
                  value="View in inventory"
                  href={sidSubscriptionsHref(sidVendorId, {
                    product: product.productName,
                  })}
                />
                {product.entitledSeatCount > 0 && (
                  <Field
                    label="Exchange entitlements"
                    value="View in inventory"
                    href={sidExchangeHref(sidVendorId)}
                  />
                )}
              </>
            )}
          </dl>

          <div className="mt-5">
            <p className="text-xs text-muted-foreground">Delivery methods</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {product.deliveryMethods.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  {PLACEHOLDER}
                </span>
              ) : (
                product.deliveryMethods.map((method) => (
                  <span
                    key={method}
                    className="rounded border border-border px-2 py-0.5 text-xs"
                  >
                    {method}
                  </span>
                ))
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <SeatTab
            countLabel="Licences"
            count={product.userCount}
            monthlyCost={product.monthlyCost}
            seats={seats}
            payload={payload}
            baseCurrency={baseCurrency}
            dateFormat={dateFormat}
            emptyLabel="Nobody holds this product in scope."
          />
        </TabsContent>

        <TabsContent value="inactive">
          <SeatTab
            countLabel="Inactive licences"
            count={product.inactiveCount}
            monthlyCost={product.inactiveMonthlyCost}
            seats={inactive}
            payload={payload}
            baseCurrency={baseCurrency}
            dateFormat={dateFormat}
            emptyLabel="No underutilized seats here."
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Field({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words">
        {value === null ? (
          <span className="text-muted-foreground">{PLACEHOLDER}</span>
        ) : href ? (
          <Link
            href={href}
            className="font-medium inline-flex items-center gap-1 hover:underline"
          >
            <span>{value}</span>
            <span aria-hidden>&rarr;</span>
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function SeatTab({
  countLabel,
  count,
  monthlyCost,
  seats,
  payload,
  baseCurrency,
  dateFormat,
  emptyLabel,
}: {
  countLabel: string;
  count: number;
  monthlyCost: number;
  seats: AssignmentSeat[];
  payload: AssignmentsPayload;
  baseCurrency: string;
  dateFormat: string;
  emptyLabel: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <>
      <div className="flex gap-10 border-b border-border px-5 py-4">
        <Stat label={countLabel} value={count.toLocaleString()} />
        <Stat
          label="Monthly cost"
          value={formatCurrency(monthlyCost, baseCurrency, true)}
        />
      </div>

      {seats.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <Table stickyHeader scrollClassName={null}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 pl-3 pr-2" />
              <TableHead>User</TableHead>
              <TableHead>Identifier</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-5 text-right">Monthly</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {seats.map((seat) => {
              const holder =
                seat.orgEmployeeId === null
                  ? undefined
                  : payload.users[seat.orgEmployeeId];
              const unitName =
                holder && holder.orgUnitId !== null
                  ? payload.nodes[holder.orgUnitId]?.name
                  : undefined;
              const open = expanded === seat.id;
              const toggle = () => setExpanded(open ? null : seat.id);
              return (
                <Fragment key={seat.id}>
                  <TableRow
                    className={
                      hasSeatDetail(seat) ? 'cursor-pointer' : undefined
                    }
                    onClick={hasSeatDetail(seat) ? toggle : undefined}
                  >
                    <SeatExpanderCell
                      seat={seat}
                      open={open}
                      onToggle={toggle}
                    />
                    <TableCell>
                      <span className="font-medium block">
                        {seat.holderName}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {unitName ?? PLACEHOLDER}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {PLACEHOLDER}
                    </TableCell>
                    <TableCell>
                      {seat.assignedDate
                        ? formatDate(seat.assignedDate, dateFormat)
                        : PLACEHOLDER}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {PLACEHOLDER}
                    </TableCell>
                    <TableCell>
                      <SeatStatusBadge reasons={seat.inactiveReasons} />
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      {formatCurrency(seat.monthlyCost, baseCurrency, true)}
                    </TableCell>
                  </TableRow>
                  {open && (
                    <SeatDetailRow
                      seat={seat}
                      colSpan={7}
                      baseCurrency={baseCurrency}
                    />
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-2xl leading-none">{value}</p>
    </div>
  );
}
