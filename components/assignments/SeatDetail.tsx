'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/app/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SID_ENTITLEMENTS_PRODUCT_NAME } from '@/lib/v2/bloomberg-sid/keys';
import type { AssignmentSeat } from '@/lib/v2/assignments/types';

// The seat tables' expander, on the pattern of the Bloomberg inventory view's
// Assignments tab: a chevron column, and an open row whose detail lists the
// terminal and each exchange it is permissioned on with its share of the
// month. Only a terminal with entitlements has anything to open.

export const hasSeatDetail = (seat: AssignmentSeat): boolean =>
  seat.entitlements !== undefined;

export function SeatExpanderCell({
  seat,
  open,
  onToggle,
}: {
  seat: AssignmentSeat;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <TableCell className="w-8 px-2">
      {hasSeatDetail(seat) && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} details for ${seat.productName}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          {open ? <ChevronDown /> : <ChevronRight />}
        </Button>
      )}
    </TableCell>
  );
}

export function SeatDetailRow({
  seat,
  colSpan,
  baseCurrency,
}: {
  seat: AssignmentSeat;
  colSpan: number;
  baseCurrency: string;
}) {
  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={colSpan} className="px-6 py-4">
        <SeatDetail seat={seat} baseCurrency={baseCurrency} />
      </TableCell>
    </TableRow>
  );
}

function SeatDetail({
  seat,
  baseCurrency,
}: {
  seat: AssignmentSeat;
  baseCurrency: string;
}) {
  const entitlements = seat.entitlements;
  if (!entitlements) return null;
  const money = (value: number) => formatCurrency(value, baseCurrency, true);

  return (
    <>
      <h4 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
        {seat.productName} — {entitlements.exchanges.length}{' '}
        {entitlements.exchanges.length === 1
          ? 'exchange entitlement'
          : SID_ENTITLEMENTS_PRODUCT_NAME.toLowerCase()}
      </h4>
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead className="px-2 py-1">Type</TableHead>
            <TableHead className="px-2 py-1">Code</TableHead>
            <TableHead className="px-2 py-1">Subscription</TableHead>
            <TableHead className="px-2 py-1 text-right">Monthly</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="px-2 py-1">Terminal</TableCell>
            <TableCell className="px-2 py-1 font-mono">
              {seat.productId}
            </TableCell>
            <TableCell className="px-2 py-1">{seat.productName}</TableCell>
            <TableCell className="px-2 py-1 text-right font-mono">
              {money(seat.monthlyCost - entitlements.monthlyCost)}
            </TableCell>
          </TableRow>
          {entitlements.exchanges.map((exchange) => (
            <TableRow key={exchange.code}>
              <TableCell className="px-2 py-1">Exchange</TableCell>
              <TableCell className="px-2 py-1 font-mono">
                {exchange.code}
              </TableCell>
              <TableCell className="px-2 py-1">{exchange.name}</TableCell>
              <TableCell className="px-2 py-1 text-right font-mono">
                {money(exchange.monthlyCost)}
              </TableCell>
            </TableRow>
          ))}
          {entitlements.exchanges.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={4}
                className="px-2 py-1 text-muted-foreground"
              >
                No exchange permissions on this seat.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </>
  );
}
