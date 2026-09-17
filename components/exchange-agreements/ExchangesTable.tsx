import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  changeColorClass,
  formatFeeChange,
} from '@/lib/exchange-agreement/format';
import type { ExchangeSummary } from '@/lib/exchange-agreement/types';

interface Props {
  exchanges: ExchangeSummary[];
}

export default function ExchangesTable({ exchanges }: Props) {
  return (
    <Table stickyHeader scrollClassName="rounded-md border">
      <TableHeader>
        <TableRow>
          <TableHead>Exchange</TableHead>
          <TableHead>Last Pricing Update</TableHead>
          <TableHead>Annual Impact</TableHead>
          <TableHead className="w-[220px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {exchanges.map((exchange) => {
          const hasData = exchange.productLineCount > 0;
          return (
            <TableRow key={exchange.code}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-3">
                  <span className="font-bold flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-200 text-sm text-blue-900">
                    {exchange.name.charAt(0).toUpperCase()}
                  </span>
                  {exchange.name}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {exchange.lastPricingUpdateLabel ?? '—'}
              </TableCell>
              <TableCell
                className={`whitespace-nowrap ${changeColorClass(exchange.annualImpact)}`}
              >
                {exchange.annualImpact != null
                  ? formatFeeChange(exchange.annualImpact, exchange.currency)
                  : '—'}
              </TableCell>
              <TableCell className="text-right">
                {hasData ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`/exchange-agreements/product-lines?exchange=${encodeURIComponent(
                        exchange.code,
                      )}`}
                    >
                      Explore {exchange.productLineCount} Product Lines
                    </Link>
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground">No data</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
