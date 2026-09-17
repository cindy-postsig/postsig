import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatCurrencyFull } from '@/app/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import type { InvoiceValidation } from '@/lib/v2/invoices/validation';
import { discrepancyColor } from '@/lib/v2/invoices/folders';

// Only the tile's accent (border/background) and an invalid subtitle read as
// red/green — the title itself stays plain foreground text so a whole row of
// colored bold labels doesn't compete with the actual discrepancy values.
// `valid: 'neutral'` is neither — there's no parent to compare against, so
// the tile says nothing about a match or a mismatch, just muted styling.
function Tile({
  valid,
  title,
  subtitle,
}: {
  valid: boolean | 'neutral';
  title: string;
  subtitle?: React.ReactNode;
}) {
  const accent =
    valid === 'neutral' ? undefined : valid ? '#00A86B' : '#CC003F';
  return (
    <div
      className={cn(
        'rounded-md border px-4 py-3',
        accent === undefined && 'border-border bg-muted/30',
      )}
      style={
        accent
          ? { borderColor: accent, backgroundColor: `${accent}14` }
          : undefined
      }
    >
      <div className="font-medium text-sm text-foreground">{title}</div>
      {subtitle && (
        <div
          className={cn(
            'mt-0.5 text-xs',
            valid !== false && 'text-muted-foreground',
          )}
          style={valid === false ? { color: accent } : undefined}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

function formatDiscrepancy(
  amount: number,
  percent: number,
  currency: string,
): string {
  const sign = amount >= 0 ? '+' : '';
  return `${sign}${formatCurrencyFull(amount, currency)} (${sign}${percent.toFixed(2)}%)`;
}

const NO_DATA_SUBTITLE = 'No data available to compare';

/**
 * The three comparison tiles (amount, frequency, products) all reduce to the
 * same shape: neutral with no Service Order to compare against, otherwise a
 * plain match/mismatch. Pulled out so that "no data" case isn't spelled out
 * three times.
 */
function comparisonTile({
  noComparisonData,
  matched,
  neutralTitle,
  matchTitle,
  mismatchTitle,
  matchSubtitle,
  mismatchSubtitle,
}: {
  noComparisonData: boolean;
  matched: boolean;
  neutralTitle: string;
  matchTitle: string;
  mismatchTitle: string;
  matchSubtitle?: React.ReactNode;
  mismatchSubtitle?: React.ReactNode;
}): { valid: boolean | 'neutral'; title: string; subtitle?: React.ReactNode } {
  if (noComparisonData) {
    return {
      valid: 'neutral',
      title: neutralTitle,
      subtitle: NO_DATA_SUBTITLE,
    };
  }
  return {
    valid: matched,
    title: matched ? matchTitle : mismatchTitle,
    subtitle: matched ? matchSubtitle : mismatchSubtitle,
  };
}

export default function InvoiceValidationSummary({
  validation,
  currency,
}: {
  validation: InvoiceValidation;
  currency: string;
}) {
  const {
    discrepancyCount,
    amountMatch,
    amountDifference,
    amountDifferencePercent,
    expectedAmount,
    invoiceAmount,
    frequencyMatch,
    parentBillingFrequency,
    invoiceBillingFrequency,
    serviceOrderAvailable,
    serviceOrderLabel,
    serviceOrderId,
    productsMatch,
    matchedProducts,
  } = validation;

  const mismatchedProducts = (matchedProducts ?? []).filter(
    (product) => product.discrepancy !== 0,
  );
  // With no Service Order to reconcile against, amount/frequency/products
  // aren't "matching" — there's simply nothing to compare them to.
  const noComparisonData = !serviceOrderAvailable;
  // A missing service order counts toward discrepancyCount but has no
  // parent-vs-invoice values to compare, so it has no row of its own here —
  // the red tile above is its only surface. Only show the table when some
  // other discrepancy actually has values to compare.
  const hasTableRows =
    !amountMatch || !frequencyMatch || mismatchedProducts.length > 0;
  // discrepancyCount is aggregate-level (net amountMatch), so it misses the
  // case where individual products mismatch in offsetting directions and net
  // to zero — bump it by one so the badge/table don't hide a real per-product
  // discrepancy just because the total happens to cancel out.
  const displayDiscrepancyCount =
    discrepancyCount + (amountMatch && mismatchedProducts.length > 0 ? 1 : 0);

  return (
    <Card>
      <CardHeader className="pb-4 pt-5">
        <CardTitle className="font-bold font-label text-xs uppercase tracking-wide text-muted-foreground">
          Invoice Validation Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Tile
            {...comparisonTile({
              noComparisonData,
              matched: amountMatch,
              neutralTitle: 'Invoice Amount',
              matchTitle: 'Invoice Amount Match',
              mismatchTitle: 'Invoice Amount Mismatch',
              matchSubtitle:
                invoiceAmount > 0
                  ? formatCurrencyFull(invoiceAmount, currency)
                  : undefined,
              // The tile's box (border/background) stays red for any
              // mismatch — only the number itself flips green when the
              // invoice actually billed less than expected.
              mismatchSubtitle: (
                <span style={{ color: discrepancyColor(amountDifference) }}>
                  {formatDiscrepancy(
                    amountDifference,
                    amountDifferencePercent,
                    currency,
                  )}
                </span>
              ),
            })}
          />
          <Tile
            {...comparisonTile({
              noComparisonData,
              matched: frequencyMatch,
              neutralTitle: 'Frequency',
              matchTitle: 'Frequency Match',
              mismatchTitle: 'Frequency Mismatch',
              mismatchSubtitle: `${invoiceBillingFrequency} instead of ${parentBillingFrequency}`,
            })}
          />
          <Tile
            valid={serviceOrderAvailable}
            title={
              serviceOrderAvailable
                ? 'Service Order Available'
                : 'Service Order Not Found'
            }
            subtitle={
              serviceOrderAvailable && serviceOrderId ? (
                <Link
                  href={`/contracts/${serviceOrderId}`}
                  className="underline underline-offset-2 hover:no-underline"
                >
                  {serviceOrderLabel || `Contract #${serviceOrderId}`}
                </Link>
              ) : undefined
            }
          />
          <Tile
            {...comparisonTile({
              noComparisonData,
              matched: productsMatch,
              neutralTitle: 'Product Consistency',
              matchTitle: 'No Unexpected Products',
              mismatchTitle: 'Unexpected Products',
            })}
          />
        </div>

        {displayDiscrepancyCount > 0 && (
          <>
            <div
              className="font-medium inline-block rounded-md px-3 py-1 text-xs"
              style={{
                backgroundColor: '#CC003F1a',
                color: '#CC003F',
              }}
            >
              {displayDiscrepancyCount}{' '}
              {displayDiscrepancyCount === 1 ? 'Discrepancy' : 'Discrepancies'}
            </div>

            {hasTableRows && (
              <Table stickyHeader>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Validation</TableHead>
                    <TableHead>Parent Contract</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Discrepancy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!amountMatch && (
                    <TableRow>
                      <TableCell className="font-medium">
                        Invoice Amount
                      </TableCell>
                      <TableCell>
                        {formatCurrencyFull(expectedAmount, currency)}
                      </TableCell>
                      <TableCell>
                        {formatCurrencyFull(invoiceAmount, currency)}
                      </TableCell>
                      <TableCell
                        className="font-medium"
                        style={{ color: discrepancyColor(amountDifference) }}
                      >
                        {formatDiscrepancy(
                          amountDifference,
                          amountDifferencePercent,
                          currency,
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                  {mismatchedProducts.length > 0 && (
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell
                        colSpan={4}
                        className="text-xs text-muted-foreground"
                      >
                        Price Per Unit
                      </TableCell>
                    </TableRow>
                  )}
                  {mismatchedProducts.map((product) => (
                    <TableRow
                      key={product.id}
                      className="bg-muted/40 hover:bg-muted/40"
                    >
                      <TableCell className="pl-6 text-muted-foreground">
                        {product.product_name}
                      </TableCell>
                      <TableCell>
                        {formatCurrencyFull(
                          product.adjustedParentAmount,
                          currency,
                        )}
                      </TableCell>
                      <TableCell>
                        {formatCurrencyFull(
                          product.adjustedInvoiceAmount,
                          currency,
                        )}
                      </TableCell>
                      <TableCell
                        style={{
                          color: discrepancyColor(product.discrepancy),
                        }}
                      >
                        {formatDiscrepancy(
                          product.discrepancy,
                          product.difference,
                          currency,
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!frequencyMatch && (
                    <TableRow>
                      <TableCell className="font-medium">Frequency</TableCell>
                      <TableCell>{parentBillingFrequency}</TableCell>
                      <TableCell>{invoiceBillingFrequency}</TableCell>
                      <TableCell style={{ color: '#CC003F' }}>
                        Mismatch
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
