'use client';

import * as React from 'react';
import type { UIMessage } from '@ai-sdk/react';
import { parseISO, format } from 'date-fns';
import Link from 'next/link';
import VendorIcon from '@/components/vendors/VendorIcon';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';

// Mirrors the get_vendor MCP tool output (app/lib/mcp/tools/vendors.ts).
// Kept local so the renderer isn't coupled to server types — the tool's shape
// is the contract.
export interface VendorOverviewData {
  found?: boolean;
  vendor: {
    id: number | string;
    name: string;
    domain?: string | null;
    ictProvider?: boolean | null;
    assetClasses?: string[];
  };
  metrics: {
    totalVendorContractValueBase: number;
    relationshipStartDate: string | null;
    projectedEndDate: string | null;
    relationshipLength: string | null;
    contractCount: number;
  };
  contracts: Array<{
    id: number;
    products?: string[];
    status?: string | null;
    currentAnnualSpendBase?: number;
    isSuperseded?: boolean;
    isLinkedChildInvoice?: boolean;
  }>;
}

// Grounded hero extractor: the model calls get_vendor for an overview; we
// render its structured output as a fixed card at the top of the message
// rather than letting the model hand-assemble it as a stat-grid/table. The
// tool part already persists via metadata.toolParts, so this survives reload
// for free. Co-located with the component so the data contract lives in one
// place. Skips not-found / error results (which lack vendor + metrics).
export function getVendorOverviewData(
  parts: UIMessage['parts'],
): VendorOverviewData[] {
  const out: VendorOverviewData[] = [];
  for (const part of parts) {
    if (part.type !== 'tool-get_vendor') continue;
    const tp = part as { state?: string; output?: unknown };
    if (tp.state !== 'output-available') continue;
    const output = tp.output;
    if (
      output &&
      typeof output === 'object' &&
      'vendor' in output &&
      'metrics' in output
    ) {
      out.push(output as VendorOverviewData);
    }
  }
  return out;
}

function formatCompactCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMonthYear(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return format(parseISO(iso), 'MMM yyyy');
  } catch {
    return iso;
  }
}

// Status → count-badge color. Unknown statuses fall back to muted.
const STATUS_TONE: Record<string, string> = {
  active:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  unconfirmed:
    'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  draft: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  expired: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  inactive: 'bg-muted text-muted-foreground',
};

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className={cn(
        'flex h-full flex-col justify-between gap-1 rounded border border-border/30 p-2.5',
        'bg-gradient-to-tr from-gray-700/5 from-20% to-gray-700/15',
        'dark:from-accent dark:to-secondary',
      )}
    >
      <div className="font-sans text-[0.7rem] leading-tight text-foreground/80">
        {label}
      </div>
      <div className="font-sans-neue text-lg leading-tight">{value}</div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border/60 bg-card/40 p-3">
      <div className="font-medium mb-2 text-xs text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

const PRODUCT_LIMIT = 12;

export function VendorOverview({ data }: { data: VendorOverviewData }) {
  const { baseCurrency } = useBaseCurrency();
  const { vendor, metrics, contracts } = data;

  const annualSpend = contracts
    .filter((c) => !c.isSuperseded && !c.isLinkedChildInvoice)
    .reduce((sum, c) => sum + (c.currentAnnualSpendBase ?? 0), 0);

  const hasActive = contracts.some(
    (c) => (c.status ?? '').toLowerCase() === 'active',
  );

  const assetClasses = vendor.assetClasses ?? [];

  // Fallback for the left panel when a vendor has no asset classes: a status
  // breakdown is grounded and effectively always present (every vendor has
  // contracts), so the slot never renders as an empty hole.
  const statusCounts = new Map<string, number>();
  for (const c of contracts) {
    const key = (c.status ?? 'unknown').toLowerCase();
    statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
  }
  const statusRows = Array.from(statusCounts.entries()).sort(
    ([, a], [, b]) => b - a,
  );

  const products = Array.from(
    new Set(contracts.flatMap((c) => c.products ?? [])),
  );
  const shownProducts = products.slice(0, PRODUCT_LIMIT);
  const extraProducts = products.length - shownProducts.length;

  const subtitleParts = [
    vendor.domain,
    vendor.ictProvider ? 'ICT provider' : null,
  ].filter(Boolean);

  const since = formatMonthYear(metrics.relationshipStartDate);
  const through = formatMonthYear(metrics.projectedEndDate);

  // not-prose: this hero renders inside the message's prose container, whose
  // typography styles otherwise inject margins (e.g. on the vendor logo <img>).
  return (
    <div className="not-prose my-3 space-y-4">
      {/* Header lockup */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <VendorIcon
            name={vendor.name}
            domain={vendor.domain ?? ''}
            height={48}
            width={48}
          />
          <div className="min-w-0">
            <Link
              href={`/vendors/${vendor.id}`}
              className="font-medium block truncate font-sans text-xl leading-tight no-underline hover:text-primary"
            >
              {vendor.name}
            </Link>
            {subtitleParts.length > 0 && (
              <div className="truncate text-sm text-muted-foreground">
                {subtitleParts.join(' · ')}
              </div>
            )}
          </div>
        </div>
        {hasActive && (
          <Badge variant="default" size="sm" className="shrink-0">
            Active
          </Badge>
        )}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile
          label="Annual Spend"
          value={formatCompactCurrency(annualSpend, baseCurrency)}
        />
        <Tile
          label="Total Contract Value"
          value={formatCompactCurrency(
            metrics.totalVendorContractValueBase,
            baseCurrency,
          )}
        />
        <Tile label="Contracts" value={String(metrics.contractCount)} />
        {metrics.relationshipLength && (
          <Tile label="Relationship" value={metrics.relationshipLength} />
        )}
      </div>

      {/* Contract Status + Timeline */}
      {(statusRows.length > 0 || since || through) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {statusRows.length > 0 && (
            <Panel title="Contract Status">
              <div className="space-y-1.5">
                {statusRows.map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{titleCase(status)}</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs tabular-nums',
                        STATUS_TONE[status] ?? 'bg-muted text-muted-foreground',
                      )}
                    >
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {(since || through) && (
            <Panel title="Timeline">
              <div className="space-y-1.5 text-sm">
                {since && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Since</span>
                    <span className="tabular-nums">{since}</span>
                  </div>
                )}
                {through && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Through</span>
                    <span className="tabular-nums">{through}</span>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* Products */}
      {shownProducts.length > 0 && (
        <Panel title="Products">
          <div className="flex flex-wrap gap-1.5">
            {shownProducts.map((p) => (
              <Badge key={p} variant="secondary" size="sm">
                {p}
              </Badge>
            ))}
            {extraProducts > 0 && (
              <Badge variant="secondary" size="sm">
                +{extraProducts} more
              </Badge>
            )}
          </div>
        </Panel>
      )}

      {/* Asset Classes (full width, below Products) */}
      {assetClasses.length > 0 && (
        <Panel title="Asset Classes">
          <div className="flex flex-wrap gap-1.5">
            {assetClasses.map((ac) => (
              <Badge key={ac} variant="secondary" size="sm">
                {ac}
              </Badge>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
