'use client';

import Link from 'next/link';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatCurrency } from '@/app/lib/utils';
import { cn } from '@/lib/utils';
import { ChevronRightIcon } from '@radix-ui/react-icons';
import { CircleIcon } from '@radix-ui/react-icons';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';

interface BudgetItem {
  title: string;
  amount: number;
  description: string;
  href: string;
}

interface BudgetReportCardProps {
  title: string;
  viewMoreHref: string;
  currentSpend: number;
  projectedSpend: number;
  budgetItems: BudgetItem[];
}

export function BudgetReportCard({
  title,
  viewMoreHref,
  currentSpend,
  projectedSpend,
  budgetItems,
}: BudgetReportCardProps) {
  const percentChange =
    currentSpend > 0
      ? Math.round(((projectedSpend - currentSpend) / currentSpend) * 100)
      : 0;

  const chartData = [
    {
      name: 'Spend',
      current: currentSpend,
      projected: projectedSpend,
    },
  ];

  return (
    <Card className="flex flex-col justify-between bg-white/40 dark:bg-card">
      <div>
        <CardHeader>
          <CardTitle className="font-light font-sans text-xl tracking-normal">
            <Link href={viewMoreHref} className="flex items-center">
              {title}
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {/* Budget Items */}
            <div className="space-y-3">
              {budgetItems.map((item, index) => (
                <Link href={item.href} key={index}>
                  <Card className="flex items-center justify-between border-l-4 border-l-blue-200 p-4 transition-all hover:border-l-blue-300">
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        <CircleIcon className="h-3 w-3 fill-blue-500 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-medium text-base">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </div>
                    <div className="font-medium">
                      {formatCurrency(item.amount)}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>

            {/* Spend Chart */}
            <div className="mt-6">
              <h3 className="font-medium mb-2 text-sm">
                Current vs. Projected Spend
              </h3>
              <div className="h-32">
                <ChartContainer
                  config={{
                    current: {
                      label: 'Current',
                      theme: {
                        light: '#4C88EA',
                        dark: '#6E9AEB',
                      },
                    },
                    projected: {
                      label: 'Projected',
                      theme: {
                        light: '#EA9A57',
                        dark: '#F0B78C',
                      },
                    },
                  }}
                >
                  <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
                    barGap={10}
                  >
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={false}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={false} />
                    <Bar
                      dataKey="current"
                      fill="var(--color-current)"
                      radius={[4, 4, 0, 0]}
                      barSize={40}
                      name="Current"
                    />
                    <Bar
                      dataKey="projected"
                      fill="var(--color-projected)"
                      radius={[4, 4, 0, 0]}
                      barSize={40}
                      name="Projected"
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => {
                            if (name === 'Projected' && percentChange !== 0) {
                              return (
                                <div className="flex items-center justify-between gap-2">
                                  <span>{name}</span>
                                  <div className="flex items-center gap-1">
                                    <span>
                                      {formatCurrency(value as number)}
                                    </span>
                                    <span
                                      className={cn(
                                        'text-xs',
                                        percentChange > 0
                                          ? 'text-red-500'
                                          : 'text-green-500',
                                      )}
                                    >
                                      ({percentChange > 0 ? '+' : ''}
                                      {percentChange}%)
                                    </span>
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div className="flex items-center justify-between gap-2">
                                <span>{name}</span>
                                <span>{formatCurrency(value as number)}</span>
                              </div>
                            );
                          }}
                        />
                      }
                    />
                  </BarChart>
                </ChartContainer>
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-sm bg-blue-500"></div>
                  <span>Current: {formatCurrency(currentSpend)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-sm bg-amber-500"></div>
                  <span>
                    Projected: {formatCurrency(projectedSpend)}
                    {percentChange !== 0 && (
                      <span
                        className={cn(
                          percentChange > 0 ? 'text-red-500' : 'text-green-500',
                        )}
                      >
                        {' '}
                        ({percentChange > 0 ? '+' : ''}
                        {percentChange}%)
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </div>
      <CardFooter>
        <Link
          href={viewMoreHref}
          className="mt-2 flex w-auto items-center border-b border-b-transparent text-[0.85rem] leading-none text-foreground hover:border-b-foreground/50"
        >
          View budget details
          <ChevronRightIcon width={14} height={14} />
        </Link>
      </CardFooter>
    </Card>
  );
}
