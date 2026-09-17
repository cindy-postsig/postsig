'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api/v2-client';
import { useToast } from '@/components/ui/use-toast';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/app/(app)/(investor)/investor/components/tabs';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useCanManageKpis } from '@/hooks/useCanManageKpis';
import type {
  CompanyCustomKpi,
  KpiDefinition,
  KpiEvent,
  PendingRequest,
  ReportingDocTypeOption,
  ReportingQuarter,
  StandardKpiOverride,
} from '@/lib/v2/kpis/types';
import {
  ReportingRequestDialog,
  type RequestType,
} from './ReportingRequestDialog';
import { TabHeader, SubTabCount } from './companyDetailsPrimitives';
import { KpiPerformanceTab } from './KpiPerformanceTab';
import { ReportingPacksTab } from './ReportingPacksTab';
import { PendingRequestsTab } from './PendingRequestsTab';
import { KpiUpdatesTab } from './KpiUpdatesTab';

export function KpisContent({
  quarters,
  pendingRequests,
  companyId,
  companyDomain,
  suggestedDomain,
  kpiCatalog,
  kpiFullCatalog,
  docTypes,
  initialCustomKpis,
  initialStandardOverrides,
  kpiEvents,
}: {
  quarters: ReportingQuarter[];
  pendingRequests: PendingRequest[];
  companyId: number;
  companyDomain: string | null;
  suggestedDomain: string | null;
  kpiCatalog: KpiDefinition[];
  kpiFullCatalog: KpiDefinition[];
  docTypes: ReportingDocTypeOption[];
  initialCustomKpis: CompanyCustomKpi[];
  initialStandardOverrides: StandardKpiOverride[];
  kpiEvents: KpiEvent[];
}) {
  const canManageKpis = useCanManageKpis();
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestType, setRequestType] = useState<RequestType>('kpi');
  const [editRequest, setEditRequest] = useState<PendingRequest | null>(null);

  // Edits made in the KPIs tab must show up when switching to Updates without
  // a reload, so the server-fetched feed is refreshed on every tab open. A
  // failed refresh keeps the last known feed.
  const [events, setEvents] = useState<KpiEvent[]>(kpiEvents);
  useEffect(() => setEvents(kpiEvents), [kpiEvents]);
  const refreshEvents = useCallback(() => {
    apiClient.reporting
      .listKpiEvents(companyId)
      .then(({ kpiEvents: next }) => setEvents(next))
      .catch((error) => {
        console.warn('Failed to refresh KPI events', { error, companyId });
      });
  }, [companyId]);

  // KPI values state lives here, not in KpiPerformanceTab: tab content
  // unmounts on sub-tab switches, and remounting from the server-fetched
  // initial props would show stale values after an edit until a full reload.
  const { toast } = useToast();
  const [customKpis, setCustomKpis] =
    useState<CompanyCustomKpi[]>(initialCustomKpis);
  const [standardOverrides, setStandardOverrides] = useState<
    StandardKpiOverride[]
  >(initialStandardOverrides);
  useEffect(() => setCustomKpis(initialCustomKpis), [initialCustomKpis]);
  useEffect(
    () => setStandardOverrides(initialStandardOverrides),
    [initialStandardOverrides],
  );
  // Saves on multiple cells can overlap; only the latest request may write
  // state, or an older response resolving late would revert to stale values.
  const refreshKpisRequestId = useRef(0);
  const refreshKpis = useCallback(() => {
    const requestId = ++refreshKpisRequestId.current;
    apiClient.reporting
      .listCustomKpis(companyId)
      .then(({ customKpis: nextCustom, standardOverrides: nextOverrides }) => {
        if (requestId !== refreshKpisRequestId.current) return;
        setCustomKpis(nextCustom);
        setStandardOverrides(nextOverrides);
      })
      .catch((error) => {
        if (requestId !== refreshKpisRequestId.current) return;
        console.warn('Failed to refresh KPIs', { error, companyId });
        toast({
          variant: 'destructive',
          title: 'Could not refresh KPIs',
          description: 'Reload the page to see the latest values.',
        });
      });
  }, [companyId, toast]);

  const submitted = useMemo(
    () => quarters.filter((q) => q.submittedAt != null),
    [quarters],
  );

  const docQuarters = useMemo(
    () => submitted.filter((q) => q.documents.length > 0),
    [submitted],
  );

  const openRequest = (type: RequestType) => {
    setEditRequest(null);
    setRequestType(type);
    setRequestOpen(true);
  };

  const openView = (req: PendingRequest) => {
    setEditRequest(req);
    setRequestType(req.requestType);
    setRequestOpen(true);
  };

  // KPIs open by default: the quarterly table lets investors enter values
  // manually even before a company has submitted anything.
  const defaultSubTab = 'kpis';

  return (
    <div className="space-y-12 pb-12">
      <ReportingRequestDialog
        open={requestOpen}
        onOpenChange={(open) => {
          setRequestOpen(open);
          if (!open) setEditRequest(null);
        }}
        requestType={requestType}
        editRequest={editRequest}
        companyId={companyId}
        storedDomain={companyDomain}
        suggestedDomain={suggestedDomain}
        kpiCatalog={kpiCatalog}
        docTypes={docTypes}
        pendingRequests={pendingRequests}
      />

      <TabHeader
        title="KPIs"
        action={
          <>
            {canManageKpis && (
              <Button variant="ghost" size="sm" className="font-normal" asChild>
                <Link href="/investor/settings/kpis">Settings</Link>
              </Button>
            )}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="!pl-3">
                  Request
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openRequest('kpi')}>
                  Request KPIs
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openRequest('reporting_pack')}>
                  Request Reporting Pack
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <Tabs
        defaultValue={defaultSubTab}
        onValueChange={(tab) => {
          if (tab === 'updates') refreshEvents();
        }}
        className="space-y-8"
      >
        <TabsList variant="line">
          <TabsTrigger value="kpis">KPIs</TabsTrigger>
          <TabsTrigger value="packs">
            Reporting Packs
            <SubTabCount value={docQuarters.length} />
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending Requests
            <SubTabCount value={pendingRequests.length} accent />
          </TabsTrigger>
          <TabsTrigger value="updates">
            Updates
            <SubTabCount value={events.length} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kpis" className="space-y-3">
          <KpiPerformanceTab
            submitted={submitted}
            companyId={companyId}
            kpiCatalog={kpiCatalog}
            customKpis={customKpis}
            standardOverrides={standardOverrides}
            refreshKpis={refreshKpis}
          />
        </TabsContent>

        <TabsContent value="packs" className="mt-0 space-y-3">
          <ReportingPacksTab docQuarters={docQuarters} />
        </TabsContent>

        <TabsContent value="pending" className="mt-0 space-y-3">
          <PendingRequestsTab
            pendingRequests={pendingRequests}
            onView={openView}
          />
        </TabsContent>

        <TabsContent value="updates" className="mt-0 space-y-3">
          {/* Full catalog (incl. hidden KPIs) so audited edits to a since-hidden
              KPI still resolve its value formatting. */}
          <KpiUpdatesTab kpiEvents={events} kpiCatalog={kpiFullCatalog} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
