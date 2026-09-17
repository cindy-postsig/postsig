'use client';

import { Field, usd } from '@/components/bloomberg-sid/bits';
import { SeatStatusBadge } from '@/components/seats/SeatStatusBadge';
import { Badge } from '@/components/ui/badge';
import { useDateFormat } from '@/hooks/useDateFormat';
import type {
  SidAccount,
  SidHrConfidence,
  SidHrMatch,
  SidSubscription,
} from '@/lib/v2/bloomberg-sid/report';
import {
  cancelByDate,
  type SidAllocation,
} from '@/lib/v2/bloomberg-sid/transforms';
import type { SeatInactiveReason } from '@/lib/v2/seats/status';

const CONFIDENCE_VARIANT: Record<
  SidHrConfidence,
  'secondary' | 'outline' | 'destructive'
> = {
  'Exact name': 'secondary',
  'Fuzzy name': 'outline',
  'Missing HR match': 'destructive',
};

export function SubscriptionDrawer({
  sub,
  account,
  allocs,
  hrMatch,
  reasons,
}: {
  sub: SidSubscription;
  account: SidAccount | undefined;
  allocs: SidAllocation[];
  hrMatch: SidHrMatch | undefined;
  reasons: readonly SeatInactiveReason[];
}) {
  const { formatDate } = useDateFormat();
  const employee = hrMatch?.employee ?? null;

  return (
    <div className="grid grid-cols-3 gap-4 text-sm">
      <div>
        <h4 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          Terminal subscription
        </h4>
        <dl className="grid grid-cols-2 gap-y-1">
          <Field label="SID" value={`${sub.sid} / ${sub.sidInstNum}`} />
          <Field label="SN/UUID" value={sub.serialNumber} />
          <Field label="Product" value={sub.gpttDescription} />
          <Field label="Contract" value={formatDate(sub.contractDate)} />
          <Field
            label="Cancel By"
            value={formatDate(cancelByDate(sub.renewalDate))}
          />
          <Field label="Renewal Date" value={formatDate(sub.renewalDate)} />
          <Field label="Auto" value={account ? String(account.auto) : '—'} />
          <Field label="Term" value={account ? String(account.term) : '—'} />
          <Field label="Price" value={usd(sub.price)} />
          <Field label="PO" value={sub.poNumber ?? '—'} />
        </dl>
      </div>
      <div>
        <h4 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          HR match
        </h4>
        <dl className="grid grid-cols-1 gap-y-1">
          <Field label="Last User" value={sub.lastUser} />
          <Field
            label="Confidence"
            value={
              hrMatch ? (
                <Badge
                  variant={CONFIDENCE_VARIANT[hrMatch.confidence]}
                  size="sm"
                >
                  {hrMatch.confidence}
                </Badge>
              ) : (
                '—'
              )
            }
          />
          <Field label="HR Employee" value={employee?.fullName ?? '—'} />
          <Field label="Department" value={employee?.department ?? '—'} />
          <Field label="Cost Center" value={employee?.costCenter ?? '—'} />
          <Field label="Status" value={<SeatStatusBadge reasons={reasons} />} />
        </dl>
      </div>
      <div>
        <h4 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          Exchange allocations ({allocs.length})
        </h4>
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {allocs.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No exchange allocations for this SID.
            </p>
          )}
          {allocs.slice(0, 10).map((alloc) => (
            <div
              key={`${alloc.feeId}:${alloc.exchangeCode}`}
              className="flex justify-between text-xs"
            >
              <span className="font-mono">{alloc.exchangeCode}</span>
              <span>
                {alloc.priceMasked || alloc.proRate == null ? (
                  <span className="text-amber-700">***</span>
                ) : (
                  usd(alloc.proRate)
                )}
              </span>
            </div>
          ))}
          {allocs.length > 10 && (
            <div className="text-[11px] text-muted-foreground">
              +{allocs.length - 10} more
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
