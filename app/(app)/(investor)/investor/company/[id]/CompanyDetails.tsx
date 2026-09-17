'use client';

import React, { Suspense, use, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import type { PortfolioCompany } from '../../types';
import type { VentureDocumentRow } from '@/lib/v2/investor/service';
import type {
  CompanyCustomKpi,
  KpiDefinition,
  KpiEvent,
  PendingRequest,
  ReportingDocTypeOption,
  ReportingQuarter,
  StandardKpiOverride,
} from '@/lib/v2/kpis/types';
import type { InvPortfolioCompanyResult } from '@/lib/v2/inv';
import { useRoundFilter } from './RoundFilterContext';
import {
  getVisibleCompanyTabItems,
  DEFAULT_COMPANY_TAB,
  type CompanyTabKey,
} from './companyTabs';
import {
  filterCompanyByRound,
  filterCapTableByRound,
  filterCoInvestorsByRound,
  filterLiqPrefByRound,
  filterLegalTermsByRound,
} from './companyRoundFilters';
import { CoInvestorsContent } from './CoInvestorsContent';
import { LiqPrefContent } from './LiqPrefContent';
import { LegalTermsContent } from './LegalTermsContent';
import type { MissingDocumentInfo } from './DocumentsContent';
import { CompanyDetailsLoading } from './skeletons';
import { useMissingDocsCount } from './MissingDocsCountContext';
import type { ActivityFeedItem } from '@/lib/v2/inv/activities';

const OverviewContent = dynamic(
  () => import('./OverviewContent').then((mod) => mod.OverviewContent),
  { ssr: false },
);

const CapTableContent = dynamic(
  () => import('./CapTableContent').then((mod) => mod.CapTableContent),
  { ssr: false },
);

const DocumentsContent = dynamic(
  () => import('./DocumentsContent').then((mod) => mod.DocumentsContent),
  { ssr: false },
);

const KpisContent = dynamic(
  () => import('./KpisContent').then((mod) => mod.KpisContent),
  { ssr: false },
);

const ActivityContent = dynamic(
  () => import('./ActivityContent').then((mod) => mod.ActivityContent),
  { ssr: false },
);

type CompanyOverrides = InvPortfolioCompanyResult['overrides'];

type CompanyDomainInfo = {
  companyDomain: string | null;
  suggestedDomain: string | null;
};

/** Null when the org lacks the portco module — the KPIs tab is hidden entirely. */
export interface CompanyKpisPromises {
  reporting: Promise<ReportingQuarter[]>;
  domainInfo: Promise<CompanyDomainInfo>;
  pendingRequests: Promise<PendingRequest[]>;
  catalog: Promise<KpiDefinition[]>;
  fullCatalog: Promise<KpiDefinition[]>;
  docTypes: Promise<ReportingDocTypeOption[]>;
  custom: Promise<CompanyCustomKpi[]>;
  standardOverrides: Promise<StandardKpiOverride[]>;
  events: Promise<KpiEvent[]>;
}

interface CompanyDetailsProps {
  company: PortfolioCompany;
  documentsPromise: Promise<VentureDocumentRow[]>;
  missingDocsPromise: Promise<MissingDocumentInfo[]>;
  kpis: CompanyKpisPromises | null;
  overrides?: CompanyOverrides;
  activityFeedPromise: Promise<ActivityFeedItem[]>;
}

function DocumentsPanel({
  documentsPromise,
  missingDocsPromise,
  companyName,
}: {
  documentsPromise: Promise<VentureDocumentRow[]>;
  missingDocsPromise: Promise<MissingDocumentInfo[]>;
  companyName: string;
}) {
  return (
    <DocumentsContent
      documents={use(documentsPromise)}
      companyName={companyName}
      missingDocs={use(missingDocsPromise)}
    />
  );
}

function MissingDocsCountSync({
  missingDocsPromise,
}: {
  missingDocsPromise: Promise<MissingDocumentInfo[]>;
}) {
  const missingDocs = use(missingDocsPromise);
  const { setCount } = useMissingDocsCount();
  useEffect(() => {
    setCount(missingDocs.length);
    return () => setCount(0);
  }, [missingDocs.length, setCount]);
  return null;
}

function KpisPanel({
  kpis,
  companyId,
}: {
  kpis: CompanyKpisPromises;
  companyId: PortfolioCompany['entityId'];
}) {
  const domainInfo = use(kpis.domainInfo);
  return (
    <KpisContent
      quarters={use(kpis.reporting)}
      pendingRequests={use(kpis.pendingRequests)}
      companyId={companyId}
      companyDomain={domainInfo.companyDomain}
      suggestedDomain={domainInfo.suggestedDomain}
      kpiCatalog={use(kpis.catalog)}
      kpiFullCatalog={use(kpis.fullCatalog)}
      docTypes={use(kpis.docTypes)}
      initialCustomKpis={use(kpis.custom)}
      initialStandardOverrides={use(kpis.standardOverrides)}
      kpiEvents={use(kpis.events)}
    />
  );
}

function ActivityPanel({
  activityFeedPromise,
  fundMap,
  seatKindMap,
}: {
  activityFeedPromise: Promise<ActivityFeedItem[]>;
  fundMap?: Record<number, string>;
  seatKindMap?: Record<number, 'director' | 'observer'>;
}) {
  return (
    <ActivityContent
      feed={use(activityFeedPromise)}
      fundMap={fundMap}
      seatKindMap={seatKindMap}
    />
  );
}

export function CompanyDetails({
  company,
  documentsPromise,
  missingDocsPromise,
  kpis,
  overrides,
  activityFeedPromise,
}: CompanyDetailsProps) {
  const { selectedRound, rounds } = useRoundFilter();

  const viewParam = useSearchParams().get('view');
  const activeView: CompanyTabKey = getVisibleCompanyTabItems(
    kpis !== null,
  ).some((t) => t.key === viewParam)
    ? (viewParam as CompanyTabKey)
    : DEFAULT_COMPANY_TAB;

  const filteredCompany = useMemo(() => {
    if (selectedRound === 'all') return company;
    return filterCompanyByRound(company, selectedRound, rounds);
  }, [company, selectedRound, rounds]);

  const filteredCapTable = useMemo(() => {
    if (selectedRound === 'all') return company.capTable;
    return filterCapTableByRound(company.capTable, selectedRound, rounds);
  }, [company.capTable, selectedRound, rounds]);

  const filteredLiqPref = useMemo(() => {
    if (selectedRound === 'all') return company.liqPrefData;
    return filterLiqPrefByRound(company.liqPrefData, rounds, selectedRound);
  }, [company.liqPrefData, rounds, selectedRound]);

  const filteredLegalTerms = useMemo(() => {
    if (selectedRound === 'all') return company.legalTerms;
    return filterLegalTermsByRound(
      company.legalTerms,
      company.legalTermsByRound,
      rounds,
      selectedRound,
    );
  }, [company.legalTerms, company.legalTermsByRound, rounds, selectedRound]);

  const filteredCoInvestors = useMemo(() => {
    if (selectedRound === 'all') return company.coInvestors;
    return filterCoInvestorsByRound(company.coInvestors, selectedRound);
  }, [company.coInvestors, selectedRound]);

  const contentByKey: Record<CompanyTabKey, React.ReactNode> = {
    overview: (
      // Override lineage (latestSnapshotId, valuation fields) describes the
      // unfiltered company; passing it alongside round-filtered data would aim
      // edits at the wrong snapshot. Only wire overrides in the 'all' view.
      <OverviewContent
        company={filteredCompany}
        overrides={selectedRound === 'all' ? overrides : undefined}
        investorStatus={overrides?.investorStatus}
      />
    ),
    'co-investors': (
      <CoInvestorsContent
        coInvestors={filteredCoInvestors}
        companyName={company.name}
      />
    ),
    'cap-table': (
      <CapTableContent capTable={filteredCapTable} companyName={company.name} />
    ),
    'liq-pref': (
      <LiqPrefContent
        liqPrefData={filteredLiqPref}
        companyName={company.name}
      />
    ),
    legal: (
      // Override lineage points at the latest source rows, which describe the
      // unfiltered company; passing it alongside round-filtered data would aim
      // edits at the wrong row. Only wire it in the 'all' view.
      <LegalTermsContent
        legalTerms={filteredLegalTerms}
        legalTermsEdit={
          selectedRound === 'all' ? overrides?.legalTerms : undefined
        }
      />
    ),
    documents: (
      <Suspense fallback={<CompanyDetailsLoading />}>
        <DocumentsPanel
          documentsPromise={documentsPromise}
          missingDocsPromise={missingDocsPromise}
          companyName={company.name}
        />
      </Suspense>
    ),
    kpis: kpis && (
      <Suspense fallback={<CompanyDetailsLoading />}>
        <KpisPanel kpis={kpis} companyId={company.entityId} />
      </Suspense>
    ),
    'audit-logs': (
      <Suspense fallback={<CompanyDetailsLoading />}>
        <ActivityPanel
          activityFeedPromise={activityFeedPromise}
          fundMap={Object.fromEntries(
            (company.funds ?? []).map((f) => [f.id, f.shortName || f.name]),
          )}
          seatKindMap={Object.fromEntries([
            ...(company.boardOfDirectors ?? [])
              .filter((m) => m.id != null)
              .map((m) => [m.id, 'director' as const]),
            ...(company.boardObservers ?? [])
              .filter((o) => o.id != null)
              .map((o) => [o.id, 'observer' as const]),
          ])}
        />
      </Suspense>
    ),
  };

  return (
    <div className="w-full px-12 pb-10 pt-6">
      <Suspense>
        <MissingDocsCountSync missingDocsPromise={missingDocsPromise} />
      </Suspense>
      {contentByKey[activeView]}
    </div>
  );
}
