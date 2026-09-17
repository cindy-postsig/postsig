'use client';
import React, { useState, useCallback, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  addYears,
  subYears,
  isSameMonth,
  parseISO,
  startOfWeek,
  isSameDay,
} from 'date-fns';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  dateFieldMap,
  dateTypeColorMap,
  EventType,
  eventTypeDescriptions,
} from '@/app/lib/constants';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { useDateFormat } from '@/hooks/useDateFormat';

interface EventData {
  id: number;
  vendors: {
    name: string;
  };
  vendor_id: number | null;
  vendor_name: string;
  vendor_products_details: any[];
  term_start_date: any[];
  term_end_date: any[];
  cancel_date: any[];
  status: string;
  status_id: number;
  contract_status: number;
  renewal_type: string;
  renewed: boolean;
  products: any[];
  priceHistory: any;
  [key: string]: any;
}

interface CalendarProps {
  events?: EventData[];
  fiscalYearStartMonth: number;
  initialView: 'month' | 'quarter' | 'year';
  mini?: boolean;
}

const CustomCalendar: React.FC<CalendarProps> = ({
  events = [],
  fiscalYearStartMonth,
  initialView = 'quarter',
  mini = false,
}) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { dateFormat } = useDateFormat();

  const today = new Date();

  const getFiscalYearStart = useCallback(
    (date: Date): Date => {
      const year = date.getFullYear();
      const month = date.getMonth();
      if (month >= fiscalYearStartMonth - 1) {
        return new Date(year, fiscalYearStartMonth - 1, 1);
      } else {
        return new Date(year - 1, fiscalYearStartMonth - 1, 1);
      }
    },
    [fiscalYearStartMonth],
  );

  const getFiscalYearEnd = useCallback(
    (date: Date): Date => {
      const fiscalYearStart = getFiscalYearStart(date);
      return endOfMonth(addMonths(fiscalYearStart, 11));
    },
    [getFiscalYearStart],
  );

  const getQuarterStart = useCallback(
    (date: Date): Date => {
      const fiscalYearStart = getFiscalYearStart(date);
      const monthsFromFYStart =
        (date.getMonth() - fiscalYearStart.getMonth() + 12) % 12;
      const quartersFromFYStart = Math.floor(monthsFromFYStart / 3);
      return addMonths(fiscalYearStart, quartersFromFYStart * 3);
    },
    [getFiscalYearStart],
  );

  const getInitialState = () => {
    const viewParam = searchParams.get('view') as
      | 'month'
      | 'quarter'
      | 'year'
      | null;
    const startParam = searchParams.get('start');

    const view = viewParam || initialView;
    let currentDate;

    if (startParam) {
      currentDate = parseISO(startParam);
    } else {
      if (view === 'month') {
        currentDate = new Date(); // Use current date for month view
      } else if (view === 'quarter') {
        currentDate = getQuarterStart(new Date());
      } else {
        currentDate = getFiscalYearStart(new Date());
      }
    }

    return { view, currentDate };
  };

  const [{ view, currentDate }, setState] = useState(getInitialState);

  const updateURL = useCallback(
    (newDate: Date, newView: 'month' | 'quarter' | 'year') => {
      const start = format(
        newView === 'month'
          ? startOfMonth(newDate)
          : newView === 'quarter'
            ? getQuarterStart(newDate)
            : getFiscalYearStart(newDate),
        'yyyy-MM-dd',
      );
      const end = format(
        newView === 'month'
          ? endOfMonth(newDate)
          : newView === 'quarter'
            ? endOfMonth(addMonths(getQuarterStart(newDate), 2))
            : getFiscalYearEnd(newDate),
        'yyyy-MM-dd',
      );

      // Use shallow routing to update URL without server re-render
      const url = new URL(window.location.href);
      url.searchParams.set('view', newView);
      url.searchParams.set('start', start);
      url.searchParams.set('end', end);
      window.history.replaceState({}, '', url);
    },
    [getQuarterStart, getFiscalYearStart, getFiscalYearEnd],
  );

  useEffect(() => {
    if (!mini) {
      updateURL(currentDate, view);
    }
  }, [currentDate, view, mini, updateURL]);

  const handleDateChange = useCallback(
    (newDate: Date, newView?: 'month' | 'quarter' | 'year') => {
      let updatedDate = newDate;

      if (newView) {
        const today = new Date();
        if (newView === 'month') {
          updatedDate = startOfMonth(today);
        } else if (newView === 'quarter') {
          updatedDate = getQuarterStart(today);
        } else if (newView === 'year') {
          updatedDate = getFiscalYearStart(today);
        }
      }

      setState((prev) => ({
        currentDate: updatedDate,
        view: newView || prev.view,
      }));
    },
    [getQuarterStart, getFiscalYearStart],
  );

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfMonth(monthEnd);
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

    return (
      <div className="grid grid-cols-7 gap-2">
        {!mini &&
          ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-center text-sm">
              {day}
            </div>
          ))}
        {dateRange.map((date) => (
          <DayCell
            key={date.toString()}
            date={date}
            events={events}
            currentMonth={currentDate}
          />
        ))}
      </div>
    );
  };

  const renderMonthGrid = (month: Date) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfMonth(monthEnd);
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

    return (
      <div className="grid grid-cols-7 gap-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
          <div key={index} className="text-center text-xs text-gray-700/60">
            {day}
          </div>
        ))}
        {dateRange.map((date) => (
          <DayCell
            key={date.toString()}
            date={date}
            events={events}
            currentMonth={month}
          />
        ))}
      </div>
    );
  };

  const renderQuarterView = () => {
    const quarterStart = getQuarterStart(currentDate);
    const months = [
      quarterStart,
      addMonths(quarterStart, 1),
      addMonths(quarterStart, 2),
    ];

    return (
      <div className="grid grid-cols-3 gap-12">
        {months.map((month) => (
          <div key={month.toString()}>
            <h3 className="font-bold mb-4 font-label text-sm uppercase tracking-wide">
              {format(month, 'MMMM')}
            </h3>
            {renderMonthGrid(month)}
          </div>
        ))}
      </div>
    );
  };

  const renderYearView = () => {
    const yearStart = getFiscalYearStart(currentDate);
    const months = Array.from({ length: 12 }, (_, i) =>
      addMonths(yearStart, i),
    );

    return (
      <div className="grid grid-cols-3 gap-12">
        {months.map((month) => (
          <div key={month.toString()}>
            <h3 className="font-bold mb-4 font-label text-sm uppercase tracking-wide">
              {format(month, 'MMMM yyyy')}
            </h3>
            {renderMonthGrid(month)}
          </div>
        ))}
      </div>
    );
  };

  const DayCell: React.FC<{
    date: Date;
    events: EventData[];
    currentMonth: Date;
  }> = ({ date, events, currentMonth }) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const isToday = format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
    const isCurrentMonth = isSameMonth(date, currentMonth);
    const eventTypes: EventType[] = ['start', 'end', 'cancel'];
    const dayEvents = isCurrentMonth
      ? events.filter((event) =>
          eventTypes.some((type) => {
            const fieldType = dateFieldMap[type];
            // Get the first date from the JSONB array
            const date = event[fieldType]?.[0]?.date;
            return date === dateStr;
          }),
        )
      : [];

    return (
      <HoverCard openDelay={0}>
        <HoverCardTrigger asChild>
          <div
            className={`cursor-pointer border-t p-[.25em] text-right text-xs ${
              isCurrentMonth ? '' : 'text-gray-700/20'
            } ${isToday ? 'bg-primary/15 hover:bg-primary/20 dark:bg-secondary/50' : 'hover:bg-hover'} ${
              mini ? 'h-12' : 'h-14'
            }`}
          >
            <div className={`${isToday ? 'font-bold' : ''}`}>
              {format(date, 'd')}
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              {isCurrentMonth &&
                eventTypes.map((type: string) => {
                  const fieldType = dateFieldMap[type];
                  const hasEvent = dayEvents.some((event) => {
                    const date = event[fieldType]?.[0]?.date;
                    return date === dateStr;
                  });
                  return (
                    hasEvent && (
                      <div
                        key={type}
                        className={`mx-[1px] w-full rounded-[2px] ${
                          mini ? 'h-[4px]' : 'h-[6px]'
                        }`}
                        style={{ backgroundColor: dateTypeColorMap[type] }}
                      />
                    )
                  );
                })}
            </div>
          </div>
        </HoverCardTrigger>
        {dayEvents.length > 0 && (
          <HoverCardContent
            side="top"
            align="center"
            className="max-h-80 w-80 overflow-scroll border-0 p-0 shadow-2xl"
          >
            <div className="space-y-0 divide-y-[1px] overflow-y-auto">
              {dayEvents.map((event, index) => {
                const href = `/contracts/${event.id}`;
                const productInfo = getProductInfo(event);
                const eventType = eventTypes.find((type) => {
                  const fieldType = dateFieldMap[type];
                  const date = event[fieldType]?.[0]?.date;
                  return date === dateStr;
                }) as EventType;
                const eventDate = parseISO(dateStr);

                return (
                  <Link
                    href={href}
                    key={index}
                    className="block min-h-20 cursor-pointer space-y-1 p-4 text-left transition ease-in-out hover:bg-gray-700/5"
                  >
                    <h5 className="font-medium font-sans text-sm leading-tight">
                      {event.vendors?.name}
                    </h5>
                    {productInfo && (
                      <p className="font-sans text-xs">{productInfo}</p>
                    )}
                    <div className="flex items-center space-x-1">
                      <svg width="8" height="8" viewBox="0 0 8 8">
                        <rect
                          width="5.66"
                          height="5.66"
                          x="1.17"
                          y="1.17"
                          rx="1"
                          ry="1"
                          fill={dateTypeColorMap[eventType]}
                        />
                      </svg>
                      <span className="text-xs">
                        {eventTypeDescriptions[eventType]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(eventDate, dateFormat)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </HoverCardContent>
        )}
      </HoverCard>
    );
  };

  const getProductInfo = (event: any) => {
    const products = event.vendor_products_details || [];
    if (products.length === 0) return null;

    const firstProduct = products[0].vendor_products.name;
    if (products.length === 1) return <span>{firstProduct}</span>;

    return (
      <>
        {firstProduct}
        <span className="ml-1 inline-block text-xs text-gray-700">
          +{products.length - 1}
        </span>
      </>
    );
  };

  const navigate = (direction: 'prev' | 'next') => {
    let newDate;
    if (view === 'month') {
      newDate =
        direction === 'prev'
          ? subMonths(currentDate, 1)
          : addMonths(currentDate, 1);
    } else if (view === 'quarter') {
      newDate =
        direction === 'prev'
          ? subMonths(currentDate, 3)
          : addMonths(currentDate, 3);
    } else {
      const fiscalYearStart = getFiscalYearStart(currentDate);
      newDate =
        direction === 'prev'
          ? subYears(fiscalYearStart, 1)
          : addYears(fiscalYearStart, 1);
    }
    handleDateChange(newDate);
  };

  const handleViewChange = (newView: 'month' | 'quarter' | 'year') => {
    if (newView !== view) {
      const newDate =
        newView === 'month'
          ? new Date()
          : newView === 'quarter'
            ? getQuarterStart(new Date())
            : getFiscalYearStart(new Date());
      handleDateChange(newDate, newView);
    }
  };

  const isToday = () => {
    if (view === 'month') {
      return isSameMonth(currentDate, today);
    } else if (view === 'quarter') {
      return isSameMonth(getQuarterStart(currentDate), getQuarterStart(today));
    } else {
      return isSameDay(
        getFiscalYearStart(currentDate),
        getFiscalYearStart(today),
      );
    }
  };

  const resetToToday = () => {
    if (!isToday()) {
      const newDate =
        view === 'month'
          ? today
          : view === 'quarter'
            ? getQuarterStart(today)
            : getFiscalYearStart(today);
      handleDateChange(newDate);
    }
  };

  const getHeaderText = () => {
    if (view === 'month') {
      return format(currentDate, 'MMMM yyyy');
    } else if (view === 'quarter') {
      const quarterStart = getQuarterStart(currentDate);
      const quarterEnd = endOfMonth(addMonths(quarterStart, 2));
      return `${format(quarterStart, 'MMMM')} - ${format(quarterEnd, 'MMMM yyyy')}`;
    } else {
      const yearStart = getFiscalYearStart(currentDate);
      const yearEnd = getFiscalYearEnd(currentDate);
      return `${format(yearStart, 'MMMM yyyy')} - ${format(yearEnd, 'MMMM yyyy')}`;
    }
  };

  return (
    <div className="custom-calendar w-full font-label">
      {/* Header */}
      <div
        className={`flex items-center justify-between ${mini ? 'p-6' : 'mb-10'}`}
      >
        <h1 className={`font-serif ${mini ? 'text-2xl' : ''}`}>
          {getHeaderText()}
        </h1>
        <div className="flex items-center gap-6">
          {!mini && (
            <div className="flex space-x-1">
              {['Month', 'Quarter', 'Year'].map((v) => (
                <button
                  key={v}
                  onClick={() =>
                    handleViewChange(
                      v.toLowerCase() as 'month' | 'quarter' | 'year',
                    )
                  }
                  className={`px-2 py-1 text-sm ${view === v.toLowerCase() ? 'font-semibold bg-gray-200 dark:text-primary-foreground' : ''}`}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
          <div className="flex">
            <button onClick={() => navigate('prev')} className="p-1">
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={resetToToday}
              className={`px-2 py-1 text-sm ${
                isToday() ? 'cursor-not-allowed opacity-50' : ''
              }`}
              disabled={isToday()}
            >
              Today
            </button>
            <button onClick={() => navigate('next')} className="p-1">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar View */}
      <div>
        {view === 'month' && renderMonthView()}
        {!mini && view === 'quarter' && renderQuarterView()}
        {!mini && view === 'year' && renderYearView()}
      </div>
      <div
        id="calendarLegend"
        className="my-6 flex flex-row justify-center gap-8 px-2 font-label text-xs leading-tight"
      >
        <div className="inline-flex items-center gap-1.5">
          <div
            className="inline-block h-1 w-6 rounded-[1px]"
            style={{ backgroundColor: dateTypeColorMap.start }}
          ></div>
          <div>{mini ? 'Start' : 'Start Date'}</div>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <div
            className="inline-block h-1 w-6 rounded-[1px]"
            style={{ backgroundColor: dateTypeColorMap.cancel }}
          ></div>
          <div>{mini ? 'Cancel' : 'Cancel By Date'}</div>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <div
            className="inline-block h-1 w-6 rounded-[1px]"
            style={{ backgroundColor: dateTypeColorMap.end }}
          ></div>
          <div>{mini ? 'End' : 'End Date'}</div>
        </div>
      </div>
    </div>
  );
};

export default CustomCalendar;
