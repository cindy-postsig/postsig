'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, CartesianGrid, YAxis } from 'recharts';
import { InfoCircledIcon, DownloadIcon } from '@radix-ui/react-icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ChartContainer } from '@/components/ui/chart';
import { formatCurrency, handleDownload } from '@/app/lib/utils';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useCanExportCsv } from '@/hooks/useCanExportCsv';
import { useSpendQuery } from '@/hooks/api/useSpendQuery';
import { exportBudgetChartData } from '@/app/lib/actions/export-budget';
import Loading from '@/components/Loading';
import { toChartData, toCommitmentChartData } from './toChartData';
import { SpendChartBarPopover } from './SpendChartBarPopover';
import {
  costMethodInput,
  costMethodLabels,
  costMethodSubtitles,
  costMethodTooltips,
  type CostMethod,
} from '../costMethod';

type WindowKey = 'currentFY' | 'nextFY';

const windowLabels: Record<WindowKey, string> = {
  currentFY: 'Current',
  nextFY: 'Projected',
};

const RENEWAL_FILL =
  'fill-[#1F1C41] hover:fill-[#1F1C41]/85 dark:fill-primary dark:hover:fill-primary/90';
const NEW_FILL =
  'fill-[#8E8AAD] hover:fill-[#8E8AAD]/85 dark:fill-[#8E8AAD] dark:hover:fill-[#8E8AAD]/90';

export default function SpendChart({
  method,
  fiscalYear,
  currentFiscalYear,
}: {
  method: CostMethod;
  // Absent (dashboard) = anchored to the live currentFY/nextFY windows; a
  // historical selection swaps both toggles to explicit years.
  fiscalYear?: number;
  currentFiscalYear?: number;
}) {
  const [windowKey, setWindowKey] = useState<WindowKey>('currentFY');
  const { baseCurrency } = useBaseCurrency();
  const canExport = useCanExportCsv('cpm');
  const [isExporting, setIsExporting] = useState(false);

  const isHistorical =
    fiscalYear !== undefined &&
    currentFiscalYear !== undefined &&
    fiscalYear < currentFiscalYear;

  const input = useMemo(() => {
    const window = isHistorical
      ? { fiscalYear: windowKey === 'nextFY' ? fiscalYear + 1 : fiscalYear }
      : windowKey;
    return costMethodInput(method, window, 'month', 'contract');
  }, [method, windowKey, fiscalYear, isHistorical]);
  const { data: response, isPending, isError } = useSpendQuery(input);

  const isCommitments = response?.kind === 'commitments';
  const chartData = useMemo(() => {
    if (!response) return { points: [], isMonthly: true };
    return response.kind === 'commitments'
      ? toCommitmentChartData(response)
      : toChartData(response);
  }, [response]);

  // The subtitle's FY number comes from the response so non-January orgs
  // label correctly.
  const currentFYNum =
    (response?.window.fiscalYear ?? new Date().getFullYear()) -
    (windowKey === 'nextFY' ? 1 : 0);
  const selectedFY =
    windowKey === 'currentFY' ? currentFYNum : currentFYNum + 1;

  // The response states the currency its already-converted amounts are in;
  // the org base is the pre-load stand-in so the axis never flashes the wrong
  // symbol while the query is pending.
  const currency = response?.targetCurrency ?? baseCurrency;

  const chartConfig = {
    value: {
      label: costMethodLabels[method],
      valueFormatter: (value: number) => formatCurrency(value, currency),
    },
  };

  const handleExport = async () => {
    if (!response) return;
    setIsExporting(true);
    try {
      const suffix = format(new Date(), 'yyyy-MM');
      const filename = isHistorical
        ? `budget-chart-data-fy${fiscalYear}-${suffix}.xlsx`
        : `budget-chart-data-${suffix}.xlsx`;
      const dataArray = await exportBudgetChartData(
        isHistorical ? fiscalYear : undefined,
      );
      const blob = new Blob([new Uint8Array(dataArray)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      await handleDownload(blob, filename);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-normal flex items-center text-base">
            <span>{costMethodLabels[method]}</span>
            <TooltipProvider>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <InfoCircledIcon className="ml-1 h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  {costMethodTooltips[method]}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h3>
          <p className="font-normal text-xs text-muted-foreground">
            {costMethodSubtitles[method](selectedFY % 100)}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex space-x-2">
            {(['currentFY', 'nextFY'] as WindowKey[]).map((key) => (
              <Button
                key={key}
                size="xs"
                variant={windowKey === key ? 'secondary' : 'outline'}
                onClick={() => setWindowKey(key)}
              >
                {isHistorical
                  ? `FY${key === 'nextFY' ? fiscalYear + 1 : fiscalYear}`
                  : windowLabels[key]}
              </Button>
            ))}
          </div>

          {canExport && (
            <div className="border-l pl-4">
              <Button
                variant="outline"
                size="xs"
                disabled={!response || response.items.length === 0}
                onClick={handleExport}
                className="gap-0.5"
              >
                {isExporting ? (
                  <Loading />
                ) : (
                  <DownloadIcon className="h-3 w-3 p-0.5" />
                )}
                Export
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="h-64">
        {isPending ? (
          <div className="flex h-full items-center justify-center">
            <Loading />
          </div>
        ) : isError ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Failed to load spend data
          </div>
        ) : chartData.points.length > 0 ? (
          <ChartContainer config={chartConfig} className="aspect-auto h-full">
            <BarChart
              layout="horizontal"
              data={chartData.points}
              margin={{ top: 10, right: 20, left: 20, bottom: 20 }}
              barGap={0}
            >
              <XAxis
                dataKey="label"
                type="category"
                height={30}
                tick={{ fontSize: 11, fill: 'currentColor' }}
                className="font-label uppercase"
                tickLine={false}
                axisLine={false}
                tickMargin={12}
              />
              <YAxis
                dataKey="value"
                type="number"
                height={30}
                tick={{ fontSize: 11, fill: 'currentColor' }}
                className="font-label uppercase"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                tickFormatter={(value) =>
                  new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency,
                    notation: 'compact',
                    maximumFractionDigits: 1,
                  }).format(value)
                }
              />
              <CartesianGrid
                strokeDasharray="1 2"
                vertical={false}
                stroke="hsl(var(--muted-foreground))"
                opacity={0.6}
              />
              {/* Array, not a fragment: recharts introspects direct children
                  by type and silently drops Bars wrapped in a fragment. */}
              {isCommitments ? (
                [
                  <Bar
                    key="renewalValue"
                    dataKey="renewalValue"
                    stackId="commitments"
                    radius={1}
                    barSize={Math.max(10, 300 / chartData.points.length)}
                    shape={(props: any) => (
                      <SpendChartBarPopover
                        {...props}
                        currency={currency}
                        fillClassName={RENEWAL_FILL}
                      />
                    )}
                  />,
                  <Bar
                    key="newValue"
                    dataKey="newValue"
                    stackId="commitments"
                    radius={1}
                    barSize={Math.max(10, 300 / chartData.points.length)}
                    shape={(props: any) => (
                      <SpendChartBarPopover
                        {...props}
                        currency={currency}
                        fillClassName={NEW_FILL}
                      />
                    )}
                  />,
                ]
              ) : (
                <Bar
                  dataKey="value"
                  radius={1}
                  barSize={Math.max(10, 300 / chartData.points.length)}
                  shape={(props: any) => (
                    <SpendChartBarPopover {...props} currency={currency} />
                  )}
                />
              )}
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No data available for the selected period
          </div>
        )}
      </div>

      {isCommitments && (
        <div className="flex items-center gap-4 font-label text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#1F1C41] dark:bg-primary" />
            Renewals
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#8E8AAD]" />
            New contracts
          </span>
        </div>
      )}
    </div>
  );
}
