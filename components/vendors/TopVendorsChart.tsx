'use client';

import React, { useState } from 'react';
import { formatCurrency } from '@/app/lib/utils';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Rectangle,
} from 'recharts';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { TopVendor } from '@/lib/v2/vendors/transforms';

interface TopVendorsChartProps {
  vendors: TopVendor[];
}

type ChartType = 'tcv' | 'currentBudget' | 'projectedBudget';

// Create a context to share chart type state
export const TopVendorsChartContext = React.createContext<{
  chartType: ChartType;
  setChartType: React.Dispatch<React.SetStateAction<ChartType>>;
}>({
  chartType: 'currentBudget',
  setChartType: () => {},
});

// Custom hook to use the chart context
export const useTopVendorsChart = () =>
  React.useContext(TopVendorsChartContext);

export default function TopVendorsChart({ vendors }: TopVendorsChartProps) {
  const { baseCurrency } = useBaseCurrency();
  const [chartType, setChartType] = useState<ChartType>('currentBudget');

  // Provide the chart type state to children components
  const contextValue = React.useMemo(
    () => ({ chartType, setChartType }),
    [chartType],
  );

  // Dispatch custom event when chart type changes
  React.useEffect(() => {
    const event = new CustomEvent('chartTypeChange', {
      detail: { chartType },
    });
    window.dispatchEvent(event);
  }, [chartType]);

  const getChartValue = (vendor: TopVendor) => {
    switch (chartType) {
      case 'currentBudget':
        return vendor.currentBudget || 0;
      case 'projectedBudget':
        return vendor.projectedBudget || 0;
      default:
        return vendor.totalContractValue || 0;
    }
  };

  const getChartTitle = () => {
    switch (chartType) {
      case 'currentBudget':
        return 'Current Spend';
      case 'projectedBudget':
        return 'Projected Spend';
      default:
        return 'Total Contract Value';
    }
  };

  // Sort vendors by selected value type and prepare for chart
  const topVendors = [...vendors]
    .sort((a, b) => getChartValue(b) - getChartValue(a))
    .slice(0, 12)
    .map((vendor) => {
      const vendorName =
        vendor.name.length > 30
          ? vendor.name.substring(0, 22) + '...'
          : vendor.name;

      return {
        name: vendorName,
        fullName: vendor.name,
        id: vendor.id,
        value: getChartValue(vendor),
        contractCount: vendor.contractCount,
        invoiceCount: vendor.invoiceCount,
      };
    });

  // Chart config for the tooltip
  const chartConfig = {
    value: {
      label: getChartTitle(),
    },
  };

  return (
    <TopVendorsChartContext.Provider value={contextValue}>
      <div className="space-y-4">
        <div className="flex space-x-2">
          <Button
            size="xs"
            variant={chartType === 'currentBudget' ? 'secondary' : 'outline'}
            onClick={() => setChartType('currentBudget')}
          >
            Current
          </Button>
          <Button
            size="xs"
            variant={chartType === 'projectedBudget' ? 'secondary' : 'outline'}
            onClick={() => setChartType('projectedBudget')}
          >
            Projected
          </Button>
          <Button
            size="xs"
            variant={chartType === 'tcv' ? 'secondary' : 'outline'}
            onClick={() => setChartType('tcv')}
          >
            TCV
          </Button>
        </div>

        <div className="h-[350px]">
          {topVendors.length > 0 ? (
            <ChartContainer config={chartConfig} className="aspect-auto h-full">
              <BarChart
                layout="vertical"
                data={topVendors}
                margin={{ top: 5, right: 28, left: 0, bottom: 5 }}
                barGap={0}
              >
                <CartesianGrid
                  horizontal={false}
                  strokeDasharray="3 3"
                  stroke="hsl(var(--muted-foreground))"
                  strokeOpacity={0.3}
                />
                <XAxis
                  type="number"
                  tickFormatter={(v) =>
                    new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: baseCurrency,
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(v as number)
                  }
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={190}
                  tick={(props) => {
                    const { x, y, payload } = props;
                    const vendorId = topVendors[payload.index]?.id;
                    // Finite, not typeof: NaN is a 'number' but /vendors/NaN
                    // is a dead route.
                    const hasVendorPage = Number.isFinite(vendorId);

                    const label = (
                      <text
                        x={x}
                        y={y}
                        dy={3}
                        fontSize={12}
                        textAnchor="end"
                        fill="currentColor"
                        className={
                          hasVendorPage
                            ? 'cursor-pointer font-label text-foreground hover:underline'
                            : 'font-label text-foreground'
                        }
                      >
                        {payload.value}
                      </text>
                    );

                    // A vendor keyed by name (no vendor_id recorded) has no
                    // detail page — /vendors/[id] parses a numeric id — so
                    // render its label without the dead link.
                    return hasVendorPage ? (
                      <Link href={`/vendors/${vendorId}`}>{label}</Link>
                    ) : (
                      label
                    );
                  }}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  interval={0}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      hideIndicator
                      hideLabel
                      className="w-52"
                      formatter={(value, name, item) => {
                        const fullName = item?.payload?.fullName;
                        const contractCount = item?.payload?.contractCount || 0;
                        const invoiceCount = item?.payload?.invoiceCount || 0;
                        // Berenberg: invoices are not "contracts" — name each
                        // count, omitting whichever is zero.
                        const countParts = [
                          contractCount > 0 &&
                            `${contractCount} ${contractCount === 1 ? 'contract' : 'contracts'}`,
                          invoiceCount > 0 &&
                            `${invoiceCount} ${invoiceCount === 1 ? 'invoice' : 'invoices'}`,
                        ].filter(Boolean);
                        const valueName =
                          chartType === 'tcv'
                            ? 'TCV'
                            : chartType === 'currentBudget'
                              ? 'Current'
                              : 'Projected';

                        if (fullName) {
                          return (
                            <div className="flex w-full flex-col gap-1">
                              <div className="font-medium">{fullName}</div>
                              <div className="flex w-full justify-between">
                                <span>{valueName}</span>
                                <span>
                                  {formatCurrency(
                                    value as number,
                                    baseCurrency,
                                  )}
                                </span>
                              </div>
                              {countParts.length > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  {countParts.join(' | ')}
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  }
                />
                <Bar
                  dataKey="value"
                  radius={2}
                  barSize={14}
                  className="fill-[#1F1C41] dark:fill-primary"
                  shape={(props: any) => {
                    const { x, y, width, height, index } = props;
                    const opacity = 1 - index * 0.06;

                    return (
                      <Rectangle
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        radius={[0, 2, 2, 0]}
                        className="fill-[#1F1C41] dark:fill-primary"
                        fillOpacity={opacity}
                      />
                    );
                  }}
                />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No vendor data available
            </div>
          )}
        </div>
      </div>
    </TopVendorsChartContext.Provider>
  );
}
