'use client';

import { useState, useMemo } from 'react';
import {
  format,
  parseISO,
  addMonths,
  addYears,
  differenceInMonths,
} from 'date-fns';
import { BarChart, Bar, XAxis, CartesianGrid, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { ChartContainer } from '@/components/ui/chart';
import { formatCurrency, handleDownload } from '@/app/lib/utils';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useCanExportCsv } from '@/hooks/useCanExportCsv';
import { getFiscalYearInfo } from '@/app/lib/budget';
import { PriceHistory } from '@/app/lib/budget/types';
import {
  extractRenewalsData,
  extractActualCostData,
  extractAmortizedData,
  ChartData,
  ChartType,
  ViewMode,
} from '@/app/lib/budget/priceHistoryChartUtils';
import { PriceHistoryBarWithPopover } from './PriceHistoryBarWithPopover';
import { ViewModeTooltip } from './PriceHistoryViewTooltip';
import { exportBudgetChartData } from '@/app/lib/actions/export-budget';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
} from '@/components/ui/dialog';
import Loading from '@/components/Loading';
import { DownloadIcon } from '@radix-ui/react-icons';

interface PriceHistoryChartProps {
  priceHistories: PriceHistory[];
  fiscalYearStartMonth?: number;
}

// View configuration
const viewConfigs = {
  renewals: {
    allowedChartTypes: ['current', 'projected', 'tcv'] as ChartType[],
    getSubtitle: (fy: number) => `Annual Spend of Renewals for FY${fy}`,
  },
  actualCost: {
    allowedChartTypes: ['current', 'projected'] as ChartType[],
    getSubtitle: (fy: number) => `Actual Cost Spend for FY${fy}`,
  },
  amortized: {
    allowedChartTypes: ['current', 'projected'] as ChartType[],
    getSubtitle: (fy: number) => `Amortized Spend for FY${fy}`,
  },
} as const;

// Chart titles
const chartTitles: Record<ChartType, string> = {
  current: 'Current Budget (Current Fiscal Year)',
  projected: 'Projected Budget (Next Fiscal Year)',
  tcv: 'Total Contract Value',
};

export default function PriceHistoryChart({
  priceHistories,
  fiscalYearStartMonth,
}: PriceHistoryChartProps) {
  const [chartType, setChartType] = useState<ChartType>('current');
  const [viewMode, setViewMode] = useState<ViewMode>('renewals');
  const { baseCurrency } = useBaseCurrency();
  const canExport = useCanExportCsv('cpm');
  const [isExporting, setIsExporting] = useState(false);

  // Get fiscal year info
  const fiscalYearInfo = useMemo(() => {
    return getFiscalYearInfo(fiscalYearStartMonth);
  }, [fiscalYearStartMonth]);

  // Handle view mode changes
  const handleViewModeChange = (newViewMode: ViewMode) => {
    setViewMode(newViewMode);
    // Reset to allowed chart type if current one isn't allowed
    if (!viewConfigs[newViewMode].allowedChartTypes.includes(chartType)) {
      setChartType(viewConfigs[newViewMode].allowedChartTypes[0]);
    }
  };

  // Extract data based on view mode
  const chartData = useMemo(() => {
    // Filter out zero value contracts (superseded filtering done in buildBudgetSummary)
    const filteredContracts = priceHistories.filter((contract) => {
      const contractValue =
        contract.annualContractValueUSD || contract.annualContractValue;
      return contractValue > 0;
    });

    switch (viewMode) {
      case 'renewals':
        return extractRenewalsData(
          filteredContracts,
          chartType,
          fiscalYearInfo,
        );
      case 'actualCost':
        return extractActualCostData(
          filteredContracts,
          chartType,
          fiscalYearInfo,
        );
      case 'amortized':
        return extractAmortizedData(
          filteredContracts,
          chartType,
          fiscalYearInfo,
        );
      default:
        return { data: [], isMonthly: true };
    }
  }, [priceHistories, chartType, viewMode, fiscalYearInfo]);

  // Calculate the dynamic Y-axis domain max value that divides evenly into ticks
  const maxDomainValue = useMemo(() => {
    // Default if no data
    if (priceHistories.length === 0) return 100000;

    // Filter out contracts with zero value once for all calculations
    const nonZeroContracts = priceHistories.filter((contract) => {
      const contractValue =
        contract.annualContractValueUSD || contract.annualContractValue;
      return contractValue > 0;
    });

    // Calculate data for all view types with current chart type
    const allViewsData = [
      extractRenewalsData(nonZeroContracts, chartType, fiscalYearInfo).data,
      extractActualCostData(nonZeroContracts, chartType, fiscalYearInfo).data,
      extractAmortizedData(nonZeroContracts, chartType, fiscalYearInfo).data,
    ];

    // Find max value across all views
    const maxValues = allViewsData.map((data) => {
      if (data.length === 0) return 0;
      return Math.max(...data.map((item) => item.value));
    });

    const globalMaxValue = Math.max(...maxValues);

    // Calculate a nice max value that divides evenly into ticks
    // We want intervals of 10k, 25k, 50k, 100k, 250k, 500k, 1M, etc.
    const niceIntervals = [
      10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000,
      10000000,
    ];

    // Find the smallest interval where 3 intervals >= globalMaxValue
    for (const interval of niceIntervals) {
      const maxValue = interval * 3; // 3 intervals = 4 ticks
      if (maxValue >= globalMaxValue) {
        return maxValue;
      }
    }

    // Fallback: round up to nearest million
    return Math.ceil(globalMaxValue / 1000000) * 1000000;
  }, [priceHistories, chartType, fiscalYearInfo]);

  // Get chart configuration
  const chartConfig = {
    value: {
      label: chartTitles[chartType],
      valueFormatter: (value: number) => formatCurrency(value, baseCurrency),
    },
  };

  // Get subtitle based on view and chart type
  const subtitle =
    chartType === 'tcv'
      ? 'All Renewals by Total Contract Value'
      : viewConfigs[viewMode].getSubtitle(
          chartType === 'current'
            ? fiscalYearInfo.currentFiscalYear % 100
            : (fiscalYearInfo.currentFiscalYear + 1) % 100,
        );

  // Export handler
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const currentDate = new Date();
      const filename = `budget-chart-data-${format(currentDate, 'yyyy-MM')}.xlsx`;

      // The engine-computed workbook is the canonical export; this legacy
      // comparison chart no longer influences it.
      const dataArray = await exportBudgetChartData();

      const uint8Array = new Uint8Array(dataArray);
      const blob = new Blob([uint8Array], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      await handleDownload(blob, filename);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-normal flex items-center text-base">
            {viewMode === 'actualCost' ? (
              <>
                <span>Actual Cost</span>
                <ViewModeTooltip viewMode="actualCost" />
              </>
            ) : viewMode === 'amortized' ? (
              <>
                <span>Amortized</span>
                <ViewModeTooltip viewMode="amortized" />
              </>
            ) : (
              <>
                <span>Renewals</span>
                <ViewModeTooltip viewMode="renewals" />
              </>
            )}
          </h3>
          <p className="font-normal text-xs text-muted-foreground">
            {subtitle}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* View mode selector */}
          <div className="flex items-center gap-2 border-r pr-4">
            {(['renewals', 'actualCost', 'amortized'] as ViewMode[]).map(
              (mode) => (
                <Button
                  key={mode}
                  size="xs"
                  variant={viewMode === mode ? 'secondary' : 'outline'}
                  onClick={() => handleViewModeChange(mode)}
                >
                  {mode === 'actualCost'
                    ? 'Actual Cost'
                    : mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Button>
              ),
            )}
          </div>

          {/* Chart type selector */}
          <div className="flex space-x-2">
            {(['current', 'projected', 'tcv'] as ChartType[]).map((type) => (
              <Button
                key={type}
                size="xs"
                variant={chartType === type ? 'secondary' : 'outline'}
                onClick={() => setChartType(type)}
                disabled={
                  !viewConfigs[viewMode].allowedChartTypes.includes(type)
                }
                className={
                  !viewConfigs[viewMode].allowedChartTypes.includes(type)
                    ? 'cursor-not-allowed opacity-50'
                    : ''
                }
              >
                {type === 'tcv'
                  ? 'TCV'
                  : type === 'current'
                    ? 'Current'
                    : 'Projected'}
              </Button>
            ))}
          </div>

          {canExport && (
            <div className="flex border-l pl-4">
              <Button
                variant="outline"
                size="xs"
                disabled={priceHistories.length === 0}
                onClick={handleExport}
                className="gap-0.5"
              >
                <DownloadIcon className="h-3 w-3 p-0.5" />
                Export
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        {chartData.data.length > 0 ? (
          <ChartContainer config={chartConfig} className="aspect-auto h-full">
            <BarChart
              layout="horizontal"
              data={chartData.data}
              margin={{ top: 10, right: 20, left: 20, bottom: 20 }}
              barGap={0}
            >
              <XAxis
                dataKey="label"
                type="category"
                height={30}
                tick={{
                  fontSize: 11,
                  fill: 'currentColor',
                }}
                className="font-label uppercase"
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                interval={0}
              />
              <YAxis
                dataKey="value"
                type="number"
                height={30}
                tick={{
                  fontSize: 11,
                  fill: 'currentColor',
                }}
                className="font-label uppercase"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                interval={0}
                tickFormatter={(value) =>
                  new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: baseCurrency,
                    notation: 'compact',
                    maximumFractionDigits: 1,
                  }).format(value)
                }
                tickCount={4}
                domain={[0, maxDomainValue]}
              />
              <CartesianGrid
                strokeDasharray="1 2"
                vertical={false}
                stroke="hsl(var(--muted-foreground))"
                opacity={0.6}
              />
              <Bar
                dataKey="value"
                radius={1}
                barSize={Math.max(10, 300 / chartData.data.length)}
                className="fill-[#1F1C41] dark:fill-primary"
                shape={(props: any) => (
                  <PriceHistoryBarWithPopover
                    {...props}
                    chartType={chartType}
                    viewMode={viewMode}
                    baseCurrency={baseCurrency}
                  />
                )}
              />
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No data available for the selected period
          </div>
        )}
      </div>

      {/* Export dialog */}
      {isExporting && (
        <Dialog open={isExporting} onOpenChange={setIsExporting}>
          <DialogContent
            onInteractOutside={(e) => {
              e.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogClose />
              <DialogDescription>
                <div className="flex items-center justify-center gap-4">
                  Exporting
                  <Loading />
                </div>
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
