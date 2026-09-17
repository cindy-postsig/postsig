/**
 * Investor Portfolio Service (inv_* schema)
 *
 * Data fetching service for the new inv_* database schema.
 * Provides functions to fetch portfolio companies and related data.
 */

import { cache } from 'react';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { getMcpContext } from '@/app/lib/mcp/context';
import { getUserMetadata } from '@/data/users';
import { DatabaseError, NotFoundError } from '@/lib/errors';
import logger from '@/utils/pino';
import { MODULE_DOCUMENT_STATUS_IDS } from '@/constants/moduleDocumentStatuses';
import { fetchCompanyEnrichment } from '@/lib/v2/companies/enrichment';

// MCP routes are bearer-auth'd with no Supabase session cookie, so the
// cookie client returns anon and RLS blocks every inv_* query. Swap to
// the service client in that context — every query in this file already
// scopes by organization_id, so app-layer isolation stays intact.
async function createClient() {
  if (getMcpContext()) {
    return createServiceClient();
  }
  return await createServerClient();
}

import type { Json } from '@/database.types';
import type { PortfolioCompany } from './types';
import { getActiveValueOverrides } from './overrides/fetchOverrides';
import {
  applyOverrides,
  type AppliedOverrideMeta,
  type OverrideMetadataByEntity,
  type ValueOverrideRow,
} from './overrides/applyOverrides';
import {
  mergeValuationOverrides,
  type PositionTransactionRow,
  type ValuationOverrides,
  type ValuationSnapshotRow,
} from './overrides/mergeValuation';
import type {
  InvCompany,
  InvCompanyResult,
  InvCompaniesResult,
  InvCompanyValuation,
  InvCompanyValuationResult,
  InvCapTableSnapshot,
  InvCapTableSnapshotResult,
  InvTransaction,
  InvTransactionsResult,
  InvBoardSeat,
  InvBoardCompositionResult,
  InvInvestorStatusResult,
  InvSecurity,
  InvSecuritiesResult,
  InvFinancingRound,
  InvInformationRights,
  InvRoundTerms,
  InvRoundTermsRow,
  InvSecurityTerms,
  InvLegalTermsResult,
  InvFund,
  InvFundsResult,
  InvCapTableSnapshotRow,
  InvEquityPlanSnapshot,
  InvEquityPlanSnapshotsResult,
  InvCoInvestor,
  InvCoInvestorNetworkEntry,
  InvCoInvestorsResult,
  MissingDocumentCompanyRow,
  MissingDocumentsResult,
  InvestorStatusOverrideContext,
  LegalTermsOverrideContext,
  InvCorporateEventCounterpart,
  InvCorporateEventRole,
  InvCorporateEventSummary,
  InvCorporateEventType,
} from './types';
import {
  pickLatestSnapshot,
  transformInvToPortfolioCompany,
  toOverriddenLegalTermsKeys,
} from './transforms';
import {
  IRR_INFLOW_TYPES,
  IRR_OUTFLOW_TYPES,
  POSITION_COST_TRANSACTION_TYPES,
} from './stage-utils';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Maps inv_company + inv_companies database rows to InvCompany type.
 */
function mapToInvCompany(row: {
  id: number;
  public_id: string;
  organization_id: string;
  company_id: number;
  status: string;
  sector: string | null;
  tags: string[] | null;
  notes: string | null;
  investment_thesis: string | null;
  contact_person: string | null;
  contact_email: string | null;
  external_id: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
  name_override: string | null;
  inv_companies: {
    name: string;
    domain: string | null;
    industry: string | null;
    headquarters: string | null;
    description: string | null;
    founded_year: number | null;
    legal_name: string | null;
    legal_jurisdiction: string | null;
    entity_type: string | null;
  } | null;
  stage: {
    code: string;
    display_name: string;
  } | null;
  entry_stage: {
    code: string;
    display_name: string;
  } | null;
}): InvCompany {
  const globalCompany = row.inv_companies;

  return {
    id: row.id,
    publicId: row.public_id,
    organizationId: row.organization_id,
    companyId: row.company_id,
    status: row.status,
    sector: row.sector,
    tags: row.tags,
    notes: row.notes,
    investmentThesis: row.investment_thesis,
    contactPerson: row.contact_person,
    contactEmail: row.contact_email,
    externalId: row.external_id,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Apply COALESCE logic: prefer name_override, fall back to global name
    name: row.name_override ?? globalCompany?.name ?? 'Unknown Company',
    nameOverride: row.name_override,
    domain: globalCompany?.domain ?? null,
    industry: globalCompany?.industry ?? null,
    headquarters: globalCompany?.headquarters ?? null,
    description: globalCompany?.description ?? null,
    foundedYear: globalCompany?.founded_year ?? null,
    legalName: globalCompany?.legal_name ?? null,
    legalJurisdiction: globalCompany?.legal_jurisdiction ?? null,
    entityType: globalCompany?.entity_type ?? null,
    stageCode: row.stage?.code ?? null,
    stageDisplayName: row.stage?.display_name ?? null,
    entryStageCode: row.entry_stage?.code ?? null,
    entryStageDisplayName: row.entry_stage?.display_name ?? null,
  };
}

/**
 * Column-named projection of the editable Company Details fields.
 */
interface InvCompanyOverrideRow {
  id: number;
  industry: string | null;
  domain: string | null;
  sector: string | null;
  headquarters: string | null;
  founded_year: number | null;
  entity_type: string | null;
  legal_jurisdiction: string | null;
}

function toCompanyOverrideRow(company: InvCompany): InvCompanyOverrideRow {
  return {
    id: company.id,
    industry: company.industry,
    domain: company.domain,
    sector: company.sector,
    headquarters: company.headquarters,
    founded_year: company.foundedYear,
    entity_type: company.entityType,
    legal_jurisdiction: company.legalJurisdiction,
  };
}

function fromCompanyOverrideRow(
  company: InvCompany,
  row: InvCompanyOverrideRow,
): InvCompany {
  return {
    ...company,
    industry: row.industry,
    domain: row.domain,
    sector: row.sector,
    headquarters: row.headquarters,
    foundedYear: row.founded_year,
    entityType: row.entity_type,
    legalJurisdiction: row.legal_jurisdiction,
  };
}

/** Merge active inv_company overrides into mapped companies, preserving order. */
function applyInvCompanyOverrides(
  companies: readonly InvCompany[],
  overrides: readonly ValueOverrideRow[],
): { companies: InvCompany[]; overridden: OverrideMetadataByEntity } {
  const merged = applyOverrides(
    'inv_company',
    companies.map(toCompanyOverrideRow),
    overrides,
  );
  return {
    companies: companies.map((company, i) =>
      fromCompanyOverrideRow(company, merged.rows[i]),
    ),
    overridden: merged.overridden,
  };
}

function applyCompanyDetailOverrides(
  company: InvCompany,
  overrides: readonly ValueOverrideRow[],
): {
  company: InvCompany;
  overridden: Record<string, AppliedOverrideMeta>;
} {
  const merged = applyInvCompanyOverrides([company], overrides);
  return {
    company: merged.companies[0] ?? company,
    overridden: merged.overridden[company.id] ?? {},
  };
}

/**
 * Latest snapshot's implied valuation for a financing round, plus the id of the
 * snapshot it came from. The id lets the transactions table reflect a PMV
 * override: a tx whose post-money is sourced from the company's latest snapshot
 * (the only overridable one) should show the overridden value.
 */
function getLatestImpliedValuation(
  snapshots: Array<
    Pick<InvCapTableSnapshotRow, 'id' | 'snapshot_date' | 'implied_valuation'>
  >,
): { value: number | null; snapshotId: number | null } {
  // Canonical latest-snapshot rule: see pickLatestSnapshot in transforms.ts.
  const latest = [...snapshots].sort((a, b) => {
    const byDate = (b.snapshot_date ?? '').localeCompare(a.snapshot_date ?? '');
    if (byDate !== 0) return byDate;
    return (b.id ?? 0) - (a.id ?? 0);
  })[0];
  // Only report a snapshot reference when it actually carries a valuation; a
  // null implied_valuation isn't snapshot-backed, so don't mark it as such.
  if (latest?.implied_valuation == null) {
    return { value: null, snapshotId: null };
  }
  return { value: latest.implied_valuation, snapshotId: latest.id };
}

/**
 * Maps v_inv_company_valuation view row to InvCompanyValuation type.
 */
function mapToInvCompanyValuation(row: {
  company_id: number | null;
  global_company_id: number | null;
  organization_id: string | null;
  company_name: string | null;
  company_domain: string | null;
  sector: string | null;
  industry: string | null;
  headquarters: string | null;
  status: string | null;
  my_fmv: number | null;
  multiple: number | null;
  aggregate_cost: number | null;
  realized_proceeds?: number | null;
  ownership_pct: number | null;
  my_fd_pct: number | null;
  my_units: number | null;
  post_money_valuation: number | null;
  current_price_unit: number | null;
  fully_diluted_total: number | null;
  total_equity_financing: number | null;
  last_transaction_date: string | null;
  snapshot_date: string | null;
  // Entry transaction data (added by migration)
  entry_date?: string | null;
  entry_amount?: number | null;
  entry_stage_code?: string | null;
  entry_stage_display_name?: string | null;
  // Current stage data (from latest purchase transaction)
  current_stage_code?: string | null;
  current_stage_display_name?: string | null;
  // Fund data (added by migration)
  fund_ids?: number[] | null;
  fund_names?: string[] | null;
  fund_short_names?: string[] | null;
  primary_fund_name?: string | null;
  primary_fund_short_name?: string | null;
  // Corporate event data (added by migration)
  ma_excluded_share?: number | null;
  ma_carried_cost?: number | null;
  ma_event_date?: string | null;
}): InvCompanyValuation {
  return {
    companyId: row.company_id ?? 0,
    globalCompanyId: row.global_company_id,
    organizationId: row.organization_id,
    companyName: row.company_name,
    companyDomain: row.company_domain,
    sector: row.sector,
    industry: row.industry,
    headquarters: row.headquarters,
    status: row.status,
    myFmv: row.my_fmv,
    multiple: row.multiple,
    aggregateCost: row.aggregate_cost,
    realizedProceeds: row.realized_proceeds ?? null,
    ownershipPct: row.ownership_pct,
    myFdPct: row.my_fd_pct,
    myUnits: row.my_units,
    postMoneyValuation: row.post_money_valuation,
    currentPriceUnit: row.current_price_unit,
    fullyDilutedTotal: row.fully_diluted_total,
    totalEquityFinancing: row.total_equity_financing,
    lastTransactionDate: row.last_transaction_date,
    snapshotDate: row.snapshot_date,
    // Entry transaction data
    entryDate: row.entry_date ?? null,
    entryAmount: row.entry_amount ?? null,
    entryStageCode: row.entry_stage_code ?? null,
    entryStageDisplayName: row.entry_stage_display_name ?? null,
    // Current stage data
    currentStageCode: row.current_stage_code ?? null,
    currentStageDisplayName: row.current_stage_display_name ?? null,
    // Fund data
    fundIds: row.fund_ids ?? null,
    fundNames: row.fund_names ?? null,
    fundShortNames: row.fund_short_names ?? null,
    primaryFundName: row.primary_fund_name ?? null,
    primaryFundShortName: row.primary_fund_short_name ?? null,
    // Corporate event data
    maExcludedShare: row.ma_excluded_share ?? null,
    maCarriedCost: row.ma_carried_cost ?? null,
    maEventDate: row.ma_event_date ?? null,
  };
}

const CAP_TABLE_WITH_STAGE_SELECT =
  '*, inv_financing_round (inv_stages (code, display_name)), inv_snapshot_types (code)';

type CapTableSnapshotJoinedRow = InvCapTableSnapshotRow & {
  inv_financing_round?: {
    inv_stages?: {
      code: string | null;
      display_name: string | null;
    } | null;
  } | null;
  inv_snapshot_types?: {
    code: string | null;
  } | null;
};

function mapToInvCapTableSnapshot(
  row: CapTableSnapshotJoinedRow,
): InvCapTableSnapshot {
  return {
    id: row.id,
    companyId: row.company_id,
    organizationId: row.organization_id,
    snapshotDate: row.snapshot_date,
    snapshotTypeId: row.snapshot_type_id,
    snapshotTypeCode: row.inv_snapshot_types?.code ?? null,
    financingRoundId: row.financing_round_id,
    fullyDilutedTotal: row.fully_diluted_total,
    totalOutstanding: row.total_outstanding,
    impliedValuation: row.implied_valuation,
    sharePrice: row.share_price,
    commonAuthorized: row.common_authorized,
    commonOutstanding: row.common_outstanding,
    preferredAuthorized: row.preferred_authorized,
    preferredOutstanding: row.preferred_outstanding,
    optionPoolAuthorized: row.option_pool_authorized,
    optionPoolOutstanding: row.option_pool_outstanding,
    optionPoolAvailable: row.option_pool_available,
    optionPoolFdPercent: row.option_pool_fd_percent,
    ourTotalShares: row.our_total_shares,
    ourCommonShares: row.our_common_shares,
    ourPreferredShares: row.our_preferred_shares,
    ourPreferredPct: row.our_preferred_pct,
    ourOwnershipPercent: row.our_ownership_percent,
    ourFdOwnershipPercent: row.our_fd_ownership_percent,
    ourVotingPct: row.our_voting_pct,
    capTableDetail: row.cap_table_detail,
    stageCode: row.financing_round_id
      ? (row.inv_financing_round?.inv_stages?.code ?? null)
      : null,
    stageName: row.financing_round_id
      ? (row.inv_financing_round?.inv_stages?.display_name ?? null)
      : null,
  };
}

function emptyValuationOverrides(): ValuationOverrides {
  return { fields: {}, recomputed: [] };
}

function emptyLegalTermsContext(): LegalTermsOverrideContext {
  return {
    roundTermsId: null,
    informationRightsId: null,
    securityTermsId: null,
    values: {
      antiDilutionType: null,
      liquidationSeniority: null,
      dividendRate: null,
      dividendSeniority: null,
    },
    overridden: { roundTerms: {}, informationRights: {}, securityTerms: {} },
  };
}

function emptyInvestorStatusOverrideContext(): InvestorStatusOverrideContext {
  return {
    informationRightsId: null,
    roundTermsId: null,
    createTarget: null,
    values: {
      isMajorInvestor: false,
      infoRightsForMajor: false,
      infoRightsForAll: false,
      proRataRightsMajor: false,
      proRataRightsAll: false,
    },
    overridden: {},
  };
}

/** A financing round row with the fields needed to build a create target. */
type FinancingRoundForTarget = {
  id: number;
  name: string;
  announced_date: string | null;
  initial_close_date: string | null;
  final_close_date: string | null;
};

/**
 * Pick the financing round a new Investor Status record should attach to when
 * none exists yet, plus the effective date to stamp on it. The date prefers
 * the round's close dates (matching the keys droid ingestion upserts on, so a
 * later ingest updates in place) and falls back to today. Returns null when the
 * company has no financing round to attach to.
 */
export function pickCreateTarget(
  rounds: FinancingRoundForTarget[],
  companyId: number,
): InvestorStatusOverrideContext['createTarget'] {
  const dateOf = (r: FinancingRoundForTarget): string | null =>
    r.final_close_date ?? r.initial_close_date ?? r.announced_date;

  const latest = rounds.reduce<FinancingRoundForTarget | null>((best, r) => {
    if (!best) return r;
    const a = dateOf(r);
    const b = dateOf(best);
    if (a == null) return best;
    if (b == null) return r;
    return a > b ? r : best;
  }, null);

  if (!latest) return null;

  return {
    financingRoundId: latest.id,
    companyId,
    roundName: latest.name,
    effectiveDate: dateOf(latest) ?? new Date().toISOString().slice(0, 10),
  };
}

/** Flatten override metadata to the set of affected valuation props. */
export function overriddenValuationFieldSet(
  overridden: ValuationOverrides,
): ReadonlySet<string> {
  return new Set<string>([
    ...Object.keys(overridden.fields),
    ...overridden.recomputed,
  ]);
}

/**
 * Latest snapshot columns needed to re-derive snapshot-based valuation
 * fields under overrides. Failure degrades to source values.
 */
async function fetchSnapshotForValuationOverrides(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: number,
  organizationId: string,
): Promise<ValuationSnapshotRow | null> {
  const { data, error } = await supabase
    .from('inv_cap_table_snapshot')
    .select(
      'id, implied_valuation, share_price, our_fd_ownership_percent, our_total_shares',
    )
    .eq('company_id', companyId)
    .eq('organization_id', organizationId)
    // Canonical latest-snapshot rule: see pickLatestSnapshot in transforms.ts.
    .order('snapshot_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error(
      { companyId, error },
      'Failed to fetch snapshot for value overrides; rendering source values',
    );
    return null;
  }
  return data;
}

/**
 * All transactions of a company, with the columns needed to re-derive the
 * v_inv_position aggregates under overrides. Failure degrades to source
 * values (null = skip the transaction-side merge).
 */
async function fetchTransactionsForValuationOverrides(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: number,
  organizationId: string,
): Promise<PositionTransactionRow[] | null> {
  const { data, error } = await supabase
    .from('inv_transaction')
    .select(
      'id, fund_id, security_id, currency, transaction_type, transaction_date, units, amount',
    )
    .eq('company_id', companyId)
    .eq('organization_id', organizationId);

  if (error) {
    logger.error(
      { companyId, error },
      'Failed to fetch transactions for value overrides; rendering source values',
    );
    return null;
  }
  return data;
}

/**
 * Companies that carry at least one active value override, per entity type.
 * `null` means the mapping query failed (unknown) — callers must fall back
 * to the per-company fetch rather than silently dropping overrides.
 */
interface OverrideAffectedCompanies {
  snapshot: ReadonlySet<number> | null;
  transaction: ReadonlySet<number> | null;
}

/**
 * `.in('id', ...)` serializes every id into the PostgREST query string, so
 * large orgs with hundreds of active overrides could blow past URL length
 * limits at a proxy hop — chunk to keep each request bounded.
 */
const OVERRIDE_ENTITY_ID_CHUNK_SIZE = 200;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function mapOverrideEntityIdsToCompanyIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: 'inv_cap_table_snapshot' | 'inv_transaction',
  entityIds: number[],
  organizationId: string,
): Promise<ReadonlySet<number> | null> {
  if (entityIds.length === 0) return new Set();

  const results = await Promise.all(
    chunk(entityIds, OVERRIDE_ENTITY_ID_CHUNK_SIZE).map((ids) =>
      supabase
        .from(table)
        .select('company_id')
        .in('id', ids)
        .eq('organization_id', organizationId),
    ),
  );

  const companyIds = new Set<number>();
  for (const { data, error } of results) {
    if (error) {
      logger.error(
        { table, organizationId, error },
        'Failed to map value overrides to companies; falling back to per-company fetches',
      );
      return null;
    }
    for (const row of data ?? []) {
      if (row.company_id != null) companyIds.add(row.company_id);
    }
  }
  return companyIds;
}

/**
 * Resolve the org's active overrides to the set of affected company ids —
 * one batched mapping query per entity type per request (React cache keyed
 * by org), so a single override on one company does not fan out into
 * per-company override fetches across the whole portfolio list.
 */
const getOverrideAffectedCompanyIds = cache(
  async (organizationId: string): Promise<OverrideAffectedCompanies> => {
    const overrides = await getActiveValueOverrides(organizationId);
    const entityIdsOf = (entityType: string) => [
      ...new Set(
        overrides
          .filter((o) => o.entity_type === entityType)
          .map((o) => o.entity_id),
      ),
    ];
    const snapshotIds = entityIdsOf('inv_cap_table_snapshot');
    const transactionIds = entityIdsOf('inv_transaction');
    if (snapshotIds.length === 0 && transactionIds.length === 0) {
      return { snapshot: new Set(), transaction: new Set() };
    }

    const supabase = await createClient();
    const [snapshot, transaction] = await Promise.all([
      mapOverrideEntityIdsToCompanyIds(
        supabase,
        'inv_cap_table_snapshot',
        snapshotIds,
        organizationId,
      ),
      mapOverrideEntityIdsToCompanyIds(
        supabase,
        'inv_transaction',
        transactionIds,
        organizationId,
      ),
    ]);
    return { snapshot, transaction };
  },
);

/**
 * Re-derive view-computed valuation fields under the org's active value
 * overrides. The v_inv_company_valuation view computes my_fmv, multiple and
 * the position aggregates in SQL, so overridden inputs require a TS-side
 * recompute (see overrides/mergeValuation.ts). No-op — and no extra
 * queries — when the org has no overrides of the relevant entity types, and
 * the per-company snapshot/transaction fetches run only for companies the
 * shared override→company mapping marks as affected.
 */
async function applyValuationOverrides(
  valuation: InvCompanyValuation,
  companyId: number,
  organizationId: string,
): Promise<{ valuation: InvCompanyValuation; overridden: ValuationOverrides }> {
  const overrides = await getActiveValueOverrides(organizationId);
  const hasSnapshotOverrides = overrides.some(
    (o) => o.entity_type === 'inv_cap_table_snapshot',
  );
  const hasTransactionOverrides = overrides.some(
    (o) => o.entity_type === 'inv_transaction',
  );
  if (!hasSnapshotOverrides && !hasTransactionOverrides) {
    return { valuation, overridden: emptyValuationOverrides() };
  }

  // A null set = mapping fetch failed (unknown): keep the fetch.
  const affected = await getOverrideAffectedCompanyIds(organizationId);
  const needsSnapshot =
    hasSnapshotOverrides && (affected.snapshot?.has(companyId) ?? true);
  const needsTransactions =
    hasTransactionOverrides && (affected.transaction?.has(companyId) ?? true);
  if (!needsSnapshot && !needsTransactions) {
    return { valuation, overridden: emptyValuationOverrides() };
  }

  const supabase = await createClient();
  const [snapshot, transactions] = await Promise.all([
    needsSnapshot
      ? fetchSnapshotForValuationOverrides(supabase, companyId, organizationId)
      : Promise.resolve(null),
    needsTransactions
      ? fetchTransactionsForValuationOverrides(
          supabase,
          companyId,
          organizationId,
        )
      : Promise.resolve(null),
  ]);

  return mergeValuationOverrides({
    valuation,
    snapshot,
    transactions,
    overrides,
  });
}

// =============================================================================
// SERVICE FUNCTIONS
// =============================================================================

/**
 * Get a single portfolio company by public_id.
 * Joins inv_companies for global company data.
 *
 * @param publicId - The public_id of the inv_company record
 * @returns InvCompanyResult with company data
 * @throws NotFoundError if company not found or user lacks access
 */
export const getInvCompany = cache(
  async (publicId: string): Promise<InvCompanyResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      throw new NotFoundError('User');
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('inv_company')
      .select(
        `
        id,
        public_id,
        organization_id,
        company_id,
        status,
        sector,
        tags,
        notes,
        investment_thesis,
        contact_person,
        contact_email,
        external_id,
        metadata,
        created_at,
        updated_at,
        name_override,
        inv_companies (
          name,
          domain,
          industry,
          headquarters,
          description,
          founded_year,
          legal_name,
          legal_jurisdiction,
          entity_type
        ),
        stage:inv_stages!inv_company_stage_id_fkey (
          code,
          display_name
        ),
        entry_stage:inv_stages!inv_company_entry_stage_id_fkey (
          code,
          display_name
        )
      `,
      )
      .eq('public_id', publicId)
      .eq('organization_id', userMetadata.organizationId)
      .single();

    if (error || !data) {
      logger.warn(
        { publicId, organizationId: userMetadata.organizationId, error },
        'Portfolio company not found',
      );
      throw new NotFoundError('Portfolio company');
    }

    const sourceCompany = mapToInvCompany(data);
    const activeOverrides = await getActiveValueOverrides(
      sourceCompany.organizationId,
    );
    const { company } = applyCompanyDetailOverrides(
      sourceCompany,
      activeOverrides,
    );

    logger.debug(
      { companyId: company.id, publicId },
      'Fetched portfolio company',
    );

    return { company };
  },
);

/**
 * Options for fetching portfolio companies.
 */
export interface GetInvCompaniesOptions {
  /** Filter companies to only those with transactions from this fund. */
  fundId?: number;
}

/**
 * Get all portfolio companies for the current user's organization.
 * Joins inv_companies for global company data.
 *
 * @param options - Optional filtering options (e.g., fundId)
 * @returns InvCompaniesResult with list of companies
 */
export const getInvCompanies = cache(
  async (options?: GetInvCompaniesOptions): Promise<InvCompaniesResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return { companies: [], count: 0 };
    }

    const supabase = await createClient();

    // When filtering by fund, first get the company IDs that have transactions with that fund
    let companyIds: number[] | undefined;
    if (options?.fundId) {
      const { data: transactionCompanies, error: txError } = await supabase
        .from('inv_transaction')
        .select('company_id')
        .eq('fund_id', options.fundId)
        .eq('organization_id', userMetadata.organizationId);

      if (txError) {
        logger.error(
          { error: txError, fundId: options.fundId },
          'Failed to fetch companies for fund filter',
        );
        return { companies: [], count: 0 };
      }

      // Extract unique company IDs
      companyIds = [
        ...new Set((transactionCompanies ?? []).map((t) => t.company_id)),
      ];

      // If no companies have transactions with this fund, return empty
      if (companyIds.length === 0) {
        return { companies: [], count: 0 };
      }
    }

    let query = supabase
      .from('inv_company')
      .select(
        `
        id,
        public_id,
        organization_id,
        company_id,
        status,
        sector,
        tags,
        notes,
        investment_thesis,
        contact_person,
        contact_email,
        external_id,
        metadata,
        created_at,
        updated_at,
        name_override,
        inv_companies (
          name,
          domain,
          industry,
          headquarters,
          description,
          founded_year,
          legal_name,
          legal_jurisdiction,
          entity_type
        ),
        stage:inv_stages!inv_company_stage_id_fkey (
          code,
          display_name
        ),
        entry_stage:inv_stages!inv_company_entry_stage_id_fkey (
          code,
          display_name
        )
      `,
      )
      .eq('organization_id', userMetadata.organizationId);

    // Apply fund filter if company IDs were determined
    if (companyIds) {
      query = query.in('id', companyIds);
    }

    const { data, error } = await query.order('created_at', {
      ascending: false,
    });

    if (error) {
      logger.error(
        { error, organizationId: userMetadata.organizationId },
        'Failed to fetch portfolio companies',
      );
      return { companies: [], count: 0 };
    }

    const companies = (data ?? []).map(mapToInvCompany);
    const activeOverrides = await getActiveValueOverrides(
      userMetadata.organizationId,
    );
    const { companies: mergedCompanies } = applyInvCompanyOverrides(
      companies,
      activeOverrides,
    );

    logger.debug(
      {
        count: mergedCompanies.length,
        organizationId: userMetadata.organizationId,
        fundId: options?.fundId,
      },
      'Fetched portfolio companies list',
    );

    return { companies: mergedCompanies, count: mergedCompanies.length };
  },
);

/**
 * Get valuation data for a portfolio company.
 * Uses the v_inv_company_valuation view which provides pre-computed metrics.
 *
 * @param companyId - The inv_company.id (not public_id)
 * @returns InvCompanyValuationResult with valuation data
 */
export const getInvCompanyValuation = cache(
  async (companyId: number): Promise<InvCompanyValuationResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      throw new NotFoundError('User');
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('v_inv_company_valuation')
      .select('*')
      .eq('company_id', companyId)
      .eq('organization_id', userMetadata.organizationId)
      .single();

    if (error || !data) {
      logger.warn(
        { companyId, organizationId: userMetadata.organizationId, error },
        'Valuation data not found',
      );
      // Return empty valuation instead of throwing
      return {
        valuation: {
          companyId,
          globalCompanyId: null,
          organizationId: userMetadata.organizationId,
          companyName: null,
          companyDomain: null,
          sector: null,
          industry: null,
          headquarters: null,
          status: null,
          myFmv: null,
          multiple: null,
          aggregateCost: null,
          realizedProceeds: null,
          ownershipPct: null,
          myFdPct: null,
          myUnits: null,
          postMoneyValuation: null,
          currentPriceUnit: null,
          fullyDilutedTotal: null,
          totalEquityFinancing: null,
          lastTransactionDate: null,
          snapshotDate: null,
          // Entry transaction data
          entryDate: null,
          entryAmount: null,
          entryStageCode: null,
          entryStageDisplayName: null,
          // Current stage data
          currentStageCode: null,
          currentStageDisplayName: null,
          // Fund data
          fundIds: null,
          fundNames: null,
          fundShortNames: null,
          primaryFundName: null,
          primaryFundShortName: null,
          maExcludedShare: null,
          maCarriedCost: null,
          maEventDate: null,
        },
        overridden: emptyValuationOverrides(),
      };
    }

    const { valuation, overridden } = await applyValuationOverrides(
      mapToInvCompanyValuation(data),
      companyId,
      userMetadata.organizationId,
    );

    logger.debug({ companyId }, 'Fetched company valuation');

    return { valuation, overridden };
  },
);

/**
 * Get the latest cap table snapshot for a portfolio company.
 * Optionally fetch a specific snapshot by date.
 *
 * @param companyId - The inv_company.id
 * @param snapshotDate - Optional specific date to fetch
 * @returns InvCapTableSnapshotResult with snapshot data and available dates
 */
export const getInvCapTableSnapshot = cache(
  async (
    companyId: number,
    snapshotDate?: string,
  ): Promise<InvCapTableSnapshotResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      throw new NotFoundError('User');
    }

    const supabase = await createClient();

    // Fetch available snapshot dates
    const { data: dates } = await supabase
      .from('inv_cap_table_snapshot')
      .select('snapshot_date')
      .eq('company_id', companyId)
      .eq('organization_id', userMetadata.organizationId)
      .order('snapshot_date', { ascending: false });

    const availableDates = (dates ?? []).map((d) => d.snapshot_date);

    // Build query for snapshot
    let query = supabase
      .from('inv_cap_table_snapshot')
      .select(CAP_TABLE_WITH_STAGE_SELECT)
      .eq('company_id', companyId)
      .eq('organization_id', userMetadata.organizationId);

    if (snapshotDate) {
      query = query.eq('snapshot_date', snapshotDate);
    } else {
      // Tie-break on id: see pickLatestSnapshot in transforms.ts.
      query = query
        .order('snapshot_date', { ascending: false })
        .order('id', { ascending: false })
        .limit(1);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      logger.warn(
        { companyId, snapshotDate, error },
        'Cap table snapshot not found',
      );
      throw new NotFoundError('Cap table snapshot');
    }

    // Merge value overrides BEFORE mapping so derived display values stay
    // consistent with the overridden source columns.
    const overrides = await getActiveValueOverrides(
      userMetadata.organizationId,
    );
    const { rows, overridden } = applyOverrides(
      'inv_cap_table_snapshot',
      [data],
      overrides,
    );
    const snapshot = mapToInvCapTableSnapshot(rows[0]);

    logger.debug(
      { companyId, snapshotDate: snapshot.snapshotDate },
      'Fetched cap table snapshot',
    );

    return { snapshot, availableDates, overridden: overridden[data.id] ?? {} };
  },
);

/**
 * Get all cap table snapshots for a portfolio company.
 *
 * @param companyId - The inv_company.id
 * @returns Array of all snapshots sorted by date descending
 */
export const getInvAllCapTableSnapshots = cache(
  async (companyId: number): Promise<InvCapTableSnapshot[]> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return [];
    }

    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('inv_cap_table_snapshot')
        .select(CAP_TABLE_WITH_STAGE_SELECT)
        .eq('company_id', companyId)
        .eq('organization_id', userMetadata.organizationId)
        // Tie-break on id: see pickLatestSnapshot in transforms.ts.
        .order('snapshot_date', { ascending: false })
        .order('id', { ascending: false });

      if (error) {
        logger.error(
          { companyId, error },
          'Failed to fetch cap table snapshots',
        );
        throw new DatabaseError('Cap table snapshots');
      }

      const overrides = await getActiveValueOverrides(
        userMetadata.organizationId,
      );
      const { rows } = applyOverrides(
        'inv_cap_table_snapshot',
        data ?? [],
        overrides,
      );
      return rows.map(mapToInvCapTableSnapshot);
    } catch (error) {
      logger.error({ companyId, error }, 'Failed to fetch cap table snapshots');
      throw error instanceof DatabaseError
        ? error
        : new DatabaseError('Cap table snapshots');
    }
  },
);

/**
 * Security types held per company, from v_inv_position. Companies with no
 * position group (no transactions, or transactions without fund/security)
 * are absent from the map. A query failure throws rather than returning an
 * empty map, since "no positions" is a valid answer the caller acts on.
 */
export async function getInvSecurityTypesByCompanyBatch(
  companyIds: number[],
): Promise<Map<number, Set<string>>> {
  if (companyIds.length === 0) return new Map();

  const userMetadata = await getUserMetadata();
  if (!userMetadata) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_inv_position')
    .select('company_id, security_type')
    .in('company_id', companyIds)
    .eq('organization_id', userMetadata.organizationId);

  if (error) {
    logger.error({ error }, 'Failed to fetch position security types');
    throw new DatabaseError('Position security types');
  }

  const result = new Map<number, Set<string>>();
  for (const row of data ?? []) {
    if (row.company_id == null || row.security_type == null) continue;
    const types = result.get(row.company_id) ?? new Set<string>();
    types.add(row.security_type);
    result.set(row.company_id, types);
  }
  return result;
}

/**
 * Get the latest cap table snapshot for each company in a batch.
 * Returns a Map keyed by company_id.
 */
export async function getInvLatestCapTableSnapshotBatch(
  companyIds: number[],
): Promise<Map<number, InvCapTableSnapshot>> {
  if (companyIds.length === 0) return new Map();

  const userMetadata = await getUserMetadata();
  if (!userMetadata) return new Map();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('inv_cap_table_snapshot')
      .select(CAP_TABLE_WITH_STAGE_SELECT)
      .in('company_id', companyIds)
      .eq('organization_id', userMetadata.organizationId)
      .order('company_id', { ascending: true })
      .order('snapshot_date', { ascending: false })
      .order('id', { ascending: false });

    if (error) {
      logger.error({ error }, 'Failed to fetch latest cap table snapshots');
      return new Map();
    }

    const overrides = await getActiveValueOverrides(
      userMetadata.organizationId,
    );
    const { rows } = applyOverrides(
      'inv_cap_table_snapshot',
      data ?? [],
      overrides,
    );

    const result = new Map<number, InvCapTableSnapshot>();
    for (const row of rows) {
      if (!result.has(row.company_id)) {
        result.set(
          row.company_id,
          mapToInvCapTableSnapshot(row as CapTableSnapshotJoinedRow),
        );
      }
    }
    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to fetch latest cap table snapshots');
    return new Map();
  }
}

/**
 * Get transactions for a portfolio company.
 * Joins financing round for stage information.
 *
 * @param companyId - The inv_company.id
 * @returns InvTransactionsResult with list of transactions
 */
export const getInvTransactions = cache(
  async (companyId: number): Promise<InvTransactionsResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return { transactions: [], overridden: {} };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('inv_transaction')
      .select(
        `
        id,
        public_id,
        company_id,
        fund_id,
        security_id,
        financing_round_id,
        organization_id,
        transaction_type,
        transaction_date,
        settlement_date,
        units,
        amount,
        currency,
        counterparty_name,
        signatory,
        notes,
        external_id,
        metadata,
        inv_financing_round (
          id,
          name,
          stage_id,
          pre_money_valuation,
          initial_close_date,
          final_close_date,
          inv_stages (
            id,
            code,
            display_name
          ),
          inv_cap_table_snapshot (
            id,
            snapshot_date,
            implied_valuation
          )
        ),
        inv_fund (
          id,
          name,
          short_name
        ),
        inv_security (
          id,
          public_id,
          company_id,
          organization_id,
          name,
          security_type,
          series_name,
          is_valuation_reference,
          metadata
        )
      `,
      )
      .eq('company_id', companyId)
      .eq('organization_id', userMetadata.organizationId)
      .order('transaction_date', { ascending: false });

    if (error) {
      logger.error({ companyId, error }, 'Failed to fetch transactions');
      return { transactions: [], overridden: {} };
    }

    // Merge value overrides BEFORE mapping so downstream consumers (tables,
    // charts, entry-cost derivations) all see the overridden figures.
    const overrides = await getActiveValueOverrides(
      userMetadata.organizationId,
    );
    const { rows: mergedRows, overridden } = applyOverrides(
      'inv_transaction',
      data ?? [],
      overrides,
    );

    const transactions: InvTransaction[] = mergedRows.map((row) => ({
      id: row.id,
      publicId: row.public_id,
      companyId: row.company_id,
      fundId: row.fund_id,
      securityId: row.security_id,
      financingRoundId: row.financing_round_id,
      organizationId: row.organization_id,
      transactionType: row.transaction_type,
      transactionDate: row.transaction_date,
      settlementDate: row.settlement_date,
      units: row.units,
      amount: row.amount,
      currency: row.currency,
      counterpartyName: row.counterparty_name,
      signatory: row.signatory,
      notes: row.notes,
      externalId: row.external_id,
      metadata: row.metadata,
      fund: row.inv_fund
        ? {
            id: row.inv_fund.id,
            publicId: '',
            organizationId: userMetadata.organizationId,
            name: row.inv_fund.name,
            shortName: row.inv_fund.short_name,
            code: null,
            description: null,
            currency: 'USD',
            status: 'active',
            vintageYear: null,
            targetSize: null,
            committedCapital: null,
            metadata: {},
          }
        : undefined,
      financingRound: row.inv_financing_round
        ? {
            id: row.inv_financing_round.id,
            publicId: '',
            companyId,
            organizationId: userMetadata.organizationId,
            name: row.inv_financing_round.name,
            stageId: row.inv_financing_round.stage_id,
            stageName: row.inv_financing_round.inv_stages?.display_name ?? null,
            stageCode: row.inv_financing_round.inv_stages?.code ?? null,
            currency: 'USD',
            preMoneyValuation: row.inv_financing_round.pre_money_valuation,
            announcedDate: null,
            initialCloseDate: row.inv_financing_round.initial_close_date,
            finalCloseDate: row.inv_financing_round.final_close_date,
            notes: null,
            externalId: null,
            metadata: {},
            ...(() => {
              const latest = getLatestImpliedValuation(
                row.inv_financing_round.inv_cap_table_snapshot ?? [],
              );
              return {
                impliedValuation: latest.value,
                impliedValuationSnapshotId: latest.snapshotId,
              };
            })(),
          }
        : null,
      security: row.inv_security
        ? {
            id: row.inv_security.id,
            publicId: row.inv_security.public_id,
            companyId: row.inv_security.company_id,
            organizationId: row.inv_security.organization_id,
            name: row.inv_security.name,
            securityType: row.inv_security.security_type,
            seriesName: row.inv_security.series_name,
            isValuationReference: row.inv_security.is_valuation_reference,
            metadata: row.inv_security.metadata,
            terms: null,
          }
        : undefined,
    }));

    logger.debug(
      { companyId, count: transactions.length },
      'Fetched transactions',
    );

    return { transactions, overridden };
  },
);

/**
 * Corporate events (merger, acquisition, spin-off, reorganization) a portfolio
 * company takes part in, with the other parties named, newest first.
 *
 * Keyed by the company's public id so it can run beside getInvPortfolioCompany
 * instead of waiting for it to resolve the internal id.
 *
 * @param publicId - The inv_company.public_id
 */
export const getInvCorporateEventsForCompany = cache(
  async (publicId: string): Promise<InvCorporateEventSummary[]> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return [];
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('inv_corporate_event_party')
      .select(
        `
        role,
        company_id,
        inv_company!inv_corporate_event_party_company_fkey!inner (
          public_id
        ),
        inv_corporate_event!inv_corporate_event_party_event_fkey (
          id,
          event_type,
          event_date,
          inv_corporate_event_party (
            role,
            cost_allocation_ratio,
            company_id,
            inv_company!inv_corporate_event_party_company_fkey (
              id,
              public_id,
              name_override,
              inv_companies!inv_company_company_id_fkey (
                name
              )
            )
          )
        )
      `,
      )
      .eq('inv_company.public_id', publicId)
      .eq('organization_id', userMetadata.organizationId);

    if (error) {
      logger.error({ publicId, error }, 'Failed to fetch corporate events');
      return [];
    }

    const summaries: InvCorporateEventSummary[] = [];
    for (const row of data ?? []) {
      const event = row.inv_corporate_event;
      if (!event) continue;
      const counterparts: InvCorporateEventCounterpart[] = [];
      for (const party of event.inv_corporate_event_party) {
        if (party.company_id === row.company_id) continue;
        const company = party.inv_company;
        if (!company) continue;
        counterparts.push({
          companyId: company.id,
          publicId: company.public_id,
          name: company.name_override ?? company.inv_companies?.name ?? '',
          role: party.role as InvCorporateEventRole,
          costAllocationRatio: party.cost_allocation_ratio,
        });
      }
      counterparts.sort(
        (a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name),
      );
      summaries.push({
        id: event.id,
        eventType: event.event_type as InvCorporateEventType,
        eventDate: event.event_date,
        role: row.role as InvCorporateEventRole,
        counterparts,
      });
    }
    summaries.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
    return summaries;
  },
);

/**
 * Get active board seats for a portfolio company.
 *
 * @param companyId - The inv_company.id
 * @returns InvBoardCompositionResult with list of board members
 */
export const getInvBoardComposition = cache(
  async (companyId: number): Promise<InvBoardCompositionResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return { members: [] };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('inv_board_seat')
      .select(
        `
        id,
        company_id,
        organization_id,
        holder_name,
        holder_title,
        seat_type,
        effective_date,
        end_date,
        designating_fund_id,
        designating_security_id,
        committee_memberships,
        metadata
      `,
      )
      .eq('company_id', companyId)
      .eq('organization_id', userMetadata.organizationId)
      .is('end_date', null) // Active seats only
      .order('effective_date', { ascending: true });

    if (error) {
      logger.error({ companyId, error }, 'Failed to fetch board composition');
      return { members: [] };
    }

    // Merge value overrides BEFORE camelCase mapping so edited holder_name,
    // holder_title, designating_fund_id values flow through consistently.
    const overrides = await getActiveValueOverrides(
      userMetadata.organizationId,
    );
    const { rows: mergedData, overridden } = applyOverrides(
      'inv_board_seat',
      data ?? [],
      overrides,
    );

    // The joined `inv_fund` reflects the *original* designating_fund_id, so an
    // overridden fund would show stale/empty. Re-resolve funds from the merged
    // designating_fund_id values.
    const mergedFundIds = Array.from(
      new Set(
        mergedData
          .map((row) => row.designating_fund_id)
          .filter((id): id is number => id != null),
      ),
    );

    const fundById = new Map<
      number,
      { id: number; name: string; short_name: string | null }
    >();
    if (mergedFundIds.length > 0) {
      const { data: fundRows } = await supabase
        .from('inv_fund')
        .select('id, name, short_name')
        .in('id', mergedFundIds)
        .eq('organization_id', userMetadata.organizationId);
      for (const fund of fundRows ?? []) {
        fundById.set(fund.id, fund);
      }
    }

    const members: InvBoardSeat[] = mergedData.map((row) => {
      const fund =
        row.designating_fund_id != null
          ? fundById.get(row.designating_fund_id)
          : undefined;
      return {
        id: row.id,
        companyId: row.company_id,
        organizationId: row.organization_id,
        holderName: row.holder_name,
        holderTitle: row.holder_title,
        seatType: row.seat_type,
        effectiveDate: row.effective_date,
        endDate: row.end_date,
        designatingFundId: row.designating_fund_id,
        designatingSecurityId: row.designating_security_id,
        committeeMemberships: row.committee_memberships,
        metadata: row.metadata,
        overridden: overridden[row.id],
        designatingFund: fund
          ? {
              id: fund.id,
              publicId: '',
              organizationId: userMetadata.organizationId,
              name: fund.name,
              shortName: fund.short_name,
              code: null,
              description: null,
              currency: 'USD',
              status: 'active',
              vintageYear: null,
              targetSize: null,
              committedCapital: null,
              metadata: {},
            }
          : null,
      };
    });

    logger.debug(
      { companyId, count: members.length },
      'Fetched board composition',
    );

    return { members };
  },
);

/**
 * Get every board seat id for a company, including soft-deleted (ended) seats.
 *
 * The activity feed filters override history by the company's entity ids; a
 * removed seat is excluded from the active board read, so its prior field-edit
 * overrides would drop out of the Audit Log. Including ended seat ids here keeps
 * that history visible after a member is removed.
 *
 * @param companyId - The inv_company.id
 * @returns Array of inv_board_seat ids (active + ended)
 */
export const getInvBoardSeatIds = cache(
  async (companyId: number): Promise<number[]> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return [];
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('inv_board_seat')
      .select('id')
      .eq('company_id', companyId)
      .eq('organization_id', userMetadata.organizationId);

    if (error) {
      logger.error({ companyId, error }, 'Failed to fetch board seat ids');
      return [];
    }

    return (data ?? []).map((row) => row.id);
  },
);

/**
 * Get investor status flags for a portfolio company.
 * Aggregates across information rights and board seats.
 *
 * @param companyId - The inv_company.id
 * @returns InvInvestorStatusResult with status flags
 */
export const getInvInvestorStatus = cache(
  async (companyId: number): Promise<InvInvestorStatusResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return {
        hasBoardSeat: false,
        isMajorInvestor: false,
        hasProRataRights: false,
        hasInformationRights: false,
      };
    }

    const supabase = await createClient();

    // Fetch information rights
    const { data: infoRights } = await supabase
      .from('inv_information_rights')
      .select('is_major_investor, info_rights_for_major, info_rights_for_all')
      .eq('company_id', companyId)
      .eq('organization_id', userMetadata.organizationId)
      .is('expiration_date', null)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch round terms for pro rata rights
    const { data: roundTerms } = await supabase
      .from('inv_round_terms')
      .select('pro_rata_rights_major, pro_rata_rights_all, financing_round_id')
      .eq('organization_id', userMetadata.organizationId)
      .is('superseded_date', null)
      .order('effective_date', { ascending: false });

    // Filter round terms to those for this company's rounds
    const { data: companyRounds } = await supabase
      .from('inv_financing_round')
      .select('id')
      .eq('company_id', companyId)
      .eq('organization_id', userMetadata.organizationId);

    const companyRoundIds = new Set((companyRounds ?? []).map((r) => r.id));
    const relevantRoundTerms = (roundTerms ?? []).filter(
      (rt) =>
        rt.financing_round_id && companyRoundIds.has(rt.financing_round_id),
    );

    // Check for board seat
    const { count: boardSeatCount } = await supabase
      .from('inv_board_seat')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('organization_id', userMetadata.organizationId)
      .is('end_date', null);

    const isMajorInvestor = infoRights?.is_major_investor ?? false;
    const hasInformationRights =
      (infoRights?.info_rights_for_major && isMajorInvestor) ||
      infoRights?.info_rights_for_all ||
      false;
    const hasProRataRights = relevantRoundTerms.some(
      (rt) =>
        (rt.pro_rata_rights_major && isMajorInvestor) || rt.pro_rata_rights_all,
    );

    const result: InvInvestorStatusResult = {
      hasBoardSeat: (boardSeatCount ?? 0) > 0,
      isMajorInvestor,
      hasProRataRights,
      hasInformationRights,
    };

    logger.debug({ companyId, ...result }, 'Fetched investor status');

    return result;
  },
);

/**
 * Get securities for a portfolio company.
 * Joins current terms (where superseded_date IS NULL).
 *
 * @param companyId - The inv_company.id
 * @returns InvSecuritiesResult with list of securities
 */
export const getInvSecurities = cache(
  async (companyId: number): Promise<InvSecuritiesResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return { securities: [] };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('inv_security')
      .select(
        `
        id,
        public_id,
        company_id,
        organization_id,
        name,
        security_type,
        series_name,
        is_valuation_reference,
        metadata,
        inv_security_terms (
          id,
          security_id,
          effective_date,
          superseded_date,
          original_issue_price,
          authorized_shares,
          issued_shares,
          outstanding_shares,
          par_value,
          conversion_price,
          conversion_ratio,
          anti_dilution_type,
          aggregate_liq_pref,
          liquidation_multiplier,
          liquidation_seniority,
          participation_type,
          participation_cap,
          dividend_rate,
          dividend_cumulative,
          dividend_accruing,
          dividend_seniority,
          valuation_cap,
          discount_rate,
          interest_rate,
          interest_type,
          maturity_date,
          qualified_financing_threshold
        )
      `,
      )
      .eq('company_id', companyId)
      .eq('organization_id', userMetadata.organizationId)
      .order('security_type', { ascending: true });

    if (error) {
      logger.error({ companyId, error }, 'Failed to fetch securities');
      return { securities: [] };
    }

    const securities: InvSecurity[] = (data ?? []).map((row) => {
      // Find current terms (superseded_date IS NULL)
      const currentTerms = (row.inv_security_terms ?? []).find(
        (t) => t.superseded_date === null,
      );

      return {
        id: row.id,
        publicId: row.public_id,
        companyId: row.company_id,
        organizationId: row.organization_id,
        name: row.name,
        securityType: row.security_type,
        seriesName: row.series_name,
        isValuationReference: row.is_valuation_reference,
        metadata: row.metadata,
        terms: currentTerms
          ? {
              id: currentTerms.id,
              securityId: currentTerms.security_id,
              effectiveDate: currentTerms.effective_date,
              supersededDate: currentTerms.superseded_date,
              originalIssuePrice: currentTerms.original_issue_price,
              authorizedShares: currentTerms.authorized_shares,
              issuedShares: currentTerms.issued_shares,
              outstandingShares: currentTerms.outstanding_shares,
              parValue: currentTerms.par_value,
              conversionPrice: currentTerms.conversion_price,
              conversionRatio: currentTerms.conversion_ratio,
              antiDilutionType: currentTerms.anti_dilution_type,
              aggregateLiqPref: currentTerms.aggregate_liq_pref,
              liquidationMultiplier: currentTerms.liquidation_multiplier,
              liquidationSeniority: currentTerms.liquidation_seniority,
              participationType: currentTerms.participation_type,
              participationCap: currentTerms.participation_cap,
              dividendRate: currentTerms.dividend_rate,
              dividendCumulative: currentTerms.dividend_cumulative,
              dividendAccruing: currentTerms.dividend_accruing,
              dividendSeniority: currentTerms.dividend_seniority,
              valuationCap: currentTerms.valuation_cap,
              discountRate: currentTerms.discount_rate,
              interestRate: currentTerms.interest_rate,
              interestType: currentTerms.interest_type,
              maturityDate: currentTerms.maturity_date,
              qualifiedFinancingThreshold:
                currentTerms.qualified_financing_threshold,
            }
          : null,
      };
    });

    logger.debug({ companyId, count: securities.length }, 'Fetched securities');

    return { securities };
  },
);

/**
 * Map a raw inv_round_terms DB row to InvRoundTerms.
 */
function mapRoundTermsRow(row: InvRoundTermsRow): InvRoundTerms {
  return {
    id: row.id,
    financingRoundId: row.financing_round_id,
    organizationId: row.organization_id,
    effectiveDate: row.effective_date,
    supersededDate: row.superseded_date,
    optionPoolPercent: row.option_pool_percent,
    preMoneyFdShares: row.pre_money_fd_shares,
    postMoneyFdShares: row.post_money_fd_shares,
    majorInvestorThresholdAmount: row.major_investor_threshold_amount,
    majorInvestorThresholdShares: row.major_investor_threshold_shares,
    majorInvestorThresholdOwnershipPct:
      row.major_investor_threshold_ownership_pct,
    namedMajorInvestors: row.named_major_investors,
    proRataRightsAll: row.pro_rata_rights_all,
    proRataRightsMajor: row.pro_rata_rights_major,
    standardProRataFormulation: row.standard_pro_rata_formulation,
    qsbsRepMade: row.qsbs_rep_made,
    qsbsCovenantGiven: row.qsbs_covenant_given,
    payToPlay: row.pay_to_play,
    dragAlong: row.drag_along,
    rofrCosale: row.rofr_cosale,
    investorsSubjectToRofr: row.investors_subject_to_rofr,
    redemptionRights: row.redemption_rights,
    registrationRightsPreferred: row.registration_rights_preferred,
    doInsurance: row.do_insurance,
    founderVestingApplied: row.founder_vesting_applied,
    employeeVestingProtocol: row.employee_vesting_protocol,
    milestoneClosings: row.milestone_closings,
    subsequentClosingWindowDays: row.subsequent_closing_window_days,
    requiredClosingPayments: row.required_closing_payments,
    issuerPaysInvestorCounsel: row.issuer_pays_investor_counsel,
    investorCounselFeeCap: row.investor_counsel_fee_cap,
    rawTerms: row.raw_terms,
  };
}

/**
 * Get legal terms for a portfolio company.
 * Aggregates information rights, round terms, and security terms.
 *
 * @param companyId - The inv_company.id
 * @returns InvLegalTermsResult with aggregated legal terms
 */
export const getInvLegalTerms = cache(
  async (companyId: number): Promise<InvLegalTermsResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return {
        informationRights: null,
        roundTerms: null,
        securityTerms: null,
        allRoundTerms: [],
        investorStatusEdit: emptyInvestorStatusOverrideContext(),
        legalTermsEdit: emptyLegalTermsContext(),
      };
    }

    const supabase = await createClient();

    // Fetch information rights (most recent active)
    const { data: infoRightsData } = await supabase
      .from('inv_information_rights')
      .select('*')
      .eq('company_id', companyId)
      .eq('organization_id', userMetadata.organizationId)
      .is('expiration_date', null)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get financing rounds for this company
    const { data: companyRounds } = await supabase
      .from('inv_financing_round')
      .select('id, name, announced_date, initial_close_date, final_close_date')
      .eq('company_id', companyId)
      .eq('organization_id', userMetadata.organizationId);

    const companyRoundIds = (companyRounds ?? []).map((r) => r.id);

    // Fetch round terms (all non-superseded for company's rounds)
    let roundTermsData: InvRoundTermsRow | null = null;
    let allRoundTermsData: InvRoundTermsRow[] = [];
    if (companyRoundIds.length > 0) {
      const { data, error } = await supabase
        .from('inv_round_terms')
        .select('*')
        .in('financing_round_id', companyRoundIds)
        .eq('organization_id', userMetadata.organizationId)
        .is('superseded_date', null)
        .order('effective_date', { ascending: false });
      if (error) {
        logger.error({ companyId, error }, 'Failed to fetch round terms');
      } else {
        allRoundTermsData = data ?? [];
        roundTermsData = allRoundTermsData[0] ?? null;
      }
    }

    // Get securities for this company
    const { data: companySecurities } = await supabase
      .from('inv_security')
      .select('id')
      .eq('company_id', companyId)
      .eq('organization_id', userMetadata.organizationId);

    const companySecurityIds = (companySecurities ?? []).map((s) => s.id);

    // Fetch security terms (most recent non-superseded for company's securities)
    let securityTermsData = null;
    if (companySecurityIds.length > 0) {
      const { data } = await supabase
        .from('inv_security_terms')
        .select('*')
        .in('security_id', companySecurityIds)
        .eq('organization_id', userMetadata.organizationId)
        .is('superseded_date', null)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      securityTermsData = data;
    }

    // Apply active value overrides to all three legal-terms source rows. Every
    // consumer below reads the merged rows, so an edit made from the Overview
    // Investor Status section and one made from the Legal Terms tab resolve to
    // the same value — the two surfaces share pro_rata_rights_major/_all.
    // Round terms merge as a whole array so legalTermsByRound is consistent too
    // (each row carries its own id, which is what overrides key on).
    const activeOverrides = await getActiveValueOverrides(
      userMetadata.organizationId,
    );
    const infoRightsMerge = applyOverrides(
      'inv_information_rights',
      infoRightsData ? [infoRightsData] : [],
      activeOverrides,
    );
    const mergedInfoRights = infoRightsMerge.rows[0] ?? null;
    const roundTermsMerge = applyOverrides(
      'inv_round_terms',
      allRoundTermsData,
      activeOverrides,
    );
    const mergedAllRoundTerms = roundTermsMerge.rows;
    const mergedRoundTerms = mergedAllRoundTerms[0] ?? null;
    const securityTermsMerge = applyOverrides(
      'inv_security_terms',
      securityTermsData ? [securityTermsData] : [],
      activeOverrides,
    );
    const mergedSecurityTerms = securityTermsMerge.rows[0] ?? null;

    const infoRightsMeta =
      infoRightsData != null
        ? (infoRightsMerge.overridden[infoRightsData.id] ?? {})
        : {};
    const roundTermsMeta =
      mergedRoundTerms != null
        ? (roundTermsMerge.overridden[mergedRoundTerms.id] ?? {})
        : {};
    const securityTermsMeta =
      mergedSecurityTerms != null
        ? (securityTermsMerge.overridden[mergedSecurityTerms.id] ?? {})
        : {};

    const legalTermsEdit: LegalTermsOverrideContext = {
      roundTermsId: mergedRoundTerms?.id ?? null,
      informationRightsId: mergedInfoRights?.id ?? null,
      securityTermsId: mergedSecurityTerms?.id ?? null,
      // Raw stored values — the tab renders these four through a formatter, so
      // the edit popup cannot take its current value from the display shape.
      values: {
        antiDilutionType: mergedSecurityTerms?.anti_dilution_type ?? null,
        liquidationSeniority:
          mergedSecurityTerms?.liquidation_seniority ?? null,
        dividendRate: mergedSecurityTerms?.dividend_rate ?? null,
        dividendSeniority: mergedSecurityTerms?.dividend_seniority ?? null,
      },
      overridden: {
        roundTerms: roundTermsMeta,
        informationRights: infoRightsMeta,
        securityTerms: securityTermsMeta,
      },
    };

    const investorStatusEdit: InvestorStatusOverrideContext = {
      informationRightsId: infoRightsData?.id ?? null,
      roundTermsId: mergedRoundTerms?.id ?? null,
      createTarget: pickCreateTarget(companyRounds ?? [], companyId),
      values: {
        isMajorInvestor: mergedInfoRights?.is_major_investor ?? false,
        infoRightsForMajor: mergedInfoRights?.info_rights_for_major ?? false,
        infoRightsForAll: mergedInfoRights?.info_rights_for_all ?? false,
        proRataRightsMajor: mergedRoundTerms?.pro_rata_rights_major ?? false,
        proRataRightsAll: mergedRoundTerms?.pro_rata_rights_all ?? false,
      },
      overridden: {
        is_major_investor: infoRightsMeta.is_major_investor,
        info_rights_for_major: infoRightsMeta.info_rights_for_major,
        info_rights_for_all: infoRightsMeta.info_rights_for_all,
        pro_rata_rights_major: roundTermsMeta.pro_rata_rights_major,
        pro_rata_rights_all: roundTermsMeta.pro_rata_rights_all,
      },
    };

    // Map information rights
    const informationRights: InvInformationRights | null = mergedInfoRights
      ? {
          id: mergedInfoRights.id,
          companyId: mergedInfoRights.company_id,
          organizationId: mergedInfoRights.organization_id,
          financingRoundId: mergedInfoRights.financing_round_id,
          effectiveDate: mergedInfoRights.effective_date,
          expirationDate: mergedInfoRights.expiration_date,
          isMajorInvestor: mergedInfoRights.is_major_investor,
          majorInvestorThreshold: mergedInfoRights.major_investor_threshold,
          infoRightsForMajor: mergedInfoRights.info_rights_for_major,
          infoRightsForAll: mergedInfoRights.info_rights_for_all,
          inspectionRights: mergedInfoRights.inspection_rights,
          capTableAccess: mergedInfoRights.cap_table_access,
          monthlyBalanceSheet: mergedInfoRights.monthly_balance_sheet,
          monthlyIncomeCashFlows: mergedInfoRights.monthly_income_cash_flows,
          monthlyStockholdersEquity:
            mergedInfoRights.monthly_stockholders_equity,
          monthlyCapTable: mergedInfoRights.monthly_cap_table,
          monthlyTimingDays: mergedInfoRights.monthly_timing_days,
          auditedMonthly: mergedInfoRights.audited_monthly,
          quarterlyBalanceSheet: mergedInfoRights.quarterly_balance_sheet,
          quarterlyIncomeCashFlows:
            mergedInfoRights.quarterly_income_cash_flows,
          quarterlyStockholdersEquity:
            mergedInfoRights.quarterly_stockholders_equity,
          quarterlyCapTable: mergedInfoRights.quarterly_cap_table,
          quarterlyTimingDays: mergedInfoRights.quarterly_timing_days,
          auditedQuarterly: mergedInfoRights.audited_quarterly,
          yearEndBalanceSheet: mergedInfoRights.year_end_balance_sheet,
          yearEndIncomeCashFlows: mergedInfoRights.year_end_income_cash_flows,
          yearEndStockholdersEquity:
            mergedInfoRights.year_end_stockholders_equity,
          yearEndCapTable: mergedInfoRights.year_end_cap_table,
          yearEndBudgetBusinessPlan:
            mergedInfoRights.year_end_budget_business_plan,
          yearEndTimingDays: mergedInfoRights.year_end_timing_days,
          auditedYearEnd: mergedInfoRights.audited_year_end,
          reportingContactName: mergedInfoRights.reporting_contact_name,
          reportingContactEmail: mergedInfoRights.reporting_contact_email,
          notes: mergedInfoRights.notes,
          metadata: mergedInfoRights.metadata,
        }
      : null;

    // Map round terms (post-override — see the merge above)
    const roundTerms: InvRoundTerms | null = mergedRoundTerms
      ? mapRoundTermsRow(mergedRoundTerms)
      : null;

    // Map security terms (post-override — see the merge above)
    const securityTerms: InvSecurityTerms | null = mergedSecurityTerms
      ? {
          id: mergedSecurityTerms.id,
          securityId: mergedSecurityTerms.security_id,
          effectiveDate: mergedSecurityTerms.effective_date,
          supersededDate: mergedSecurityTerms.superseded_date,
          originalIssuePrice: mergedSecurityTerms.original_issue_price,
          authorizedShares: mergedSecurityTerms.authorized_shares,
          issuedShares: mergedSecurityTerms.issued_shares,
          outstandingShares: mergedSecurityTerms.outstanding_shares,
          parValue: mergedSecurityTerms.par_value,
          conversionPrice: mergedSecurityTerms.conversion_price,
          conversionRatio: mergedSecurityTerms.conversion_ratio,
          antiDilutionType: mergedSecurityTerms.anti_dilution_type,
          aggregateLiqPref: mergedSecurityTerms.aggregate_liq_pref,
          liquidationMultiplier: mergedSecurityTerms.liquidation_multiplier,
          liquidationSeniority: mergedSecurityTerms.liquidation_seniority,
          participationType: mergedSecurityTerms.participation_type,
          participationCap: mergedSecurityTerms.participation_cap,
          dividendRate: mergedSecurityTerms.dividend_rate,
          dividendCumulative: mergedSecurityTerms.dividend_cumulative,
          dividendAccruing: mergedSecurityTerms.dividend_accruing,
          dividendSeniority: mergedSecurityTerms.dividend_seniority,
          valuationCap: mergedSecurityTerms.valuation_cap,
          discountRate: mergedSecurityTerms.discount_rate,
          interestRate: mergedSecurityTerms.interest_rate,
          interestType: mergedSecurityTerms.interest_type,
          maturityDate: mergedSecurityTerms.maturity_date,
          qualifiedFinancingThreshold:
            mergedSecurityTerms.qualified_financing_threshold,
        }
      : null;

    logger.debug(
      {
        companyId,
        hasInfoRights: !!informationRights,
        hasRoundTerms: !!roundTerms,
        hasSecurityTerms: !!securityTerms,
      },
      'Fetched legal terms',
    );

    // Map all round terms for per-round filtering (post-override)
    const allRoundTerms: InvRoundTerms[] =
      mergedAllRoundTerms.map(mapRoundTermsRow);

    return {
      informationRights,
      roundTerms,
      securityTerms,
      allRoundTerms,
      investorStatusEdit,
      legalTermsEdit,
    };
  },
);

/**
 * Get all funds for the current user's organization.
 *
 * @returns InvFundsResult with list of funds
 */
export const getInvFunds = cache(async (): Promise<InvFundsResult> => {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    return { funds: [], count: 0 };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inv_fund')
    .select('*')
    .eq('organization_id', userMetadata.organizationId)
    .order('name', { ascending: true });

  if (error) {
    logger.error(
      { error, organizationId: userMetadata.organizationId },
      'Failed to fetch funds',
    );
    return { funds: [], count: 0 };
  }

  const funds: InvFund[] = (data ?? []).map((row) => ({
    id: row.id,
    publicId: row.public_id,
    organizationId: row.organization_id,
    name: row.name,
    shortName: row.short_name,
    code: row.code,
    description: row.description,
    currency: row.currency,
    status: row.status,
    vintageYear: row.vintage_year,
    targetSize: row.target_size,
    committedCapital: row.committed_capital,
    metadata: row.metadata,
  }));

  logger.debug(
    { count: funds.length, organizationId: userMetadata.organizationId },
    'Fetched funds list',
  );

  return { funds, count: funds.length };
});

// =============================================================================
// CO-INVESTOR FUNCTIONS
// =============================================================================

/**
 * Get all co-investors for a portfolio company, joined with their financing round data.
 *
 * @param companyId - The inv_company.id
 * @returns InvCoInvestorsResult with list of co-investors enriched with round info
 */
export const getInvCoInvestors = cache(
  async (companyId: number): Promise<InvCoInvestorsResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return { coInvestors: [] };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('inv_co_investor')
      .select(
        `
        id,
        organization_id,
        financing_round_id,
        investor_name,
        investor_type,
        relationship,
        has_board_seat,
        is_major_investor,
        amount_invested,
        currency,
        inv_financing_round!inner (
          id,
          company_id,
          announced_date,
          initial_close_date,
          final_close_date,
          inv_stages (
            code,
            display_name
          )
        )
      `,
      )
      .eq('organization_id', userMetadata.organizationId)
      .eq('inv_financing_round.company_id', companyId)
      .order('investor_name', { ascending: true });

    if (error) {
      logger.error({ companyId, error }, 'Failed to fetch co-investors');
      return { coInvestors: [] };
    }

    const coInvestors: InvCoInvestor[] = (data ?? []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      financingRoundId: row.financing_round_id,
      investorName: row.investor_name,
      investorType: row.investor_type,
      relationship: row.relationship,
      hasBoardSeat: row.has_board_seat ?? false,
      isMajorInvestor: row.is_major_investor ?? false,
      amountInvested: row.amount_invested,
      currency: row.currency ?? 'USD',
      roundStageName:
        (row.inv_financing_round as any)?.inv_stages?.display_name ?? null,
      roundStageCode:
        (row.inv_financing_round as any)?.inv_stages?.code ?? null,
      roundDate:
        (row.inv_financing_round as any)?.initial_close_date ??
        (row.inv_financing_round as any)?.final_close_date ??
        (row.inv_financing_round as any)?.announced_date ??
        null,
    }));

    logger.debug(
      { companyId, count: coInvestors.length },
      'Fetched co-investors',
    );

    return { coInvestors };
  },
);

/**
 * Get co-investor network data for all co-investors in an organization.
 * Used to power the "Also in N other portcos" badge.
 *
 * @returns Map of investor_name → InvCoInvestorNetworkEntry
 */
export const getInvCoInvestorNetwork = cache(
  async (): Promise<Map<string, InvCoInvestorNetworkEntry>> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return new Map();
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('v_inv_co_investor_network')
      .select(
        'investor_name, investor_type, rounds_participated, companies_coinvested, company_names, total_coinvested',
      )
      .eq('organization_id', userMetadata.organizationId);

    if (error) {
      logger.error({ error }, 'Failed to fetch co-investor network');
      return new Map();
    }

    const result = new Map<string, InvCoInvestorNetworkEntry>();
    for (const row of data ?? []) {
      if (!row.investor_name) continue;
      result.set(row.investor_name, {
        investorName: row.investor_name,
        investorType: row.investor_type ?? null,
        roundsParticipated: row.rounds_participated ?? 0,
        companiesCoinvested: row.companies_coinvested ?? 0,
        companyNames: row.company_names ?? [],
        totalCoinvested: row.total_coinvested ?? null,
      });
    }

    logger.debug(
      { count: result.size, organizationId: userMetadata.organizationId },
      'Fetched co-investor network',
    );

    return result;
  },
);

// =============================================================================
// COMPOSITE FUNCTIONS
// =============================================================================

/**
 * Result type for getInvPortfolioCompany.
 */
export interface InvPortfolioCompanyResult {
  company: PortfolioCompany;
  /** Active value-override lineage for badges/tooltips (no re-fetching). */
  overrides: {
    /** Company Details section fields keyed by inv_company field. */
    companyDetails: Record<string, AppliedOverrideMeta>;
    valuation: ValuationOverrides;
    /** Keyed by transaction id, then column. */
    transactions: OverrideMetadataByEntity;
    /** Latest inv_cap_table_snapshot.id — entity_id for snapshot edit actions. */
    latestSnapshotId: number | null;
    /** Post-override values + source ids for the editable Investor Status UI. */
    investorStatus: InvestorStatusOverrideContext;
    /** Source ids + override metadata for the editable Legal Terms tab. */
    legalTerms: LegalTermsOverrideContext;
  };
}

/**
 * Get a complete portfolio company with all related data.
 * Orchestrates all data fetches in parallel and transforms to PortfolioCompany.
 *
 * @param publicId - The public_id of the inv_company record
 * @returns InvPortfolioCompanyResult with complete PortfolioCompany data
 * @throws NotFoundError if company not found
 */
/**
 * Get financing rounds for a portfolio company.
 * Joins inv_stages for stage information.
 *
 * @param companyId - The inv_company.id
 * @returns Array of financing rounds
 */
export const getInvFinancingRounds = cache(
  async (companyId: number): Promise<InvFinancingRound[]> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return [];
    }

    const supabase = await createClient();
    try {
      const { data, error } = await supabase
        .from('inv_financing_round')
        .select(
          `
        id,
        public_id,
        company_id,
        organization_id,
        name,
        stage_id,
        currency,
        pre_money_valuation,
        announced_date,
        initial_close_date,
        final_close_date,
        notes,
        external_id,
        metadata,
        inv_stages (
          id,
          code,
          display_name
        )
      `,
        )
        .eq('company_id', companyId)
        .eq('organization_id', userMetadata.organizationId)
        .order('initial_close_date', { ascending: true });

      if (error) {
        logger.error({ companyId, error }, 'Failed to fetch financing rounds');
        throw error instanceof DatabaseError
          ? error
          : new DatabaseError('Financing rounds');
      }

      return (data ?? []).map((row) => ({
        id: row.id,
        publicId: row.public_id,
        companyId: row.company_id,
        organizationId: row.organization_id,
        name: row.name,
        stageId: row.stage_id,
        stageName: row.inv_stages?.display_name ?? null,
        stageCode: row.inv_stages?.code ?? null,
        currency: row.currency,
        preMoneyValuation: row.pre_money_valuation,
        announcedDate: row.announced_date,
        initialCloseDate: row.initial_close_date,
        finalCloseDate: row.final_close_date,
        notes: row.notes,
        externalId: row.external_id,
        metadata: row.metadata,
        impliedValuation: null,
      }));
    } catch (error) {
      logger.error({ companyId, error }, 'Failed to fetch financing rounds');
      throw error instanceof DatabaseError
        ? error
        : new DatabaseError('Financing rounds');
    }
  },
);

/**
 * Get equity plan snapshots for a portfolio company.
 *
 * @param companyId - The inv_company.id
 * @returns InvEquityPlanSnapshotsResult with list of equity plan snapshots
 */
export const getInvEquityPlanSnapshots = cache(
  async (companyId: number): Promise<InvEquityPlanSnapshotsResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return { snapshots: [] };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('inv_equity_plan_snapshot')
      .select(
        `
        *,
        inv_equity_plan!inner (
          id,
          name,
          company_id
        )
      `,
      )
      .eq('inv_equity_plan.company_id', companyId)
      .eq('organization_id', userMetadata.organizationId)
      .order('effective_date', { ascending: false });

    if (error) {
      logger.error(
        { companyId, error },
        'Failed to fetch equity plan snapshots',
      );
      return { snapshots: [] };
    }

    const snapshots: InvEquityPlanSnapshot[] = (data ?? []).map((row) => ({
      id: row.id,
      planId: row.plan_id,
      organizationId: row.organization_id,
      effectiveDate: row.effective_date,
      authorizedShares: row.authorized_shares,
      issuedShares: row.issued_shares,
      outstandingOptions: row.outstanding_options,
      exercisedShares: row.exercised_shares,
      cancelledShares: row.cancelled_shares,
      poolPercentFd: row.pool_percent_fd,
      metadata: row.metadata,
      planName: row.inv_equity_plan.name,
    }));

    logger.debug(
      { companyId, count: snapshots.length },
      'Fetched equity plan snapshots',
    );

    return { snapshots };
  },
);

export const getInvPortfolioCompany = cache(
  async (publicId: string): Promise<InvPortfolioCompanyResult> => {
    // First fetch the company to get the internal ID
    const { company: baseInvCompany } = await getInvCompany(publicId);
    const companyActiveOverrides = await getActiveValueOverrides(
      baseInvCompany.organizationId,
    );
    const { company: invCompany, overridden: companyDetailsOverrides } =
      applyCompanyDetailOverrides(baseInvCompany, companyActiveOverrides);
    const companyId = invCompany.id;

    // Fetch all related data in parallel
    const [
      valuationResult,
      transactionsResult,
      boardResult,
      investorStatusResult,
      securitiesResult,
      legalTermsResult,
      financingRounds,
      capTableSnapshots,
      equityPlanResult,
      coInvestorsResult,
      coInvestorNetwork,
      enrichment,
    ] = await Promise.all([
      getInvCompanyValuation(companyId),
      getInvTransactions(companyId),
      getInvBoardComposition(companyId),
      getInvInvestorStatus(companyId),
      getInvSecurities(companyId),
      getInvLegalTerms(companyId),
      getInvFinancingRounds(companyId),
      getInvAllCapTableSnapshots(companyId),
      getInvEquityPlanSnapshots(companyId),
      getInvCoInvestors(companyId),
      getInvCoInvestorNetwork(),
      fetchCompanyEnrichment(invCompany.domain ?? ''),
    ]);

    // Transform to PortfolioCompany
    const company = transformInvToPortfolioCompany(
      invCompany,
      valuationResult.valuation,
      transactionsResult.transactions,
      boardResult.members,
      investorStatusResult,
      securitiesResult.securities,
      capTableSnapshots,
      {
        informationRights: legalTermsResult.informationRights,
        roundTerms: legalTermsResult.roundTerms,
        securityTerms: legalTermsResult.securityTerms,
        allRoundTerms: legalTermsResult.allRoundTerms,
        overriddenKeys: toOverriddenLegalTermsKeys(
          legalTermsResult.legalTermsEdit,
        ),
      },
      financingRounds,
      equityPlanResult.snapshots,
      coInvestorsResult.coInvestors,
      coInvestorNetwork,
      enrichment ?? undefined,
      overriddenValuationFieldSet(valuationResult.overridden),
      valuationResult.overridden.fields.myFmv?.createdAt ?? null,
    );

    logger.debug(
      { publicId, companyId, companyName: company.name },
      'Fetched complete portfolio company',
    );

    return {
      company,
      overrides: {
        companyDetails: companyDetailsOverrides,
        valuation: valuationResult.overridden,
        transactions: transactionsResult.overridden,
        // Must resolve to the same row fetchSnapshotForValuationOverrides
        // reads, or edits land on a snapshot the merge never looks at.
        latestSnapshotId: pickLatestSnapshot(capTableSnapshots)?.id ?? null,
        investorStatus: legalTermsResult.investorStatusEdit,
        legalTerms: legalTermsResult.legalTermsEdit,
      },
    };
  },
);

/**
 * Result type for getInvPortfolioCompanies.
 */
export interface InvPortfolioCompaniesResult {
  companies: PortfolioCompany[];
  count: number;
  /** Valuation override lineage per inv_company id (= entityId). */
  overrides: Record<number, ValuationOverrides>;
}

/**
 * Options for fetching portfolio companies with summary data.
 */
export interface GetInvPortfolioCompaniesOptions {
  /** Filter companies to only those with transactions from this fund. */
  fundId?: number;
}

/**
 * Get all portfolio companies with summary data.
 *
 * @param options - Optional filtering options (e.g., fundId)
 * @returns InvPortfolioCompaniesResult with list of companies
 */
/** PostgREST caps responses at `max_rows` (1000), so read every page. */
const DB_PAGE_SIZE = 1000;

interface CompanyIdPage {
  data: { company_id: number | null }[] | null;
  error: { message: string } | null;
}

/**
 * Reads `company_id` across every page of a query into `into`.
 *
 * These reads carry a row per company x period (x kpi), so one org runs to
 * thousands of rows: unpaged, PostgREST answered for whichever companies landed
 * in the first page and the rest lost their KPI signal.
 */
async function collectCompanyIds(
  into: Set<number>,
  readPage: (from: number, to: number) => PromiseLike<CompanyIdPage>,
): Promise<{ message: string } | null> {
  for (let offset = 0; ; offset += DB_PAGE_SIZE) {
    const { data, error } = await readPage(offset, offset + DB_PAGE_SIZE - 1);
    if (error) {
      return error;
    }
    for (const row of data ?? []) {
      if (row.company_id != null) {
        into.add(row.company_id);
      }
    }
    if (!data || data.length < DB_PAGE_SIZE) {
      return null;
    }
  }
}

async function fetchKpiBackedCompanyIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  companyIds: number[],
): Promise<Set<number>> {
  const kpiBackedIds = new Set<number>();
  if (companyIds.length === 0) {
    return kpiBackedIds;
  }

  const [kpiError, submissionError] = await Promise.all([
    collectCompanyIds(kpiBackedIds, (from, to) =>
      supabase
        .from('inv_kpi_value')
        .select('company_id')
        .eq('organization_id', organizationId)
        .in('company_id', companyIds)
        .order('company_id')
        .order('id')
        .range(from, to),
    ),
    collectCompanyIds(kpiBackedIds, (from, to) =>
      supabase
        .from('inv_reporting_submission')
        .select('company_id')
        .eq('organization_id', organizationId)
        .not('submitted_at', 'is', null)
        .in('company_id', companyIds)
        .order('company_id')
        .order('id')
        .range(from, to),
    ),
  ]);

  if (kpiError || submissionError) {
    logger.error(
      { error: kpiError ?? submissionError, organizationId },
      'Failed to fetch KPI-backed company ids',
    );
  }

  return kpiBackedIds;
}

export const getScopedPortfolioInvCompanies = cache(
  async (options?: GetInvPortfolioCompaniesOptions): Promise<InvCompany[]> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return [];
    }

    const { companies: allInvCompanies } = await getInvCompanies(options);

    if (allInvCompanies.length === 0) {
      return [];
    }

    const supabase = await createClient();

    const companiesWithAnyDoc = new Set<number>();
    const publishedCompanyIds = new Set<number>();

    // An org's document count runs well past a single PostgREST page, and a
    // company whose published document fell outside it read as "documents, none
    // published" and dropped out of the portfolio.
    for (let offset = 0; ; offset += DB_PAGE_SIZE) {
      const { data: docsPage, error: docsError } = await supabase
        .from('module_documents')
        .select('company_id, status_id')
        .eq('organization_id', userMetadata.organizationId)
        .eq('is_deleted', false)
        .not('company_id', 'is', null)
        .order('id')
        .range(offset, offset + DB_PAGE_SIZE - 1);

      if (docsError) {
        logger.error(
          { error: docsError, organizationId: userMetadata.organizationId },
          'Failed to fetch doc company ids for portfolio filter',
        );
        return [];
      }

      (docsPage ?? []).forEach((row) => {
        if (row.company_id == null) return;
        companiesWithAnyDoc.add(row.company_id);
        if (row.status_id === MODULE_DOCUMENT_STATUS_IDS.PUBLISHED) {
          publishedCompanyIds.add(row.company_id);
        }
      });

      if (!docsPage || docsPage.length < DB_PAGE_SIZE) {
        break;
      }
    }

    // Only companies that the published gate would drop need the extra lookup;
    // `inv_kpi_value` holds a row per kpi x period x company, so an org-wide read
    // here would be far larger than the answer requires.
    const candidateIds = allInvCompanies
      .map((c) => c.id)
      .filter(
        (id) => companiesWithAnyDoc.has(id) && !publishedCompanyIds.has(id),
      );

    // Additive signal, so a failure inside the lookup degrades to the
    // published-only rule rather than emptying the portfolio the way the
    // docs-query path does.
    const reportingCompanyIds = await fetchKpiBackedCompanyIds(
      supabase,
      userMetadata.organizationId,
      candidateIds,
    );

    return allInvCompanies.filter(
      (c) =>
        publishedCompanyIds.has(c.id) ||
        reportingCompanyIds.has(c.id) ||
        !companiesWithAnyDoc.has(c.id),
    );
  },
);

export const getInvPortfolioCompanies = cache(
  async (
    options?: GetInvPortfolioCompaniesOptions,
  ): Promise<InvPortfolioCompaniesResult> => {
    const invCompanies = await getScopedPortfolioInvCompanies(options);

    if (invCompanies.length === 0) {
      return { companies: [], count: 0, overrides: {} };
    }

    const companyIds = invCompanies.map((c) => c.id);

    // Fetch valuations and latest cap table snapshots in parallel
    const [valuationResults, latestSnapshots] = await Promise.all([
      Promise.all(invCompanies.map((c) => getInvCompanyValuation(c.id))),
      getInvLatestCapTableSnapshotBatch(companyIds),
    ]);

    const transformed = invCompanies.map((invCompany, idx) => {
      const valuationResult = valuationResults[idx];
      const latestSnapshot = latestSnapshots.get(invCompany.id);

      return transformInvToPortfolioCompany(
        invCompany,
        valuationResult.valuation,
        [], // No transactions for list view
        [], // No board members for list view
        {
          hasBoardSeat: false,
          isMajorInvestor: false,
          hasProRataRights: false,
          hasInformationRights: false,
        },
        undefined, // securities
        latestSnapshot ? [latestSnapshot] : undefined,
        undefined, // legalTerms
        undefined, // financingRounds
        undefined, // equityPlanSnapshots
        undefined, // rawCoInvestors
        undefined, // coInvestorNetwork
        undefined, // enrichment
        overriddenValuationFieldSet(valuationResult.overridden),
        valuationResult.overridden.fields.myFmv?.createdAt ?? null,
      );
    });

    // Only a portco without transaction data needs the KPI lookup — it is the
    // only case whose Data Coverage label turns on the answer, and scoping the
    // read to those ids keeps it off the org-wide `inv_kpi_value` path.
    const kpiCandidateIds = transformed
      .filter((c) => !c.hasTransactionData)
      .map((c) => c.entityId);
    const kpiBackedIds = await fetchKpiBackedCompanyIds(
      await createClient(),
      invCompanies[0].organizationId,
      kpiCandidateIds,
    );

    const companies = transformed.map((company) =>
      company.hasTransactionData
        ? company
        : { ...company, hasKpiData: kpiBackedIds.has(company.entityId) },
    );

    logger.debug(
      { count: companies.length },
      'Fetched portfolio companies list',
    );

    const overridesByCompanyId: Record<number, ValuationOverrides> = {};
    invCompanies.forEach((invCompany, idx) => {
      const overridden = valuationResults[idx].overridden;
      if (
        Object.keys(overridden.fields).length > 0 ||
        overridden.recomputed.length > 0
      ) {
        overridesByCompanyId[invCompany.id] = overridden;
      }
    });

    return {
      companies,
      count: companies.length,
      overrides: overridesByCompanyId,
    };
  },
);

/**
 * Funds that hold at least one company in the user's visible portfolio.
 *
 * An org's inv_fund rows include funds with no portfolio holdings (raised but
 * undeployed, wound down, imported bookkeeping entities). Selecting one filters
 * every view to nothing, so fund pickers narrow to the same fund set the
 * company sidebar derives from the portfolio.
 *
 * @returns InvFundsResult with funds tagged to visible portfolio companies
 */
export const getInvPortfolioFunds = cache(async (): Promise<InvFundsResult> => {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    return { funds: [], count: 0 };
  }

  const invCompanies = await getScopedPortfolioInvCompanies();
  if (invCompanies.length === 0) {
    return { funds: [], count: 0 };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('v_inv_company_valuation')
    .select('fund_ids')
    .eq('organization_id', userMetadata.organizationId)
    .in(
      'company_id',
      invCompanies.map((c) => c.id),
    );

  if (error) {
    logger.error(
      { error, organizationId: userMetadata.organizationId },
      'Failed to fetch portfolio fund associations',
    );
    return { funds: [], count: 0 };
  }

  const portfolioFundIds = new Set(
    (data ?? []).flatMap((row) => row.fund_ids ?? []),
  );

  const { funds: allFunds } = await getInvFunds();
  const funds = allFunds.filter((f) => portfolioFundIds.has(f.id));

  logger.debug(
    {
      count: funds.length,
      totalFunds: allFunds.length,
      organizationId: userMetadata.organizationId,
    },
    'Fetched portfolio funds list',
  );

  return { funds, count: funds.length };
});

/**
 * A single capital-deployment transaction, fund-tagged so the dashboard chart
 * can filter by selected fund client-side without refetching.
 */
export interface InvInvestmentFlow {
  date: string;
  amount: number;
  fundId: number | null;
  companyName: string;
}

export interface InvInvestmentFlowsResult {
  flows: InvInvestmentFlow[];
}

/**
 * Investment-flow transactions across the portfolio, kept lightweight (date,
 * amount, fund) so the Investments chart can fetch its own data instead of
 * hydrating full transactions onto every portfolio company.
 */
export const getInvInvestmentFlows = cache(
  async (
    options?: GetInvPortfolioCompaniesOptions,
  ): Promise<InvInvestmentFlowsResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return { flows: [] };
    }

    const invCompanies = await getScopedPortfolioInvCompanies(options);
    if (invCompanies.length === 0) {
      return { flows: [] };
    }

    const companyIds = invCompanies.map((c) => c.id);
    const nameById = new Map(invCompanies.map((c) => [c.id, c.name]));
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('inv_transaction')
      .select('transaction_date, amount, fund_id, company_id')
      .eq('organization_id', userMetadata.organizationId)
      .in('company_id', companyIds)
      // Allowlist, not a blocklist: the chart must show exactly the rows that
      // book cost, so a transaction type added to inv_transaction_type_ck later
      // stays off the chart until it is added to the cost list.
      .in('transaction_type', POSITION_COST_TRANSACTION_TYPES)
      .order('transaction_date', { ascending: true });

    if (error) {
      logger.error(
        { error, organizationId: userMetadata.organizationId },
        'Failed to fetch investment flows',
      );
      return { flows: [] };
    }

    const flows: InvInvestmentFlow[] = (data ?? [])
      .filter((row) => row.transaction_date != null && row.amount != null)
      .map((row) => ({
        date: row.transaction_date as string,
        // Purchases are stored negative (cash outflow); only
        // POSITION_COST_TRANSACTION_TYPES rows survive the filter above, so
        // every remaining row is capital deployed. Take magnitude to match the
        // Math.abs cost basis used everywhere else (transforms.ts) — otherwise
        // the chart's `amount > 0` filter drops nearly every purchase.
        amount: Math.abs(Number(row.amount)),
        fundId: row.fund_id ?? null,
        companyName: nameById.get(row.company_id) ?? 'Unknown',
      }));

    return { flows };
  },
);

export interface InvCashFlow {
  date: string;
  amount: number;
  companyId: number;
}

export interface InvCashFlowsResult {
  cashFlows: InvCashFlow[];
}

/**
 * Signed, dated cash flows per company for gross IRR. Outflows negative, inflows
 * positive. Tagged by companyId (not fund) so the dashboard can scope IRR to the
 * exact same company set as the TVPI/DPI tiles when a fund filter is applied.
 */
export const getInvCashFlows = cache(
  async (
    options?: GetInvPortfolioCompaniesOptions,
  ): Promise<InvCashFlowsResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return { cashFlows: [] };
    }

    const invCompanies = await getScopedPortfolioInvCompanies(options);
    if (invCompanies.length === 0) {
      return { cashFlows: [] };
    }

    const companyIds = invCompanies.map((c) => c.id);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('inv_transaction')
      .select('transaction_date, amount, company_id, transaction_type')
      .eq('organization_id', userMetadata.organizationId)
      .in('company_id', companyIds)
      .in('transaction_type', [...IRR_OUTFLOW_TYPES, ...IRR_INFLOW_TYPES])
      .order('transaction_date', { ascending: true });

    if (error) {
      logger.error(
        { error, organizationId: userMetadata.organizationId },
        'Failed to fetch cash flows',
      );
      return { cashFlows: [] };
    }

    const cashFlows: InvCashFlow[] = (data ?? [])
      .filter((row) => row.transaction_date != null && row.amount != null)
      .map((row) => {
        const magnitude = Math.abs(Number(row.amount));
        const isInflow = (IRR_INFLOW_TYPES as readonly string[]).includes(
          row.transaction_type as string,
        );
        return {
          date: row.transaction_date as string,
          amount: isInflow ? magnitude : -magnitude,
          companyId: row.company_id as number,
        };
      });

    return { cashFlows };
  },
);

// =============================================================================
// MISSING DOCUMENTS
// =============================================================================

export interface GetInvMissingDocumentsOptions {
  /** Filter to a single company by inv_company.id */
  companyId?: number;
}

/**
 * Get missing documents report across all portfolio companies.
 * Compares expected documents (from inv_transaction_agreement) against
 * received documents (module_documents with matching document_type code)
 * for each company.
 */
export const getInvMissingDocuments = cache(
  async (
    options?: GetInvMissingDocumentsOptions,
  ): Promise<MissingDocumentsResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return { companies: [], totalMissing: 0, companiesWithMissing: 0 };
    }

    const supabase = await createClient();
    const orgId = userMetadata.organizationId;

    try {
      // 1. Fetch all expected transaction agreements for this org
      let agreementsQuery = supabase
        .from('inv_transaction_agreement')
        .select(
          `
          id,
          company_id,
          financing_round_id,
          defined_name,
          document_type,
          inv_company!inv_transaction_agreement_company_id_fkey (
            id,
            public_id,
            inv_companies!inv_company_company_id_fkey (
              name
            )
          )
        `,
        )
        .eq('organization_id', orgId);

      if (options?.companyId) {
        agreementsQuery = agreementsQuery.eq('company_id', options.companyId);
      }

      const { data: agreements, error: agError } = await agreementsQuery;

      if (agError) {
        logger.error(
          { error: agError, organizationId: orgId },
          'Failed to fetch transaction agreements',
        );
        return { companies: [], totalMissing: 0, companiesWithMissing: 0 };
      }

      if (!agreements || agreements.length === 0) {
        return { companies: [], totalMissing: 0, companiesWithMissing: 0 };
      }

      // 2. Get company IDs that have agreements
      const companyIds = [...new Set(agreements.map((a) => a.company_id))];

      // 3. Fetch documents for these companies to check what's received
      const { data: documents, error: docError } = await supabase
        .from('module_documents')
        .select(
          `
          id,
          company_id,
          document_types!module_documents_document_type_id_fkey (
            code,
            name
          )
        `,
        )
        .eq('organization_id', orgId)
        .eq('is_deleted', false)
        .in('company_id', companyIds);

      if (docError) {
        logger.error(
          { error: docError, organizationId: orgId },
          'Failed to fetch documents for missing docs report',
        );
        return { companies: [], totalMissing: 0, companiesWithMissing: 0 };
      }

      // 4. Fetch fund associations for the companies (via valuation view for fund names)
      const { data: valuations } = await supabase
        .from('v_inv_company_valuation')
        .select(
          'company_id, fund_ids, primary_fund_name, primary_fund_short_name',
        )
        .eq('organization_id', orgId)
        .in('company_id', companyIds);

      // 5. Build a map of received doc type codes per company
      const receivedByCompany = new Map<number, Set<string>>();
      for (const doc of documents ?? []) {
        const cid = doc.company_id as number;
        const code = (
          doc.document_types as { code: string; name: string } | null
        )?.code;
        if (!code) continue;
        if (!receivedByCompany.has(cid)) {
          receivedByCompany.set(cid, new Set());
        }
        receivedByCompany.get(cid)!.add(code);
      }

      // 6. Build fund info map
      const fundInfoByCompany = new Map<
        number,
        { fundName: string | null; fundIds: number[] }
      >();
      for (const v of valuations ?? []) {
        fundInfoByCompany.set(v.company_id as number, {
          fundName:
            (v.primary_fund_short_name as string | null) ??
            (v.primary_fund_name as string | null),
          fundIds: (v.fund_ids as number[]) ?? [],
        });
      }

      // 7. Group agreements by company and compute missing/received
      const companyAgreements = new Map<
        number,
        {
          companyPublicId: string;
          companyName: string;
          agreements: { definedName: string; documentType: string | null }[];
        }
      >();

      for (const ag of agreements) {
        const cid = ag.company_id;
        const invCompany = ag.inv_company as {
          id: number;
          public_id: string;
          inv_companies: { name: string } | null;
        } | null;

        if (!invCompany) continue;

        if (!companyAgreements.has(cid)) {
          companyAgreements.set(cid, {
            companyPublicId: invCompany.public_id,
            companyName: invCompany.inv_companies?.name ?? 'Unknown',
            agreements: [],
          });
        }

        companyAgreements.get(cid)!.agreements.push({
          definedName: ag.defined_name,
          documentType: ag.document_type,
        });
      }

      // 8. Build final rows
      const companies: MissingDocumentCompanyRow[] = [];
      let totalMissing = 0;
      let companiesWithMissing = 0;

      for (const [companyId, info] of companyAgreements) {
        const received = receivedByCompany.get(companyId) ?? new Set<string>();
        const fundInfo = fundInfoByCompany.get(companyId);

        const receivedDocTypes: string[] = [];
        const missingDocTypes: {
          definedName: string;
          documentType: string | null;
        }[] = [];

        for (const ag of info.agreements) {
          if (ag.documentType && received.has(ag.documentType)) {
            receivedDocTypes.push(ag.definedName);
          } else {
            missingDocTypes.push(ag);
          }
        }

        const missingCount = missingDocTypes.length;
        totalMissing += missingCount;
        if (missingCount > 0) {
          companiesWithMissing += 1;
        }

        companies.push({
          companyId,
          companyPublicId: info.companyPublicId,
          companyName: info.companyName,
          fundName: fundInfo?.fundName ?? null,
          fundIds: fundInfo?.fundIds ?? [],
          totalExpected: info.agreements.length,
          receivedDocTypes,
          missingDocTypes,
          missingCount,
        });
      }

      // Sort: companies with missing docs first, then by missing count descending
      companies.sort((a, b) => b.missingCount - a.missingCount);

      return { companies, totalMissing, companiesWithMissing };
    } catch (error) {
      logger.error(
        { error, organizationId: orgId },
        'Unexpected error in getInvMissingDocuments',
      );
      return { companies: [], totalMissing: 0, companiesWithMissing: 0 };
    }
  },
);
