'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
import { SummaryCard } from '@/components/cards/SummaryCard';
import MonthlyReportChart from '@/components/budget/MonthlyReportChart';
import MonthlyReportTables from '@/components/budget/MonthlyReportTables';
import TagFilter from '@/components/budget/TagFilter';
import ExportMonthlyReportButton from '@/components/budget/ExportMonthlyReportButton';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import {
  formatCurrencyAbbreviated,
  formatFxRate,
  getCurrencySymbol,
} from '@/app/lib/utils';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import type { FxRateDisclosure } from '@/lib/v2/reports/monthly-report/service';

import {
  BusinessSponsorAndGroupData,
  PriceChangeData,
  TopVendorData,
  refilterParentRow,
} from '@/lib/v2/reports/monthly-report/transforms';
import { TableSectionHeader } from './TableSectionHeader';

type MonthlyReportViewMode = 'amortized' | 'actual';

interface MonthlyReportOverview {
  currentMonthSpend: {
    amount: number;
    label: string;
  };
  nextMonthSpend: {
    amount: number;
    change: number;
    changePercent: number;
    label: string;
  };
}

interface MonthlyReportData {
  overview: MonthlyReportOverview;
  spendByBusinessGroup: BusinessSponsorAndGroupData[];
  spendByBusinessSponsor: BusinessSponsorAndGroupData[];
  priceChanges: PriceChangeData[];
  topVendorsBySpend: TopVendorData[];
}

interface MonthlyReportClientProps {
  amortizedData: MonthlyReportData;
  actualCostData: MonthlyReportData;
  alertRange?: number;
  contracts?: any[];
  enrichedContracts?: any[];
  priceHistories?: any[];
  upcomingRenewalsContracts?: any[];
  userMetadata?: any;
  fxRates?: FxRateDisclosure[];
}

/**
 * 'yyyy-MM' -> 'Aug'. Parsed as UTC so the label is a pure function of the key
 * the server sent, rather than of whichever timezone the browser is in.
 */
function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * "FX USD→EUR: 0.9203 (Aug avg) / 0.9210 (Sep)" — the rates the converted
 * figures on this page were derived from. Renders nothing for a
 * single-currency org, where no conversion happened.
 */
function FxRateNote({
  fxRates,
  baseCurrency,
}: {
  fxRates: FxRateDisclosure[];
  baseCurrency: string;
}) {
  if (fxRates.length === 0) return null;

  return (
    <p className="font-label text-xs uppercase tracking-wider text-muted-foreground">
      {fxRates
        .map(
          (rate) =>
            `FX ${rate.from}→${baseCurrency}: ${formatFxRate(rate.currentMonthRate)} (${monthLabel(rate.currentMonthKey)} avg) / ${formatFxRate(rate.nextMonthRate)} (${monthLabel(rate.nextMonthKey)})`,
        )
        .join(' · ')}
    </p>
  );
}

function formatPercentage(percentage: number): string {
  const absPercentage = Math.abs(percentage);

  if (absPercentage === 0) return '0%';
  if (absPercentage < 0.01) {
    // For very small percentages (< 0.01%), show with 3 decimal places
    return absPercentage.toFixed(3) + '%';
  }
  if (absPercentage < 0.1) {
    // For small percentages (< 0.1%), show with 2 decimal places
    return absPercentage.toFixed(2) + '%';
  }
  // For normal percentages (>= 0.1%), show with 1 decimal place
  return absPercentage.toFixed(1) + '%';
}

function extractVendorName(fullName: string): string {
  return fullName.split(' - ')[0];
}

function formatChangeAmount(change: number, currencySymbol: string): string {
  const absChange = Math.abs(change);
  const prefix = change > 0 ? '+' : '-';
  if (absChange >= 1000) {
    return `${prefix}${currencySymbol}${(absChange / 1000).toFixed(1)}K`;
  }
  return `${prefix}${currencySymbol}${Math.round(absChange)}`;
}

function getChangeSeparator(index: number, total: number): string {
  if (total > 2 && index < total - 2) return ',';
  if (total > 2 && index === total - 2) return ', and';
  if (total === 2 && index === total - 2) return ' and';
  return '';
}

function SummaryText({
  selectedTag,
  changePercent,
  change,
  summaryChanges,
  viewMode,
  currentMonthAmount,
  nextMonthAmount,
}: {
  selectedTag: string | null;
  changePercent: number;
  change: number;
  summaryChanges: Array<{ name: string; change: number; currentMonth: number }>;
  viewMode: MonthlyReportViewMode;
  currentMonthAmount: number;
  nextMonthAmount: number;
}) {
  const { baseCurrency } = useBaseCurrency();
  const currencySymbol = getCurrencySymbol(baseCurrency);
  return (
    <>
      {viewMode === 'actual' ? (
        <>
          This report summarizes vendor spend by actual cost
          {selectedTag && (
            <>
              {' '}
              for <span className="font-medium">{selectedTag}</span>
            </>
          )}
          .
          <br />
          There&apos;s an{' '}
          {nextMonthAmount > currentMonthAmount
            ? 'increase'
            : 'decrease'} of{' '}
          <span className="font-medium">
            {formatCurrencyAbbreviated(
              Math.abs(nextMonthAmount - currentMonthAmount),
              baseCurrency,
            )}
          </span>{' '}
          in spend next month
          {summaryChanges.length > 0 && (
            <>
              , driven by
              {summaryChanges.map((change, index) => (
                <span key={change.name}>
                  <span className="font-medium">
                    {' '}
                    {change.name}
                    <span
                      className={`font-normal ml-2 rounded p-1 font-label text-sm ${
                        change.change > 0
                          ? 'bg-[#B90C41] bg-opacity-10 text-[#B90C41]'
                          : 'bg-[#00A86B] bg-opacity-10 text-[#00A86B]'
                      }`}
                    >
                      {formatChangeAmount(change.change, currencySymbol)}
                    </span>
                  </span>
                  {getChangeSeparator(index, summaryChanges.length)}
                </span>
              ))}
            </>
          )}
          .
        </>
      ) : (
        <>
          This report summarizes the current and projected vendor monthly spend
          {selectedTag && (
            <>
              {' '}
              for <span className="font-medium">{selectedTag}</span>
            </>
          )}
          .
          <br />
          {Math.abs(changePercent) > 0 ? (
            <>
              Overall spend is{' '}
              {change >= 0 ? (
                <span className="font-medium">
                  up {formatPercentage(changePercent)} next month
                </span>
              ) : (
                <span className="font-medium">
                  down {formatPercentage(Math.abs(changePercent))} next month
                </span>
              )}
              {summaryChanges.length > 0 && (
                <>
                  , driven primarily by changes from
                  {summaryChanges.map((change, index) => (
                    <span key={change.name}>
                      <span className="font-medium">
                        {' '}
                        {change.name}
                        <span
                          className={`font-normal ml-2 rounded p-1 font-label text-sm ${
                            change.change > 0
                              ? 'bg-[#B90C41] bg-opacity-10 text-[#B90C41]'
                              : 'bg-[#00A86B] bg-opacity-10 text-[#00A86B]'
                          }`}
                        >
                          {formatChangeAmount(change.change, currencySymbol)}
                        </span>
                      </span>
                      {getChangeSeparator(index, summaryChanges.length)}
                    </span>
                  ))}
                </>
              )}
              .
            </>
          ) : (
            <>
              Overall spend remains <span className="font-medium">stable</span>{' '}
              next month.
            </>
          )}
        </>
      )}
    </>
  );
}

export default function MonthlyReportClient({
  amortizedData,
  actualCostData,
  alertRange = 90,
  contracts = [],
  enrichedContracts = [],
  priceHistories = [],
  upcomingRenewalsContracts = [],
  userMetadata,
  fxRates = [],
}: MonthlyReportClientProps) {
  const router = useRouter();
  const { baseCurrency } = useBaseCurrency();
  const searchParams = useSearchParams();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const titleContainerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const [viewMode, setViewMode] = useState<MonthlyReportViewMode>(() => {
    const viewParam = searchParams.get('view');
    return viewParam === 'actual' ? 'actual' : 'amortized';
  });

  const monthlyReportData =
    viewMode === 'actual' ? actualCostData : amortizedData;

  const {
    overview,
    spendByBusinessGroup,
    spendByBusinessSponsor,
    priceChanges,
    topVendorsBySpend,
  } = monthlyReportData;

  const handleViewModeChange = (newViewMode: MonthlyReportViewMode) => {
    setViewMode(newViewMode);
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', newViewMode);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Sync with browser back/forward navigation
  useEffect(() => {
    const viewParam = searchParams.get('view');
    const urlViewMode: MonthlyReportViewMode =
      viewParam === 'actual' ? 'actual' : 'amortized';
    if (urlViewMode !== viewMode) {
      setViewMode(urlViewMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!titleContainerRef.current || !titleRef.current) return;

    const ctx = gsap.context(() => {
      gsap.to(titleContainerRef.current, {
        height: 0,
        scrollTrigger: {
          trigger: document.body,
          start: 'top top',
          end: '+=100',
          scrub: 0.5,
        },
      });

      gsap.to(titleRef.current, {
        opacity: 0,
        scrollTrigger: {
          trigger: document.body,
          start: 'top top',
          end: '+=100',
          scrub: 0.5,
        },
      });
    });

    return () => ctx.revert();
  }, []);

  const filteredSpendByBusinessSponsor = useMemo(() => {
    if (!selectedTag) return spendByBusinessSponsor;

    return spendByBusinessSponsor
      .map((sponsor) => refilterParentRow(sponsor, selectedTag, baseCurrency))
      .filter((sponsor) => sponsor.subRows.length > 0);
  }, [spendByBusinessSponsor, selectedTag, baseCurrency]);

  const filteredRenewalsContracts = useMemo(() => {
    if (!selectedTag) return upcomingRenewalsContracts;

    return upcomingRenewalsContracts.filter((contract: any) => {
      return contract.tags?.some((tag: any) => tag.name === selectedTag);
    });
  }, [upcomingRenewalsContracts, selectedTag]);

  const filteredPriceChanges = useMemo(() => {
    if (!selectedTag) return priceChanges;

    return priceChanges.filter((item) => item.tags?.includes(selectedTag));
  }, [priceChanges, selectedTag]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();

    spendByBusinessSponsor.forEach((sponsor) => {
      sponsor.subRows?.forEach((vendor) => {
        vendor.tags?.forEach((tag) => tags.add(tag));
      });
    });

    spendByBusinessGroup.forEach((group) => {
      group.subRows?.forEach((vendor) => {
        vendor.tags?.forEach((tag) => tags.add(tag));
      });
    });

    priceChanges.forEach((item) => {
      item.tags?.forEach((tag) => tags.add(tag));
    });

    upcomingRenewalsContracts.forEach((contract: any) => {
      contract.tags?.forEach((tag: any) => tags.add(tag.name));
    });

    return Array.from(tags).sort();
  }, [
    spendByBusinessSponsor,
    spendByBusinessGroup,
    priceChanges,
    upcomingRenewalsContracts,
  ]);

  const filteredSpendByBusinessGroup = useMemo(() => {
    if (!selectedTag) return spendByBusinessGroup;

    return spendByBusinessGroup
      .map((group) => refilterParentRow(group, selectedTag, baseCurrency))
      .filter((group) => group.subRows.length > 0);
  }, [spendByBusinessGroup, selectedTag, baseCurrency]);

  const computedOverview = useMemo((): MonthlyReportOverview => {
    const currentMonthSpend = filteredSpendByBusinessSponsor.reduce(
      (total: number, sponsor: any) => {
        const sponsorTotal =
          sponsor.subRows?.reduce(
            (subtotal: number, vendor: any) =>
              subtotal + (vendor.currentMonth || 0),
            0,
          ) || 0;
        return total + sponsorTotal;
      },
      0,
    );

    const nextMonthSpend = filteredSpendByBusinessSponsor.reduce(
      (total: number, sponsor: any) => {
        const sponsorTotal =
          sponsor.subRows?.reduce(
            (subtotal: number, vendor: any) =>
              subtotal + (vendor.nextMonth || 0),
            0,
          ) || 0;
        return total + sponsorTotal;
      },
      0,
    );

    const change = nextMonthSpend - currentMonthSpend;
    const changePercent =
      currentMonthSpend > 0 ? (change / currentMonthSpend) * 100 : 0;

    const labelSuffix = viewMode === 'actual' ? '(Actual Cost)' : '(Amortized)';

    return {
      currentMonthSpend: {
        amount: currentMonthSpend,
        label: `Current Month Spend ${labelSuffix}`,
      },
      nextMonthSpend: {
        amount: nextMonthSpend,
        change: change,
        changePercent: changePercent,
        label: `Next Month Spend ${labelSuffix}`,
      },
    };
  }, [filteredSpendByBusinessSponsor, viewMode]);

  const summaryChanges = useMemo(() => {
    const vendorChanges = new Map<
      string,
      { name: string; change: number; currentMonth: number }
    >();

    filteredSpendByBusinessSponsor.forEach((sponsor) => {
      sponsor.subRows?.forEach((vendor) => {
        if (vendor.change !== 0) {
          const vendorName = extractVendorName(vendor.name);

          if (vendorChanges.has(vendorName)) {
            const existing = vendorChanges.get(vendorName)!;
            existing.change += vendor.change;
            existing.currentMonth += vendor.currentMonth;
          } else {
            vendorChanges.set(vendorName, {
              name: vendorName,
              change: vendor.change,
              currentMonth: vendor.currentMonth,
            });
          }
        }
      });
    });

    return Array.from(vendorChanges.values())
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 3);
  }, [filteredSpendByBusinessSponsor]);

  const filteredTopVendorsBySpend = useMemo(() => {
    if (!selectedTag) return topVendorsBySpend;

    const vendorSpendMap = new Map<string, number>();

    filteredSpendByBusinessSponsor.forEach((sponsor) => {
      sponsor.subRows?.forEach((vendor) => {
        const vendorName = extractVendorName(vendor.name);
        const currentSpend = vendorSpendMap.get(vendorName) || 0;
        vendorSpendMap.set(vendorName, currentSpend + vendor.currentMonth);
      });
    });

    const topVendors = Array.from(vendorSpendMap.entries())
      .map(([name, spend]) => ({ name, spend }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10);

    return topVendors;
  }, [topVendorsBySpend, filteredSpendByBusinessSponsor, selectedTag]);

  return (
    <div className="mt-6 space-y-8">
      <div className="sticky top-24 z-20 flex justify-between bg-background py-2 backdrop-blur-sm">
        <div className="space-y-2">
          <div
            ref={titleContainerRef}
            className="h-[45px] overflow-hidden leading-none"
          >
            <h1 ref={titleRef} className="font-serif">
              Monthly Budget Intelligence
            </h1>
          </div>
          <p className="font-label text-xs uppercase tracking-wider text-muted-foreground">
            {new Date().toLocaleDateString('en-US', { month: 'long' })}{' '}
            {new Date().getFullYear()}
          </p>
          <FxRateNote fxRates={fxRates} baseCurrency={baseCurrency} />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border-r pr-3">
            <Button
              size="sm"
              variant={viewMode === 'amortized' ? 'secondary' : 'outline'}
              onClick={() => handleViewModeChange('amortized')}
            >
              Amortized
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'actual' ? 'secondary' : 'outline'}
              onClick={() => handleViewModeChange('actual')}
            >
              Actual Cost
            </Button>
          </div>

          <TagFilter
            selectedTag={selectedTag}
            onTagSelect={setSelectedTag}
            availableTags={availableTags}
          />

          <ExportMonthlyReportButton
            monthlyReportData={{
              overview: computedOverview,
              spendByBusinessGroup: filteredSpendByBusinessGroup,
              spendByBusinessSponsor: filteredSpendByBusinessSponsor,
              priceChanges: filteredPriceChanges,
              upcomingRenewalsContracts: filteredRenewalsContracts,
              topVendorsBySpend: filteredTopVendorsBySpend,
            }}
            selectedTag={selectedTag}
            viewMode={viewMode}
          />
        </div>
      </div>

      <div className="space-y-16 py-0">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SummaryCard
            title={computedOverview.currentMonthSpend.label}
            amount={computedOverview.currentMonthSpend.amount}
            currency={baseCurrency}
            size="md"
            bgColor="from-navy/5 to-navy/15"
            className="h-32"
          />
          <SummaryCard
            title={computedOverview.nextMonthSpend.label}
            amount={computedOverview.nextMonthSpend.amount}
            currency={baseCurrency}
            previousAmount={computedOverview.currentMonthSpend.amount}
            size="md"
            bgColor="from-gray-700/5 to-gray-700/15"
            className="h-32"
          />
        </div>

        <div className="flex gap-6 font-serif text-xl leading-8 text-foreground/85">
          <div className="w-2 rounded-sm bg-blue-200 text-blue-600  dark:bg-blue-200/50"></div>
          <p className="max-w-6xl">
            <SummaryText
              selectedTag={selectedTag}
              changePercent={computedOverview.nextMonthSpend.changePercent}
              change={computedOverview.nextMonthSpend.change}
              summaryChanges={summaryChanges}
              viewMode={viewMode}
              currentMonthAmount={computedOverview.currentMonthSpend.amount}
              nextMonthAmount={computedOverview.nextMonthSpend.amount}
            />
          </p>
        </div>

        <MonthlyReportTables
          spendByBusinessGroup={filteredSpendByBusinessGroup}
          spendByBusinessSponsor={filteredSpendByBusinessSponsor}
          priceChanges={filteredPriceChanges}
          selectedTag={selectedTag}
          alertRange={alertRange}
          contracts={contracts}
          enrichedContracts={enrichedContracts}
          priceHistories={priceHistories}
          upcomingRenewalsContracts={filteredRenewalsContracts}
          userMetadata={userMetadata}
          viewMode={viewMode}
        />

        <div className="mt-8 space-y-6">
          <TableSectionHeader title="Vendors" description="" />
          <div className="space-y-4 rounded border border-border/60 bg-card/50 px-10 pb-16 pt-8 dark:bg-card">
            <div className="text-center font-label text-sm uppercase tracking-wider">
              Top {filteredTopVendorsBySpend.length} Vendor
              {filteredTopVendorsBySpend.length === 1 ? '' : 's'} By Monthly
              Spend{selectedTag ? ` - ${selectedTag}` : ''}
            </div>
            <div className="mx-auto w-full max-w-4xl">
              <MonthlyReportChart data={filteredTopVendorsBySpend} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
