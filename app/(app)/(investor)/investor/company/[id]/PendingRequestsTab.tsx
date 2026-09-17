'use client';

import { BarChart3, FileText } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { requestProgressPercent } from '@/lib/v2/kpis/transforms';
import { TableShell } from '@/app/(app)/(investor)/investor/components/TableShell';
import { useDateFormat } from '@/hooks/useDateFormat';
import { ReportStatusBadge, SubTabEmpty } from './companyDetailsPrimitives';
import type { PendingRequest } from '@/lib/v2/kpis/types';

const requestTypeConfig = {
  kpi: {
    label: 'KPI report',
    icon: BarChart3,
    noun: 'metric',
    badgeClass: 'bg-slate-600 text-white dark:bg-slate-500',
  },
  reporting_pack: {
    label: 'Reporting pack',
    icon: FileText,
    noun: 'document',
    badgeClass: 'bg-stone-500 text-white dark:bg-stone-400 dark:text-stone-950',
  },
} as const;

export function PendingRequestsTab({
  pendingRequests,
  onView,
}: {
  pendingRequests: PendingRequest[];
  onView: (req: PendingRequest) => void;
}) {
  const { formatDate } = useDateFormat();

  if (pendingRequests.length === 0) {
    return (
      <SubTabEmpty>
        No pending requests. Use Request to ask this company for KPIs or a
        reporting pack.
      </SubTabEmpty>
    );
  }

  return (
    <TableShell>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Period</TableHead>
          <TableHead>Items</TableHead>
          <TableHead>Recipient</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead>Progress</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pendingRequests.map((req) => {
          const type = requestTypeConfig[req.requestType];
          const TypeIcon = type.icon;
          const percent = requestProgressPercent(
            req.filledCount,
            req.itemCount,
          );
          return (
            <TableRow
              key={req.publicId}
              role="button"
              tabIndex={0}
              className="cursor-pointer"
              onClick={() => onView(req)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onView(req);
                }
              }}
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-md [&_svg]:size-3.5',
                      type.badgeClass,
                    )}
                  >
                    <TypeIcon />
                  </span>
                  <span className="text-sm">{type.label}</span>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                {req.periodLabel}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                {req.itemCount}{' '}
                {req.itemCount === 1 ? type.noun : `${type.noun}s`}
              </TableCell>
              <TableCell className="max-w-[16rem] truncate text-sm">
                {req.recipientEmail}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {formatDate(req.sentAt, '–')}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {req.filledCount > 0 ? (
                  <div className="flex items-center gap-2">
                    <Progress value={percent} className="h-1.5 w-20" />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {percent}%
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">–</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <ReportStatusBadge
                  hasData={req.filledCount > 0}
                  submittedAt={null}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </TableShell>
  );
}
