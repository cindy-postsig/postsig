import { notFound } from 'next/navigation';
import {
  getInvPortfolioCompany,
  getInvMissingDocuments,
  getInvBoardSeatIds,
  getInvCorporateEventsForCompany,
} from '@/lib/v2/inv';
import { getCompanyDocuments } from '@/lib/v2/investor/service';
import {
  getCompanyCustomKpis,
  getCompanyDomainInfo,
  getCompanyReporting,
  getCompanyReportingRequests,
  getCompanyStandardKpiOverrides,
  getKpis,
  getReportingDocTypes,
} from '@/lib/v2/kpis/service';
import { getKpiEvents } from '@/lib/v2/kpis/events';
import { getCompanyActivityFeed } from '@/lib/v2/inv/activities';
import { getUserMetadata } from '@/data/users';
import { NotFoundError } from '@/lib/errors';
import logger from '@/utils/pino';
import { CompanyDetails, type CompanyKpisPromises } from './CompanyDetails';
import { CompanyHeader } from './CompanyHeader';
import { RoundFilterProvider } from './RoundFilterContext';
import { RoundFilterBanner } from './RoundFilterBanner';

interface ServerComponentProps {
  id: string;
}

/**
 * Async Server Component for CompanyHeader.
 * Fetches company data from inv_* schema and renders the header.
 * Handles NotFoundError by triggering Next.js notFound().
 */
export async function CompanyHeaderServer({ id }: ServerComponentProps) {
  try {
    const [{ company }, corporateEvents] = await Promise.all([
      getInvPortfolioCompany(id),
      getInvCorporateEventsForCompany(id),
    ]);
    return (
      <CompanyHeader company={company} corporateEvents={corporateEvents} />
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }
}

/**
 * Async Server Component for CompanyDetails.
 * Fetches company from inv_* schema and documents from legacy system.
 * Documents may be empty if company hasn't been migrated to inv_* with document links.
 */
export async function CompanyDetailsServer({ id }: ServerComponentProps) {
  try {
    const [{ company, overrides }, userMetadata] = await Promise.all([
      getInvPortfolioCompany(id),
      getUserMetadata(),
    ]);

    // The KPIs tab is unreachable without the portco module, so skip its queries
    // entirely rather than fetching data no one can navigate to.
    const kpis: CompanyKpisPromises | null = userMetadata?.portcoKpisEnabled
      ? {
          reporting: getCompanyReporting(company.entityId),
          domainInfo: getCompanyDomainInfo(company.entityId),
          pendingRequests: getCompanyReportingRequests(company.entityId),
          catalog: getKpis(),
          fullCatalog: getKpis({ includeHidden: true }),
          docTypes: getReportingDocTypes(),
          custom: getCompanyCustomKpis(company.entityId),
          standardOverrides: getCompanyStandardKpiOverrides(company.entityId),
          events: getKpiEvents(company.entityId),
        }
      : null;

    // Only `company` is needed for the initial (Overview) render. The data below
    // feeds just the Documents and KPIs tabs, so kick it off without awaiting and
    // stream it into those tabs — Overview paints without blocking on it.
    const documentsPromise = getCompanyDocuments(company.entityId)
      .then((result) => result.documents)
      .catch((docError) => {
        logger.warn(
          { error: docError, companyId: company.entityId },
          'Failed to fetch company documents, continuing without documents',
        );
        return [];
      });

    const missingDocsPromise = getInvMissingDocuments({
      companyId: company.entityId,
    })
      .then((result) => {
        const row = result.companies.find(
          (c) => c.companyId === company.entityId,
        );
        return row?.missingDocTypes ?? [];
      })
      .catch((err) => {
        logger.warn(
          { error: err, companyId: company.entityId },
          'Failed to fetch missing docs, continuing without them',
        );
        return [];
      });

    // Gather entity IDs belonging to this company for the activity feed:
    // transaction IDs + latest cap-table snapshot ID + board seat IDs + the
    // legal-terms source rows (inv_information_rights / inv_round_terms /
    // inv_security_terms). An id missing here means edits to that row never
    // appear in the Audit Log. Board seat IDs include soft-deleted (ended) seats
    // so a removed member's prior field-edit overrides remain visible.
    const boardSeatIds = await getInvBoardSeatIds(company.entityId);
    const legalTermsIds = [
      overrides.legalTerms.informationRightsId,
      overrides.legalTerms.roundTermsId,
      overrides.legalTerms.securityTermsId,
    ].filter((id): id is number => id != null);
    const companyEntityIds: number[] = Array.from(
      new Set<number>([
        company.entityId,
        ...(company.transactions ?? [])
          .map((tx) => tx.id)
          .filter((id): id is number => id != null),
        ...(overrides.latestSnapshotId != null
          ? [overrides.latestSnapshotId]
          : []),
        ...boardSeatIds,
        ...legalTermsIds,
      ]),
    );

    return (
      <CompanyDetails
        company={company}
        documentsPromise={documentsPromise}
        missingDocsPromise={missingDocsPromise}
        kpis={kpis}
        overrides={overrides}
        activityFeedPromise={getCompanyActivityFeed(
          companyEntityIds,
          company.entityId,
        )}
      />
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }
}

/**
 * Async Server Component that provides the RoundFilterProvider wrapper.
 * Fetches company to get financing rounds and wraps children in the provider.
 */
export async function RoundFilterServer({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  try {
    const { company } = await getInvPortfolioCompany(id);
    const financingRounds = company.financingRounds ?? [];

    // Deduplicate financing rounds by stageName (keep first/most relevant per stage)
    const seenStages = new Map<string, (typeof financingRounds)[number]>();
    for (const round of financingRounds) {
      const key = round.stageName.trim().toLowerCase();
      if (!seenStages.has(key)) {
        seenStages.set(key, round);
      }
    }
    const dedupedFinancingRounds = Array.from(seenStages.values());

    // Also derive rounds from transaction stages that aren't in financingRounds
    const existingStageNames = new Set(
      dedupedFinancingRounds.map((r) => r.stageName.trim().toLowerCase()),
    );
    const transactionStages = (company.transactions ?? [])
      .filter(
        (tx) =>
          tx.stage && !existingStageNames.has(tx.stage.trim().toLowerCase()),
      )
      .reduce<Map<string, { stage: string; date: string }>>((acc, tx) => {
        const key = tx.stage!.trim().toLowerCase();
        if (!acc.has(key)) {
          acc.set(key, { stage: tx.stage!, date: tx.date });
        }
        return acc;
      }, new Map());

    // Create synthetic round entries for stages only found in transactions
    let syntheticId = -1;
    const syntheticRounds = Array.from(transactionStages.values()).map(
      ({ stage, date }) => ({
        id: syntheticId--,
        name: stage,
        stageCode: stage.toLowerCase().replace(/\s+/g, '_'),
        stageName: stage,
        date,
      }),
    );

    // Include terminal company stages (Dissolved, Acquired, Merged, Winding Down)
    // as filterable options if not already present
    const terminalStages = new Set([
      'dissolved',
      'acquired',
      'merged',
      'winding down',
    ]);
    const allStageKeys = new Set([
      ...existingStageNames,
      ...transactionStages.keys(),
    ]);
    if (
      company.stage &&
      terminalStages.has(company.stage.trim().toLowerCase()) &&
      !allStageKeys.has(company.stage.trim().toLowerCase())
    ) {
      syntheticRounds.push({
        id: syntheticId--,
        name: company.stage,
        stageCode: company.stage.toLowerCase().replace(/\s+/g, '_'),
        stageName: company.stage,
        date: company.lastTransactionDate ?? '',
      });
    }

    const rounds = [...dedupedFinancingRounds, ...syntheticRounds];

    return (
      <RoundFilterProvider rounds={rounds}>
        <RoundFilterBanner />
        {children}
      </RoundFilterProvider>
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }
}
