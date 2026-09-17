'use client';

import { Suspense, useMemo, useState } from 'react';
import { ErrorBoundary } from 'next/dist/client/components/error-boundary';
import Link from 'next/link';
import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from 'nuqs';
import { AccountsTab } from '@/components/bloomberg-sid/AccountsTab';
import { CostsTab } from '@/components/bloomberg-sid/CostsTab';
import { DocumentsTab } from '@/components/bloomberg-sid/DocumentsTab';
import {
  ExchangeTab,
  type ExchangeView,
} from '@/components/bloomberg-sid/ExchangeTab';
import { OverviewTab } from '@/components/bloomberg-sid/OverviewTab';
import { AssignmentsTab } from '@/components/bloomberg-sid/AssignmentsTab';
import { ReportMonthPicker } from '@/components/bloomberg-sid/ReportMonthPicker';
import { SubscriptionsTab } from '@/components/bloomberg-sid/SubscriptionsTab';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import VendorIcon from '@/components/vendors/VendorIcon';
import type { SidReport } from '@/lib/v2/bloomberg-sid/report';
import {
  DEFAULT_SUBSCRIPTION_FILTERS,
  type SubscriptionFilters,
} from '@/lib/v2/bloomberg-sid/subscription-filters';
import { deriveSidReport } from '@/lib/v2/bloomberg-sid/transforms';

const BLOOMBERG_TABS = [
  'overview',
  'accounts',
  'subscriptions',
  'exchange',
  'assignments',
  'costs',
  'documents',
] as const;
type BloombergTab = (typeof BLOOMBERG_TABS)[number];
const isBloombergTab = (value: string): value is BloombergTab =>
  (BLOOMBERG_TABS as readonly string[]).includes(value);

export function BloombergSidView({
  vendor,
  report,
}: {
  vendor: { id: number; name: string; domain: string | null };
  report: SidReport;
}) {
  const derived = useMemo(() => deriveSidReport(report), [report]);
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsStringLiteral(BLOOMBERG_TABS).withDefault('overview'),
  );
  const [productParam] = useQueryState('product', parseAsString);
  const [renewingParam] = useQueryState('renewing', parseAsInteger);
  const [subFilters, setSubFilters] = useState<SubscriptionFilters>(() => ({
    ...DEFAULT_SUBSCRIPTION_FILTERS,
    product:
      productParam &&
      report.subscriptions.some((sub) => sub.gpttDescription === productParam)
        ? productParam
        : 'All',
    renewingWithinDays:
      renewingParam !== null && renewingParam > 0 ? renewingParam : null,
  }));
  const [exchangeView, setExchangeView] = useState<ExchangeView>('Aggregate');

  const iconName = vendor.name
    .replace(/ /g, '%20')
    .replace(/[.,]/g, '')
    .replace(/(ltd|inc|international%20sl)/gi, '');

  return (
    <div className="flex w-full flex-col gap-10">
      <div className="flex w-full flex-col gap-8">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/vendors">Vendors</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/vendors/${vendor.id}`}>{vendor.name}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Inventory</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex w-full flex-col gap-4">
          <div className="flex items-center gap-6">
            <ErrorBoundary errorComponent={() => <div>{vendor.name}</div>}>
              <Suspense fallback={<div className="h-16 w-16 rounded-sm" />}>
                <VendorIcon
                  name={iconName}
                  domain={vendor.domain ?? undefined}
                  width={64}
                  height={64}
                />
              </Suspense>
            </ErrorBoundary>
            <div className="flex w-full justify-between">
              <div className="flex flex-col gap-2">
                <h1 className="font-serif text-5xl">{vendor.name}</h1>
                <div className="font-sans-neue text-sm text-muted-foreground">
                  Firmwide ID {report.firmwideId} · {report.accounts.length}{' '}
                  entities
                </div>
              </div>
              <ReportMonthPicker
                value={report.selected.reportMonth}
                months={report.months}
              />
            </div>
          </div>
        </div>
      </div>

      <Tabs
        size="md"
        value={tab}
        onValueChange={(next) => {
          if (isBloombergTab(next)) void setTab(next);
        }}
        className="w-full"
      >
        <TabsList className="w-full justify-start border-b">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="subscriptions">
            Terminal Subscriptions
          </TabsTrigger>
          <TabsTrigger value="exchange">Exchange Entitlements</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-12">
          <OverviewTab
            summary={derived.summary}
            reportMonth={report.selected.reportMonth}
          />
        </TabsContent>
        <TabsContent value="accounts" className="pt-6">
          <AccountsTab rows={derived.entityRollup} />
        </TabsContent>
        <TabsContent value="subscriptions" className="pt-6">
          <SubscriptionsTab
            subscriptions={report.subscriptions}
            accounts={report.accounts}
            accountsByCustNum={derived.accountsByCustNum}
            allocationsBySid={derived.allocationsBySid}
            hrMatches={report.hrMatches}
            filters={subFilters}
            setFilters={setSubFilters}
          />
        </TabsContent>
        <TabsContent value="exchange" className="pt-6">
          <ExchangeTab
            aggregates={derived.aggregates}
            allocations={derived.allocations}
            accounts={report.accounts}
            accountsByCustNum={derived.accountsByCustNum}
            subscriptions={report.subscriptions}
            view={exchangeView}
            onSetView={setExchangeView}
          />
        </TabsContent>
        <TabsContent value="assignments" className="pt-6">
          <AssignmentsTab
            subscriptions={report.subscriptions}
            accounts={report.accounts}
            accountsByCustNum={derived.accountsByCustNum}
            allocationsBySid={derived.allocationsBySid}
            hrMatches={report.hrMatches}
          />
        </TabsContent>
        <TabsContent value="costs" className="pt-6">
          <CostsTab
            summary={derived.summary}
            reportMonth={report.selected.reportMonth}
            subscriptions={report.subscriptions}
            accountsByCustNum={derived.accountsByCustNum}
            allocationsBySid={derived.allocationsBySid}
            hrMatches={report.hrMatches}
          />
        </TabsContent>
        <TabsContent value="documents" className="pt-6">
          <DocumentsTab
            files={report.files}
            reportMonth={report.selected.reportMonth}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
