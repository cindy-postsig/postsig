'use client';

import type { ColumnSpec } from '@/components/contracts/columnLayout';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import CustomCalendar from '@/app/ui/calendar/calendar';
import { CalendarTabsClient } from './CalendarTabsClient';
import { useCalendar } from '@/hooks/api/useCalendar';
import {
  buildCalendarEvents,
  buildContractTableRows,
} from '@/lib/v2/calendar/transforms';
import { filterByDateRange } from '@/lib/v2/core/filters';
import { ContractWithPricing } from '@/lib/v2/core/types';
import { UserMetadata } from '@/constants/types';

interface CalendarClientProps {
  initialData: ContractWithPricing[];
  fiscalYearStartMonth: number;
  initialView: 'month' | 'quarter' | 'year';
  columns: readonly ColumnSpec[];
  userMetadata: UserMetadata;
  /** contractId -> cancelled product ids (PSK-1830); plain record over RSC. */
  removedProductsByContract?: Record<string, number[]>;
}

export function CalendarClient({
  initialData,
  fiscalYearStartMonth,
  initialView,
  columns,
  userMetadata,
  removedProductsByContract,
}: CalendarClientProps) {
  const searchParams = useSearchParams();
  const view = (searchParams.get('view') || initialView) as
    | 'month'
    | 'quarter'
    | 'year';
  const start = searchParams.get('start') || '';
  const end = searchParams.get('end') || '';
  const sort = searchParams.get('sort') || undefined;
  const order = (searchParams.get('order') || 'asc') as 'asc' | 'desc';

  // Use hook with SWR pattern - initialData for instant render, background refresh
  const { data } = useCalendar(undefined, initialData);
  const events = data?.events || initialData;

  // Transform V2 events to calendar format first (so filtering works)
  const allCalendarEvents = useMemo(() => {
    const removedMap = new Map(
      Object.entries(removedProductsByContract ?? {}).map(([id, ids]) => [
        Number(id),
        new Set(ids),
      ]),
    );
    return buildCalendarEvents(events, removedMap);
  }, [events, removedProductsByContract]);

  // Filter contracts based on current URL params
  const calendarEvents = useMemo(() => {
    if (!start || !end) {
      return allCalendarEvents;
    }
    const { uniqueData } = filterByDateRange(allCalendarEvents, start, end);
    return uniqueData;
  }, [allCalendarEvents, start, end]);

  // Transform to processed contracts for table tabs
  const processedContracts = useMemo(
    () => buildContractTableRows(events),
    [events],
  );

  // Filter processed contracts based on current date range for tabs
  const { startDateContracts, endDateContracts, cancelDateContracts } =
    useMemo(() => {
      if (!start || !end) {
        return {
          startDateContracts: [],
          endDateContracts: [],
          cancelDateContracts: [],
        };
      }

      const startDate = new Date(start);
      const endDate = new Date(end);

      const isDateInRange = (dateStr: string | null | undefined) => {
        if (!dateStr) return false;
        const date = new Date(dateStr);
        return date >= startDate && date <= endDate;
      };

      return {
        startDateContracts: processedContracts.filter((contract) =>
          isDateInRange(contract.termStartDate),
        ),
        endDateContracts: processedContracts.filter((contract) =>
          isDateInRange(contract.termEndDate),
        ),
        cancelDateContracts: processedContracts.filter((contract) =>
          isDateInRange(contract.cancelByDate),
        ),
      };
    }, [processedContracts, start, end]);

  return (
    <div>
      <div className="flex flex-row">
        <CustomCalendar
          events={calendarEvents}
          fiscalYearStartMonth={fiscalYearStartMonth}
          initialView={initialView}
        />
      </div>
      <CalendarTabsClient
        startDateContracts={startDateContracts}
        endDateContracts={endDateContracts}
        cancelDateContracts={cancelDateContracts}
        columns={columns}
        sort={sort}
        order={order}
        view={view}
        userMetadata={userMetadata}
      />
    </div>
  );
}
