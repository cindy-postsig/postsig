'use client';

import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { useMemo } from 'react';
import {
  describeKpiEvent,
  describeRequestRecipients,
  formatEditScalar,
  formatEventDate,
  formatEventPeriod,
  isKpiValueEditedEvent,
  isRequestSentEvent,
  kpiEditPhrase,
} from '@/lib/v2/kpis/transforms';
import { TableShell } from '@/app/(app)/(investor)/investor/components/TableShell';
import { useDateFormat } from '@/hooks/useDateFormat';
import { SubTabEmpty } from './companyDetailsPrimitives';
import type {
  KpiDefinition,
  KpiEvent,
  KpiValueEditedPayload,
  KpiValueType,
  RequestSentPayload,
} from '@/lib/v2/kpis/types';

function RequestSentDescription({ payload }: { payload: RequestSentPayload }) {
  const { kind, primary, overflowCount, all } =
    describeRequestRecipients(payload);

  if (!primary) return <>{kind} sent</>;

  return (
    <span>
      {kind} sent to {primary}
      {overflowCount > 0 && (
        <>
          {' '}
          <HoverCard openDelay={150}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                className="bg-transparent p-0 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                +{overflowCount} more
              </button>
            </HoverCardTrigger>
            <HoverCardContent
              side="top"
              align="start"
              className="w-auto min-w-40 p-3"
            >
              <p className="font-medium mb-1.5 text-xs">Recipients</p>
              <div className="space-y-1">
                {all.map((email) => (
                  <div key={email} className="text-xs">
                    {email}
                  </div>
                ))}
              </div>
            </HoverCardContent>
          </HoverCard>
        </>
      )}
    </span>
  );
}

function ValueEditedDescription({
  payload,
  valueType,
}: {
  payload: KpiValueEditedPayload;
  valueType: KpiValueType | undefined;
}) {
  const { subject, action } = kpiEditPhrase(payload);
  if (action === 'set') {
    return (
      <span>
        {subject} set to
        <span className="ml-1.5 whitespace-nowrap font-sans-neue text-xs tabular-nums text-muted-foreground">
          {formatEditScalar(payload.newValue, valueType)}
        </span>
      </span>
    );
  }
  return (
    <span>
      {subject} updated
      <span className="ml-1.5 whitespace-nowrap font-sans-neue text-xs tabular-nums text-muted-foreground">
        <span className="line-through">
          {formatEditScalar(payload.previousValue, valueType)}
        </span>
        {' → '}
        {formatEditScalar(payload.newValue, valueType)}
      </span>
    </span>
  );
}

export function KpiUpdatesTab({
  kpiEvents,
  kpiCatalog,
}: {
  kpiEvents: KpiEvent[];
  kpiCatalog: KpiDefinition[];
}) {
  const { dateFormat } = useDateFormat();
  const valueTypeByKpiId = useMemo(
    () => new Map(kpiCatalog.map((def) => [def.id, def.valueType])),
    [kpiCatalog],
  );

  if (kpiEvents.length === 0) {
    return (
      <SubTabEmpty>
        No updates yet. Requests, reminders, submissions, and edits will appear
        here.
      </SubTabEmpty>
    );
  }

  return (
    <TableShell>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>User</TableHead>
          <TableHead>Event</TableHead>
          <TableHead>Period</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {kpiEvents.map((event) => (
          <TableRow key={event.id}>
            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
              {formatEventDate(event.createdAt, dateFormat)}
            </TableCell>
            <TableCell className="max-w-[16rem] truncate text-sm">
              {event.actorName ?? (
                <span className="text-muted-foreground">–</span>
              )}
            </TableCell>
            <TableCell className="text-sm">
              {isRequestSentEvent(event) ? (
                <RequestSentDescription payload={event.payload} />
              ) : isKpiValueEditedEvent(event) ? (
                <ValueEditedDescription
                  payload={event.payload}
                  valueType={valueTypeByKpiId.get(event.payload.kpiId)}
                />
              ) : (
                describeKpiEvent(event)
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap text-sm">
              {isKpiValueEditedEvent(event)
                ? formatEventPeriod(
                    event.payload.periodYear,
                    event.payload.periodQuarter,
                    event.payload.periodMonth,
                  )
                : formatEventPeriod(
                    event.payload.periodYear,
                    event.payload.periodQuarter,
                  )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </TableShell>
  );
}
