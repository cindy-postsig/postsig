/**
 * Investor Portfolio Transforms (inv_* schema)
 *
 * Transform functions to map inv_* data to UI types.
 * Bridges the new schema with existing component contracts.
 */

import type {
  PortfolioCompany,
  InvestmentTransaction,
  TransactionFlowType,
  BoardMember,
  LegalTerms,
  InformationRights,
  MajorInvestor,
  EconomicRights,
  QSBS,
  Dividends,
  OtherLegalTerms,
  FrequencyFlags,
  CapTableData,
  CapTableSnapshot,
  CapTableTransaction,
  EquityPlanSnapshot,
  SecurityRow,
  PreferredEquityClass,
  InvestmentStage,
  LiqPrefData,
  LiqPrefRow,
  CoInvestor,
  CoInvestorInvestment,
} from './types';
import type {
  InvCompany,
  InvCompanyValuation,
  InvFinancingRound,
  InvTransaction,
  InvBoardSeat,
  InvCapTableSnapshot,
  InvSecurity,
  InvInformationRights,
  InvRoundTerms,
  InvSecurityTerms,
  InvInvestorStatusResult,
  InvEquityPlanSnapshot,
  CapTableDetailLegalTerms,
  CapTableDetailInvestorStatus,
  InvCoInvestor,
  InvCoInvestorNetworkEntry,
  LegalTermsOverrideContext,
} from './types';
import type { Json } from '@/database.types';
import type { CompanyEnrichment } from '@/lib/v2/companies/enrichment';
import { lowerCase } from 'lodash';
import {
  resolveTransactionStage,
  transformTransactionType,
  resolveEntityType,
  isSyntheticStageCode,
  mapStageToInvestmentStage,
  POSITION_COST_TRANSACTION_TYPES,
  POSITION_PROCEEDS_TRANSACTION_TYPES,
} from './stage-utils';
import { hasInvTransactionData } from './data-coverage';
import _ from 'lodash';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates default frequency flags.
 */
function createDefaultFrequencyFlags(): FrequencyFlags {
  return {
    monthly: false,
    quarterly: false,
    yearEnd: false,
  };
}

/**
 * Source columns carrying an active value override, grouped by table. Consumed by
 * applySnapshotLegalTerms so a portfolio_import snapshot never overlays a value
 * the user has edited.
 */
export interface OverriddenLegalTermsKeys {
  roundTerms?: ReadonlySet<string>;
  securityTerms?: ReadonlySet<string>;
  informationRights?: ReadonlySet<string>;
}

/**
 * Build the overlay-suppression key sets from a Legal Terms override context.
 *
 * Shared by the company page and the MCP company tool: the tool exists to mirror
 * what the page shows, so if the two derived these sets separately one could
 * start suppressing a snapshot overlay the other still applies, and the tool and
 * the page would disagree on an imported portco. Covers every group of
 * OverriddenLegalTermsKeys — add new groups here, not at the call sites.
 */
export function toOverriddenLegalTermsKeys(
  edit: LegalTermsOverrideContext,
): OverriddenLegalTermsKeys {
  return {
    roundTerms: new Set(Object.keys(edit.overridden.roundTerms)),
    securityTerms: new Set(Object.keys(edit.overridden.securityTerms)),
    informationRights: new Set(Object.keys(edit.overridden.informationRights)),
  };
}

/**
 * Some rate columns (dividend / interest / discount) are stored
 * inconsistently — sometimes as a fraction (0.08 = 8%), sometimes as a
 * percentage (8 = 8%). Treat values strictly less than 1 as fractions and
 * scale to a percentage. A real rate below 1% would be misclassified, but
 * term-sheet rates that low basically don't occur. This is why the registry's
 * dividend_rate rule rejects the (0, 1) interval — a value stored there would
 * render 100x too large.
 */
function normalizeRatePercent(value: number | null): number | null {
  if (value == null) return null;
  const pct = value < 1 ? value * 100 : value;
  return Math.round(pct * 1e4) / 1e4;
}

function mapAntiDilutionType(antiDilutionType: string): string {
  switch (lowerCase(antiDilutionType)) {
    case 'broad_based':
    case 'broad based':
      return 'Broad-Based Weighted Average';
    case 'weighted_average':
      return 'Weighted Average';
    case 'narrow_based':
    case 'narrow based':
      return 'Narrow-Based Weighted Average';
    case 'full_ratchet':
    case 'full ratchet':
      return 'Full Ratchet';
    case 'none':
      return 'None';
    default:
      return antiDilutionType;
  }
}

function getStringFromJson(value: Json | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function getJsonRecord(value: Json | undefined): Record<string, Json> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null;
}

function getAffiliateTransferFundName(
  metadata: Json,
  fundKey: 'source_fund' | 'destination_fund',
): string | undefined {
  const metadataRecord = getJsonRecord(metadata);
  if (!metadataRecord) return undefined;

  return (
    getStringFromJson(metadataRecord[fundKey]) ??
    getStringFromJson(
      getJsonRecord(metadataRecord.at_transfer_details)?.[fundKey],
    ) ??
    getStringFromJson(getJsonRecord(metadataRecord.transfer_details)?.[fundKey])
  );
}

function resolveTransactionEntityName(tx: InvTransaction): string | undefined {
  if (tx.transactionType === 'affiliate_transfer_from') {
    return (
      getAffiliateTransferFundName(tx.metadata, 'source_fund') ??
      tx.fund?.name ??
      tx.fund?.shortName ??
      undefined
    );
  }

  if (tx.transactionType === 'affiliate_transfer_to') {
    return (
      getAffiliateTransferFundName(tx.metadata, 'destination_fund') ??
      tx.fund?.name ??
      tx.fund?.shortName ??
      undefined
    );
  }

  return tx.fund?.name ?? tx.fund?.shortName ?? undefined;
}

// =============================================================================
// MAIN TRANSFORM FUNCTIONS
// =============================================================================

/**
 * Transform inv_* data to PortfolioCompany type.
 * This is the main transform function that maps all the data together.
 */
/**
 * Group raw co-investor rows by investor name and merge network badge data.
 */
function transformInvCoInvestors(
  rawCoInvestors: InvCoInvestor[],
  network: Map<string, InvCoInvestorNetworkEntry>,
  currentCompanyName?: string,
): CoInvestor[] {
  const grouped = new Map<string, InvCoInvestor[]>();
  for (const ci of rawCoInvestors) {
    const existing = grouped.get(ci.investorName) ?? [];
    existing.push(ci);
    grouped.set(ci.investorName, existing);
  }

  return Array.from(grouped.entries()).map(([investorName, rows]) => {
    const networkEntry = network.get(investorName);
    const investments: CoInvestorInvestment[] = [...rows]
      .sort((a, b) => {
        if (a.roundDate && b.roundDate)
          return a.roundDate.localeCompare(b.roundDate);
        if (a.roundDate) return -1;
        if (b.roundDate) return 1;
        return a.financingRoundId - b.financingRoundId;
      })
      .map((row) => ({
        financingRoundId: row.financingRoundId,
        date: row.roundDate,
        stageName: row.roundStageName,
        stageCode: row.roundStageCode,
        totalInvestment: row.amountInvested,
        currency: row.currency,
      }));

    // otherCompanyNames excludes the current company
    const otherCompanyNames = (networkEntry?.companyNames ?? []).filter(
      (name) => name !== currentCompanyName,
    );

    return {
      investorName,
      investorType: rows[0].investorType,
      roundsCount: rows.length,
      companiesCoinvested: networkEntry?.companiesCoinvested ?? 1,
      otherCompanyNames,
      investments,
    };
  });
}

/**
 * The company's latest cap table snapshot: newest snapshotDate, ties broken by
 * highest id.
 *
 * (company_id, snapshot_date) is NOT unique — the table's UNIQUE is
 * (company_id, snapshot_date, snapshot_type_id), so a company legitimately
 * carries e.g. a round_close and a portfolio_import snapshot on the same date.
 * Value overrides are keyed by row id, so every "latest snapshot" lookup must
 * agree on the tie-break or an edit written against one row is invisible to
 * the other.
 *
 * Keep in sync with fetchSnapshotForValuationOverrides (service.ts) and the
 * v_inv_company_valuation lateral join.
 */
export function pickLatestSnapshot<
  T extends { id: number; snapshotDate: string },
>(snapshots: readonly T[]): T | null {
  return snapshots.reduce<T | null>((best, s) => {
    if (!best) return s;
    if (s.snapshotDate !== best.snapshotDate) {
      return s.snapshotDate > best.snapshotDate ? s : best;
    }
    return s.id > best.id ? s : best;
  }, null);
}

/**
 * The snapshot that states which equity classes currently exist (psk-1854).
 *
 * This is the latest non-`portfolio_import` snapshot. When a synthetic-stage
 * snapshot (reclassification, reverse/forward split) exists at or before it,
 * that restatement is what makes class membership authoritative — classes it
 * omits have been restated away. Because the latest snapshot already reflects
 * every restatement before it, the latest one is the effective statement
 * either way; the synthetic check exists so that with no restatement in the
 * company's history we return null and callers keep their prior behavior.
 */
export function pickRestatedSnapshot(
  snapshots: readonly InvCapTableSnapshot[],
): InvCapTableSnapshot | null {
  const eligible = snapshots.filter(
    (s) => s.snapshotTypeCode !== 'portfolio_import',
  );
  const hasRestatement = eligible.some((s) =>
    isSyntheticStageCode(s.stageCode),
  );
  if (!hasRestatement) return null;
  return pickLatestSnapshot(eligible);
}

/**
 * Equity class names listed in a snapshot's cap_table_detail, lowercased and
 * trimmed for matching. Returns null when the snapshot carries no per-security
 * detail — membership is then undeterminable and callers must not filter.
 *
 * Caveat: matching is by class NAME, the only join available between
 * inv_security rows and cap_table_detail entries. A class renamed in the
 * snapshot but not on the security (or vice versa) reads as absent.
 */
export function snapshotClassNames(
  snapshot: InvCapTableSnapshot | undefined,
): Set<string> | null {
  if (!snapshot || !isCapTableDetailArray(snapshot.capTableDetail)) return null;
  const names = snapshot.capTableDetail
    .map((row) => row.name?.toLowerCase().trim())
    .filter((name): name is string => !!name);
  return names.length > 0 ? new Set(names) : null;
}

export function transformInvToPortfolioCompany(
  company: InvCompany,
  valuation: InvCompanyValuation,
  transactions: InvTransaction[],
  boardMembers: InvBoardSeat[],
  investorStatus: InvInvestorStatusResult,
  securities?: InvSecurity[],
  capTableSnapshots?: InvCapTableSnapshot[],
  legalTerms?: {
    informationRights: InvInformationRights | null;
    roundTerms: InvRoundTerms | null;
    securityTerms: InvSecurityTerms | null;
    allRoundTerms?: InvRoundTerms[];
    /**
     * Source columns carrying an active override, per table. The
     * portfolio_import snapshot overlay is skipped for these so a user edit
     * isn't silently replaced by the imported value.
     */
    overriddenKeys?: OverriddenLegalTermsKeys;
  },
  financingRounds?: InvFinancingRound[],
  equityPlanSnapshots?: InvEquityPlanSnapshot[],
  rawCoInvestors?: InvCoInvestor[],
  coInvestorNetwork?: Map<string, InvCoInvestorNetworkEntry>,
  enrichment?: CompanyEnrichment,
  overriddenValuationFields?: ReadonlySet<string>,
  myFmvOverrideCreatedAt?: string | null,
): PortfolioCompany {
  // Find entry transaction (earliest by date)
  const sortedTransactions = [...transactions].sort(
    (a, b) =>
      new Date(a.transactionDate).getTime() -
      new Date(b.transactionDate).getTime(),
  );
  const entryTransaction = sortedTransactions[0];

  // Map transactions with current price for FMV calculation
  const investmentTransactions = transformInvTransactions(
    transactions,
    valuation.currentPriceUnit,
    financingRounds,
  );

  // Map board members
  const boardOfDirectors = transformInvBoardMembers(
    boardMembers.filter(
      (m) => m.seatType !== 'observer' && m.seatType !== 'board_observer',
    ),
  );
  const boardObservers = boardMembers
    .filter((m) => m.seatType === 'observer' || m.seatType === 'board_observer')
    .map((m) => ({
      id: m.id,
      name: m.holderName,
      role: m.holderTitle ?? undefined,
      fund:
        m.designatingFund?.shortName ?? m.designatingFund?.name ?? undefined,
      designatingFundId: m.designatingFundId,
      seatType: m.seatType,
      overridden: m.overridden,
    }));

  // Map cap table
  const hasCapTableInputs =
    (capTableSnapshots?.length ?? 0) > 0 ||
    (financingRounds?.length ?? 0) > 0 ||
    (transactions?.length ?? 0) > 0 ||
    (equityPlanSnapshots?.length ?? 0) > 0;

  const capTable = hasCapTableInputs
    ? transformInvToCapTableData(
        capTableSnapshots ?? [],
        financingRounds,
        transactions,
        equityPlanSnapshots,
      )
    : undefined;

  // Extract our_implied_value from the latest cap table snapshot's detail JSON
  const latestSnapshot = pickLatestSnapshot(capTableSnapshots ?? []);
  const ourImpliedValue = extractOurImpliedValue(
    latestSnapshot?.capTableDetail,
  );
  const latestRealizedProceeds = extractRealizedProceeds(
    latestSnapshot?.capTableDetail,
  );

  const liqPrefData = securities
    ? transformInvToLiqPrefData(
        securities,
        transactions,
        latestSnapshot ?? undefined,
        pickRestatedSnapshot(capTableSnapshots ?? []) ?? undefined,
      )
    : undefined;

  // Map legal terms — structured tables first, then overlay snapshot fields
  const baseLegalTerms = legalTerms
    ? transformInvToLegalTerms(
        legalTerms.informationRights,
        legalTerms.roundTerms,
        legalTerms.securityTerms,
        investorStatus,
      )
    : undefined;

  const transformedLegalTerms =
    baseLegalTerms && latestSnapshot?.snapshotTypeCode === 'portfolio_import'
      ? applySnapshotLegalTerms(
          baseLegalTerms,
          latestSnapshot.capTableDetail,
          legalTerms?.overriddenKeys,
        )
      : baseLegalTerms;

  // Extract fund info from transactions, with fallback to valuation data
  let funds: { id: number; name: string; shortName: string }[] = [];
  if (transactions.length > 0) {
    funds = Array.from(
      new Map(
        transactions
          .filter((t) => t.fund)
          .map((t) => [
            t.fund!.id,
            {
              id: t.fund!.id,
              name: t.fund!.name,
              shortName: t.fund!.shortName ?? t.fund!.name,
            },
          ]),
      ).values(),
    );
  } else if (valuation.fundIds?.length) {
    // Fallback to valuation data when no transactions available (list view)
    funds = valuation.fundIds.map((id, idx) => ({
      id,
      name: valuation.fundNames?.[idx] ?? '',
      shortName:
        valuation.fundShortNames?.[idx] ?? valuation.fundNames?.[idx] ?? '',
    }));
  }

  // Stages from inv_company.stage_id / entry_stage_id (joined via inv_stages)
  const latestStageCode =
    company.stageCode ?? valuation.currentStageCode ?? valuation.entryStageCode;

  const latestStage = mapStageToInvestmentStage(latestStageCode);

  const entryStageCode = company.entryStageCode ?? valuation.entryStageCode;

  // Sort financing rounds for cap table and other downstream uses
  const sortedRounds = [...(financingRounds ?? [])].sort((a, b) => {
    const dateA = a.initialCloseDate ?? a.announcedDate ?? a.finalCloseDate;
    const dateB = b.initialCloseDate ?? b.announcedDate ?? b.finalCloseDate;
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });

  // Determine primary fund display name
  const primaryFundDisplay =
    funds[0]?.shortName ??
    funds[0]?.name ??
    valuation.primaryFundShortName ??
    valuation.primaryFundName ??
    '';

  // When a value override recomputed a valuation figure, it wins over the
  // snapshot-detail JSON baselines — otherwise an edited input would not
  // reach the displayed FMV/MOIC (the core consistency promise of
  // investor value edits).
  const fmvOverridden = overriddenValuationFields?.has('myFmv') ?? false;
  const proceedsOverridden =
    overriddenValuationFields?.has('realizedProceeds') ?? false;

  const fmvSource = fmvOverridden
    ? valuation.myFmv
    : (ourImpliedValue ?? valuation.myFmv);
  const myFmv = company.status !== 'active' ? 0 : (fmvSource ?? 0);
  // Same attribution rule as the MCP tools' computeFmv (PSK-1980): the FMV
  // estimate only refreshes on new transaction uploads, so it carries the
  // snapshot date it derives from — except a directly overridden FMV, whose
  // freshness is the override's creation date, not the stale snapshot's.
  const fmvSnapshotDate =
    latestSnapshot?.snapshotDate ?? valuation.snapshotDate ?? null;
  const fmvAsOfDate =
    company.status !== 'active' || fmvSource == null
      ? null
      : fmvOverridden
        ? (myFmvOverrideCreatedAt?.slice(0, 10) ?? fmvSnapshotDate)
        : fmvSnapshotDate;
  const aggregateCost = Math.abs(valuation.aggregateCost ?? 0);
  const realizedProceeds = proceedsOverridden
    ? (valuation.realizedProceeds ?? 0)
    : (latestRealizedProceeds ?? valuation.realizedProceeds ?? 0);

  return {
    id: company.publicId,
    entityId: company.id,
    name: company.name,
    logoUrl: undefined,
    domain: company.domain ?? undefined,
    stage: latestStage,
    investmentStatus: company.status === 'active' ? 'Active' : 'Exited',
    hasTransactionData: hasInvTransactionData({
      transactionCount: transactions.length,
      fundIds: valuation.fundIds ?? null,
    }),
    valuation: myFmv,
    myTotalFMV: myFmv,
    fmvAsOfDate,
    postMoneyValuation: valuation.postMoneyValuation ?? 0,
    myOwnership: (valuation.ownershipPct ?? 0) * 100,
    tags: (company.tags ?? []).map((tag, idx) => ({
      id: `tag-${idx}`,
      name: tag,
    })),
    cashPosition: undefined,
    nextBoardMeeting: null,
    currentlyRaising: false,
    entityType: resolveEntityType(company.entityType),
    foundedYear: company.foundedYear ?? 0,
    headquarters: company.headquarters ?? '',
    corporateJurisdiction: company.legalJurisdiction ?? '',
    companyUrl: company.domain ? `https://${company.domain}` : '',
    sector: company.sector ?? '',
    industry: company.industry ?? '',
    description: company.description ?? null,
    totalEquityFinancing: valuation.totalEquityFinancing ?? 0,
    currentPricePerUnit: valuation.currentPriceUnit ?? 0,
    lastTransactionDate: valuation.lastTransactionDate ?? '',
    fund: primaryFundDisplay,
    fundIds:
      funds.length > 0 ? funds.map((f) => f.id) : (valuation.fundIds ?? []),
    funds,
    boardOfDirectors,
    boardObservers,
    // Entry transaction fields - fallback to valuation data
    myEntryDate: entryTransaction?.transactionDate ?? valuation.entryDate ?? '',
    stageAtEntry: mapStageToInvestmentStage(entryStageCode),
    myEntryCost: entryTransaction?.amount ?? valuation.entryAmount ?? 0,
    postMoneyAtEntry: null,
    // Current economics fields
    myAggregateCost: Math.abs(valuation.aggregateCost ?? 0),
    realizedProceeds,
    impliedValue: myFmv,
    multiple:
      aggregateCost > 0 ? (myFmv + realizedProceeds) / aggregateCost : 0,
    moic: aggregateCost > 0 ? (myFmv + realizedProceeds) / aggregateCost : null,
    myFullyDilutedPercent: (valuation.myFdPct ?? 0) * 100,
    // Legal terms
    legalTerms: transformedLegalTerms,
    // Per-round legal terms for round filtering
    legalTermsByRound: (legalTerms?.allRoundTerms ?? []).map((rt) => ({
      financingRoundId: rt.financingRoundId,
      legalTerms: transformInvToLegalTerms(
        legalTerms?.informationRights ?? null,
        rt,
        legalTerms?.securityTerms ?? null,
        investorStatus,
      ),
    })),
    // Transaction history for charting
    transactions: investmentTransactions,
    capTable,
    liqPrefData,
    financingRounds: sortedRounds
      .filter((r) => r.stageCode && r.stageName)
      .map((r) => ({
        id: r.id,
        name: r.name,
        stageCode: r.stageCode!,
        stageName: r.stageName!,
        date: r.initialCloseDate ?? r.announcedDate ?? r.finalCloseDate ?? '',
      }))
      .filter((r) => r.date !== ''),
    enrichment,
    coInvestors:
      rawCoInvestors && rawCoInvestors.length > 0
        ? transformInvCoInvestors(
            rawCoInvestors,
            coInvestorNetwork ?? new Map(),
            company.name,
          )
        : [],
  };
}

/** Mirrors the transaction_type buckets in v_inv_position. */
const POSITION_COST_TYPES: ReadonlySet<string> = new Set(
  POSITION_COST_TRANSACTION_TYPES,
);
const POSITION_PROCEEDS_TYPES: ReadonlySet<string> = new Set(
  POSITION_PROCEEDS_TRANSACTION_TYPES,
);

/**
 * Transform inv_transaction array to InvestmentTransaction array.
 * Calculates cumulative units and estimates FMV based on transaction history.
 */
export function transformInvTransactions(
  transactions: InvTransaction[],
  currentPricePerUnit?: number | null,
  financingRounds?: InvFinancingRound[],
): InvestmentTransaction[] {
  // Sort by date ascending for cumulative calculations
  const sorted = [...transactions].sort(
    (a, b) =>
      new Date(a.transactionDate).getTime() -
      new Date(b.transactionDate).getTime(),
  );

  let cumulativeUnits = 0;

  return sorted.map((tx) => {
    const saleTypes = [
      'secondary_sale',
      'sale',
      'transfer_out',
      'exit_consideration',
    ];
    const isSale = saleTypes.includes(tx.transactionType);
    // distribution/exit are inflows; secondary_sale units are already negative in DB
    const isInflow =
      tx.transactionType === 'distribution' || tx.transactionType === 'exit';
    if (!isInflow) {
      cumulativeUnits += tx.units;
    } else {
      cumulativeUnits -= tx.units;
    }

    // Calculate post-money valuation preferring snapshot-derived implied
    // valuation. Track the source snapshot id only when the value comes from a
    // snapshot (not the pre-money + amount fallback) so the UI can reflect a PMV
    // override on the company's latest snapshot.
    const preMoneyValuation = tx.financingRound?.preMoneyValuation;
    let postMoneyValuation = tx.financingRound?.impliedValuation ?? null;
    let postMoneySnapshotId = _.isNil(postMoneyValuation)
      ? null
      : (tx.financingRound?.impliedValuationSnapshotId ?? null);
    if (_.isNil(postMoneyValuation)) {
      postMoneyValuation =
        !_.isNil(preMoneyValuation) && preMoneyValuation > 0
          ? preMoneyValuation + tx.amount
          : null;
      postMoneySnapshotId = null;
    }

    // Estimate FMV: use current price if available, otherwise use cost basis
    const myFMV = currentPricePerUnit
      ? cumulativeUnits * currentPricePerUnit
      : null;

    const stage = resolveTransactionStage(
      tx.financingRound?.stageCode,
      tx.transactionDate,
      financingRounds,
    );

    const flowType: TransactionFlowType = isInflow
      ? (tx.transactionType as TransactionFlowType)
      : isSale
        ? 'sale'
        : 'investment';

    return {
      id: tx.id,
      date: tx.transactionDate,
      amount: tx.amount,
      type: stage ?? '',
      transactionType: transformTransactionType(tx.transactionType),
      rawTransactionType: tx.transactionType,
      flowType,
      entityName: resolveTransactionEntityName(tx),
      stage: stage ?? undefined,
      equityClass: tx.security?.name,
      // Two positive lists decide the money split, mirroring v_inv_position:
      // cost only for POSITION_COST_TRANSACTION_TYPES, realized proceeds only
      // for POSITION_PROCEEDS_TRANSACTION_TYPES. Every other type — write_off,
      // transfer_out, transfer_in, the affiliate transfers and the adjustment
      // legs — restates a position rather than deploying or returning capital,
      // so it contributes neither by construction.
      cost: POSITION_COST_TYPES.has(tx.transactionType)
        ? Math.abs(tx.amount)
        : 0,
      realizedProceeds: POSITION_PROCEEDS_TYPES.has(tx.transactionType)
        ? Math.abs(tx.amount)
        : 0,
      myUnits: tx.units,
      postMoneyValuation,
      postMoneySnapshotId,
      myFMV,
      cumulativeUnits,
    };
  });
}

/**
 * Transform inv_board_seat array to BoardMember array.
 */
export function transformInvBoardMembers(
  boardSeats: InvBoardSeat[],
): BoardMember[] {
  return boardSeats.map((seat) => ({
    id: seat.id,
    name: seat.holderName,
    role: seat.holderTitle ?? undefined,
    fund:
      seat.designatingFund?.shortName ??
      seat.designatingFund?.name ??
      undefined,
    designatingFundId: seat.designatingFundId,
    isLead: seat.seatType === 'lead' || seat.seatType === 'investor_lead',
    seatType: seat.seatType,
    overridden: seat.overridden,
  }));
}

/**
 * Extract our_implied_value from the cap_table_detail JSON.
 */
export function extractOurImpliedValue(detail: unknown): number | null {
  if (
    typeof detail === 'object' &&
    detail !== null &&
    !Array.isArray(detail) &&
    'our_implied_value' in detail
  ) {
    const val = (detail as Record<string, unknown>).our_implied_value;
    return typeof val === 'number' ? val : null;
  }
  return null;
}
/**
 * Extract realized_proceeds from the cap_table_detail->investment_position object JSON.
 */
export function extractRealizedProceeds(detail: unknown): number | null {
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) {
    return null;
  }
  const investmentPosition = _.get(detail, 'investment_position');
  if (
    typeof investmentPosition !== 'object' ||
    investmentPosition === null ||
    Array.isArray(investmentPosition)
  ) {
    return null;
  }
  const value = _.get(investmentPosition, 'realized_proceeds');
  return typeof value === 'number' ? value : null;
}

/**
 * Parse cap_table_detail JSON into legal_terms and investor_status partials.
 * Returns null if the detail lacks a legal_terms key.
 */
function parseCapTableDetailLegalTerms(capTableDetail: Json): {
  lt: Partial<CapTableDetailLegalTerms>;
  is: Partial<CapTableDetailInvestorStatus>;
} | null {
  if (
    typeof capTableDetail !== 'object' ||
    capTableDetail === null ||
    Array.isArray(capTableDetail)
  ) {
    return null;
  }

  const detail = capTableDetail as Record<string, unknown>;
  if (
    !('legal_terms' in detail) ||
    typeof detail.legal_terms !== 'object' ||
    detail.legal_terms === null ||
    Array.isArray(detail.legal_terms)
  ) {
    return null;
  }

  const lt = detail.legal_terms as Partial<CapTableDetailLegalTerms>;
  const is =
    typeof detail.investor_status === 'object' &&
    detail.investor_status !== null &&
    !Array.isArray(detail.investor_status)
      ? (detail.investor_status as Partial<CapTableDetailInvestorStatus>)
      : {};

  return { lt, is };
}

/**
 * Overlay snapshot legal_terms and investor_status fields onto a base LegalTerms.
 * Only the fields present in cap_table_detail are overridden; everything else
 * (informationRights, majorInvestor, qsbs, etc.) is preserved from base.
 *
 * `overriddenKeys` names the source columns carrying an active value override,
 * per table. `base` already has those edits applied, so the snapshot must not
 * overlay them — otherwise an edit to any field this function touches would be
 * silently discarded on imported portcos.
 */
export function applySnapshotLegalTerms(
  base: LegalTerms,
  capTableDetail: Json,
  overriddenKeys?: OverriddenLegalTermsKeys,
): LegalTerms {
  const parsed = parseCapTableDetailLegalTerms(capTableDetail);
  if (!parsed) return base;

  const { lt, is } = parsed;

  /** The snapshot value, unless the column was edited — then keep the edit. */
  const keepEdit = <T>(
    edited: boolean,
    snapshotValue: T | null | undefined,
    baseValue: T,
  ): T => (edited ? baseValue : (snapshotValue ?? baseValue));

  /** …for an inv_round_terms column. */
  const unlessOverridden = <T>(
    fieldKey: string,
    snapshotValue: T | null | undefined,
    baseValue: T,
  ): T =>
    keepEdit(
      overriddenKeys?.roundTerms?.has(fieldKey) ?? false,
      snapshotValue,
      baseValue,
    );

  /** …for an inv_security_terms column. */
  const unlessSecurityOverridden = <T>(
    fieldKey: string,
    snapshotValue: T | null | undefined,
    baseValue: T,
  ): T =>
    keepEdit(
      overriddenKeys?.securityTerms?.has(fieldKey) ?? false,
      snapshotValue,
      baseValue,
    );

  const infoRightsEdited = (...fieldKeys: string[]): boolean =>
    fieldKeys.some((k) => overriddenKeys?.informationRights?.has(k) ?? false);

  return {
    ...base,
    headerStatus: {
      majorInvestorStatus: keepEdit(
        infoRightsEdited('is_major_investor'),
        is.major_investor_status,
        base.headerStatus.majorInvestorStatus,
      ),
      informationRights: keepEdit(
        infoRightsEdited(
          'info_rights_for_major',
          'info_rights_for_all',
          'is_major_investor',
        ),
        is.our_information_rights,
        base.headerStatus.informationRights,
      ),
    },
    economicRights: {
      ...base.economicRights,
      antiDilutionRights: unlessSecurityOverridden(
        'anti_dilution_type',
        lt.anti_dilution_rights
          ? mapAntiDilutionType(lt.anti_dilution_rights)
          : null,
        base.economicRights.antiDilutionRights,
      ),
      liquidationPreferenceSeniority: unlessSecurityOverridden(
        'liquidation_seniority',
        lt.onex_liq_pref_multipliers != null
          ? lt.onex_liq_pref_multipliers
            ? ['1x']
            : []
          : null,
        base.economicRights.liquidationPreferenceSeniority,
      ),
    },
    dividends: {
      ...base.dividends,
      cumulativeDividends: unlessSecurityOverridden(
        'dividend_cumulative',
        lt.cumulative_dividends,
        base.dividends.cumulativeDividends,
      ),
    },
    otherLegalTerms: {
      ...base.otherLegalTerms,
      dragAlong: unlessOverridden(
        'drag_along',
        lt.drag_along,
        base.otherLegalTerms.dragAlong,
      ),
      payToPlay: unlessOverridden(
        'pay_to_play',
        lt.pay_to_play,
        base.otherLegalTerms.payToPlay,
      ),
      dAndOInsurance: unlessOverridden(
        'do_insurance',
        lt.do_insurance,
        base.otherLegalTerms.dAndOInsurance,
      ),
      proRataRightsForMajorInvestors: unlessOverridden(
        'pro_rata_rights_major',
        lt.our_pro_rata_rights,
        base.otherLegalTerms.proRataRightsForMajorInvestors,
      ),
      employeeVestingProtocol: unlessOverridden(
        'employee_vesting_protocol',
        lt.employee_vesting_protocol,
        base.otherLegalTerms.employeeVestingProtocol,
      ),
      registrationRightsForPreferredInvestors: unlessOverridden(
        'registration_rights_preferred',
        lt.registration_rights_preferred,
        base.otherLegalTerms.registrationRightsForPreferredInvestors,
      ),
    },
  };
}

/**
 * Type guard for cap_table_detail JSON structure.
 */
interface CapTableDetailRow {
  id: string;
  name: string;
  parentId?: string | null;
  securityType?: string | null;
  units: number;
  fdPercent: number;
  myUnits?: number | null;
  myFdPercent?: number | null;
}

function isCapTableDetailArray(value: unknown): value is CapTableDetailRow[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const first = value[0];
  return (
    typeof first === 'object' &&
    first !== null &&
    'id' in first &&
    'name' in first &&
    'units' in first
  );
}

/**
 * Transform a single inv_cap_table_snapshot into a CapTableSnapshot.
 */
function transformSingleSnapshot(
  snapshot: InvCapTableSnapshot,
): CapTableSnapshot {
  const securityRows: SecurityRow[] = isCapTableDetailArray(
    snapshot.capTableDetail,
  )
    ? snapshot.capTableDetail.map((row) => ({
        id: row.id,
        name: row.name,
        parentId: row.parentId ?? undefined,
        securityType: row.securityType ?? undefined,
        units: row.units,
        fdPercent: row.fdPercent,
        myUnits: row.myUnits ?? undefined,
        myFdPercent: row.myFdPercent ?? undefined,
      }))
    : [];

  return {
    asOfDate: snapshot.snapshotDate,
    snapshotTypeCode: snapshot.snapshotTypeCode,
    financingRoundId: snapshot.financingRoundId,
    securities: securityRows,
    fullyDilutedTotal: snapshot.fullyDilutedTotal,
    totalOutstanding: snapshot.totalOutstanding,
    impliedValuation: snapshot.impliedValuation,
    sharePrice: snapshot.sharePrice,
    commonAuthorized: snapshot.commonAuthorized,
    commonOutstanding: snapshot.commonOutstanding,
    preferredAuthorized: snapshot.preferredAuthorized,
    preferredOutstanding: snapshot.preferredOutstanding,
    optionPoolAuthorized: snapshot.optionPoolAuthorized,
    optionPoolOutstanding: snapshot.optionPoolOutstanding,
    optionPoolAvailable: snapshot.optionPoolAvailable,
    optionPoolFdPercent: snapshot.optionPoolFdPercent,
    ourTotalShares: snapshot.ourTotalShares,
    ourCommonShares: snapshot.ourCommonShares,
    ourPreferredShares: snapshot.ourPreferredShares,
    ourPreferredPct: snapshot.ourPreferredPct,
    ourOwnershipPercent: snapshot.ourOwnershipPercent,
    ourFdOwnershipPercent: snapshot.ourFdOwnershipPercent,
    ourVotingPct: snapshot.ourVotingPct,
    stageCode: snapshot.stageCode ?? '',
    stageName: snapshot.stageName ?? '',
  };
}

/**
 * Extract preferred equity classes from financing rounds.
 */
function buildPreferredEquityClasses(
  financingRounds: InvFinancingRound[],
): PreferredEquityClass[] {
  const classMap = new Map<string, PreferredEquityClass>();
  const sortedRounds = [...financingRounds].sort((a, b) => {
    const dateA = a.initialCloseDate ?? a.announcedDate ?? a.finalCloseDate;
    const dateB = b.initialCloseDate ?? b.announcedDate ?? b.finalCloseDate;
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });
  for (const round of sortedRounds) {
    if (!round.stageCode) continue;
    const existing = classMap.get(round.stageCode);
    if (existing) {
      existing.roundNames.push(round.name);
    } else {
      classMap.set(round.stageCode, {
        stageCode: round.stageCode,
        stageName: round.stageName ?? round.name,
        roundNames: [round.name],
      });
    }
  }
  return Array.from(classMap.values());
}

/**
 * Map InvTransaction[] to lightweight CapTableTransaction[] for cap table calculations.
 * Filters out transactions without security data.
 */
function transformToCapTableTransactions(
  transactions: InvTransaction[],
): CapTableTransaction[] {
  return transactions
    .filter((tx) => tx.security)
    .map((tx) => ({
      securityId: tx.securityId,
      securityType: tx.security!.securityType,
      securityName: tx.security!.name,
      transactionDate: tx.transactionDate,
      transactionType: tx.transactionType,
      signedUnits:
        tx.transactionType === 'distribution' || tx.transactionType === 'exit'
          ? -tx.units
          : tx.units,
      units: tx.units,
    }));
}

/**
 * Map InvEquityPlanSnapshot[] to UI-level EquityPlanSnapshot[].
 */
function transformToEquityPlanSnapshots(
  snapshots: InvEquityPlanSnapshot[],
): EquityPlanSnapshot[] {
  return snapshots.map((s) => ({
    effectiveDate: s.effectiveDate,
    authorizedShares: s.authorizedShares,
    issuedShares: s.issuedShares,
    outstandingOptions: s.outstandingOptions,
    exercisedShares: s.exercisedShares,
    cancelledShares: s.cancelledShares,
    poolPercentFd: s.poolPercentFd,
    planName: s.planName,
  }));
}

/**
 * Transform inv_cap_table_snapshots to CapTableData.
 */
export function transformInvToCapTableData(
  snapshots: InvCapTableSnapshot[],
  financingRounds?: InvFinancingRound[],
  transactions?: InvTransaction[],
  equityPlanSnapshots?: InvEquityPlanSnapshot[],
): CapTableData {
  const transformed = snapshots.map((s) => transformSingleSnapshot(s));

  return {
    snapshots: transformed,
    availableDates: transformed.map((s) => s.asOfDate),
    preferredEquityClasses: buildPreferredEquityClasses(financingRounds ?? []),
    transactions: transformToCapTableTransactions(transactions ?? []),
    equityPlanSnapshots: transformToEquityPlanSnapshots(
      equityPlanSnapshots ?? [],
    ),
  };
}

/**
 * Transform inv_* legal data to LegalTerms type.
 */
export function transformInvToLegalTerms(
  infoRights: InvInformationRights | null,
  roundTerms: InvRoundTerms | null,
  securityTerms: InvSecurityTerms | null,
  investorStatus: InvInvestorStatusResult,
): LegalTerms {
  // Information Rights
  const informationRights: InformationRights = {
    budgetAndBusinessPlan: {
      monthly: false,
      quarterly: false,
      yearEnd: infoRights?.yearEndBudgetBusinessPlan ?? false,
    },
    capitalizationTable: {
      monthly: infoRights?.monthlyCapTable ?? false,
      quarterly: infoRights?.quarterlyCapTable ?? false,
      yearEnd: infoRights?.yearEndCapTable ?? false,
    },
    balanceSheet: {
      monthly: infoRights?.monthlyBalanceSheet ?? false,
      quarterly: infoRights?.quarterlyBalanceSheet ?? false,
      yearEnd: infoRights?.yearEndBalanceSheet ?? false,
    },
    incomeAndCashFlows: {
      monthly: infoRights?.monthlyIncomeCashFlows ?? false,
      quarterly: infoRights?.quarterlyIncomeCashFlows ?? false,
      yearEnd: infoRights?.yearEndIncomeCashFlows ?? false,
    },
    auditedBalanceSheet: {
      monthly: infoRights?.auditedMonthly ?? false,
      quarterly: infoRights?.auditedQuarterly ?? false,
      yearEnd: infoRights?.auditedYearEnd ?? false,
    },
    auditedFinancialStatements: {
      monthly: infoRights?.auditedMonthly ?? false,
      quarterly: infoRights?.auditedQuarterly ?? false,
      yearEnd: infoRights?.auditedYearEnd ?? false,
    },
    auditedIncomeAndCashFlows: {
      monthly: infoRights?.auditedMonthly ?? false,
      quarterly: infoRights?.auditedQuarterly ?? false,
      yearEnd: infoRights?.auditedYearEnd ?? false,
    },
    auditedStockholdersEquity: {
      monthly: infoRights?.auditedMonthly ?? false,
      quarterly: infoRights?.auditedQuarterly ?? false,
      yearEnd: infoRights?.auditedYearEnd ?? false,
    },
  };

  // Major Investor
  const majorInvestor: MajorInvestor = {
    thresholdAmount: roundTerms?.majorInvestorThresholdAmount ?? null,
    thresholdOwnershipPercent:
      roundTerms?.majorInvestorThresholdOwnershipPct ?? null,
    thresholdShares: roundTerms?.majorInvestorThresholdShares ?? null,
    majorInvestorsByThreshold: [],
    namedMajorInvestor: roundTerms?.namedMajorInvestors ?? [],
  };

  // Economic Rights
  const economicRights: EconomicRights = {
    antiDilutionRights: mapAntiDilutionType(
      securityTerms?.antiDilutionType ?? 'None',
    ),
    liquidationPreferenceSeniority: securityTerms?.liquidationSeniority
      ? [`${securityTerms.liquidationSeniority}`]
      : [],
    milestoneClosings: roundTerms?.milestoneClosings ?? false,
  };

  // QSBS
  const qsbs: QSBS = {
    qualifiedSmallBusinessStockCovenantGiven:
      roundTerms?.qsbsCovenantGiven ?? false,
    qualifiedSmallBusinessRepMade: roundTerms?.qsbsRepMade ?? false,
  };

  // Dividends
  const dividends: Dividends = {
    accruingDividends: securityTerms?.dividendAccruing ?? null,
    cumulativeDividends: securityTerms?.dividendCumulative ?? null,
    dividendRate: normalizeRatePercent(securityTerms?.dividendRate ?? null),
    dividendSeniority: securityTerms?.dividendSeniority
      ? `${securityTerms.dividendSeniority}`
      : null,
  };

  // Other Legal Terms
  const otherLegalTerms: OtherLegalTerms = {
    proRataRightsForAll: roundTerms?.proRataRightsAll ?? false,
    proRataRightsForMajorInvestors: roundTerms?.proRataRightsMajor ?? false,
    dragAlong: roundTerms?.dragAlong ?? false,
    payToPlay: roundTerms?.payToPlay ?? false,
    dAndOInsurance: roundTerms?.doInsurance ?? false,
    investorCounselFeeCap: roundTerms?.investorCounselFeeCap ?? null,
    employeeVestingProtocol: roundTerms?.employeeVestingProtocol ?? false,
    investorsSubjectToROFR: roundTerms?.investorsSubjectToRofr ?? false,
    requiredClosingPayments: !!roundTerms?.requiredClosingPayments,
    rofrAndCosaleAgreement: roundTerms?.rofrCosale ?? false,
    subsequentClosingWindowDays:
      roundTerms?.subsequentClosingWindowDays ?? null,
    standardProRataFormulation: roundTerms?.standardProRataFormulation ?? false,
    issuerPaysInvestorCounselFees:
      roundTerms?.issuerPaysInvestorCounsel ?? false,
    founderVestingProtocol: roundTerms?.founderVestingApplied ?? false,
    registrationRightsForPreferredInvestors:
      roundTerms?.registrationRightsPreferred ?? false,
  };

  return {
    headerStatus: {
      majorInvestorStatus: investorStatus.isMajorInvestor,
      informationRights: investorStatus.hasInformationRights,
    },
    informationRights,
    majorInvestor,
    economicRights,
    qsbs,
    dividends,
    otherLegalTerms,
  };
}

// =============================================================================
// LIQUIDATION PREFERENCE
// =============================================================================

interface CapTableDetailLiqPref {
  our_aggregate_liq_pref?: number | null;
  total_aggregate_liq_pref?: number | null;
  liquidation_preference_scheme?: string | null;
  aggregate_liq_pref_ahead_of_me?: number | null;
}

function extractSnapshotLiqPref(
  capTableDetail: Json,
): CapTableDetailLiqPref | null {
  if (
    typeof capTableDetail !== 'object' ||
    capTableDetail === null ||
    Array.isArray(capTableDetail)
  ) {
    return null;
  }
  const detail = capTableDetail as Record<string, unknown>;
  const lp = detail.liquidation_preference;
  if (typeof lp !== 'object' || lp === null || Array.isArray(lp)) {
    return null;
  }
  const raw = lp as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  return {
    our_aggregate_liq_pref: num(raw.our_aggregate_liq_pref),
    total_aggregate_liq_pref: num(raw.total_aggregate_liq_pref),
    liquidation_preference_scheme:
      typeof raw.liquidation_preference_scheme === 'string'
        ? raw.liquidation_preference_scheme
        : null,
    aggregate_liq_pref_ahead_of_me: num(raw.aggregate_liq_pref_ahead_of_me),
  };
}

/**
 * Build liquidation preference data from securities, transactions, and optional snapshot.
 * Per-row values are always computed from security terms + transactions.
 * Summary totals use cap_table_detail.liquidation_preference when available,
 * falling back to computed row sums.
 *
 * `restatedSnapshot` (psk-1854) is the snapshot that restates the capital
 * structure. When present with per-security detail, a class it omits has been
 * restated away and stops rendering; class liveness comes from snapshot
 * membership, never from transaction unit sums.
 */
export function transformInvToLiqPrefData(
  securities: InvSecurity[],
  transactions: InvTransaction[],
  latestSnapshot?: InvCapTableSnapshot,
  restatedSnapshot?: InvCapTableSnapshot,
): LiqPrefData | undefined {
  // null when the snapshot has no per-security detail: membership can't be
  // determined, so degrade to showing everything rather than hiding it all.
  const liveClassNames = snapshotClassNames(restatedSnapshot);

  const liqSecurities = securities.filter(
    (s) =>
      s.terms &&
      (s.terms.liquidationMultiplier != null ||
        s.terms.liquidationSeniority != null) &&
      (liveClassNames === null ||
        liveClassNames.has(s.name.toLowerCase().trim())),
  );

  if (liqSecurities.length === 0) {
    return undefined;
  }

  const txBySecurityId = new Map<
    number,
    { units: number; amount: number; cost: number }
  >();
  for (const tx of transactions) {
    const isReduction =
      tx.transactionType === 'sale' ||
      tx.transactionType === 'distribution' ||
      tx.transactionType === 'exit';
    const existing = txBySecurityId.get(tx.securityId) ?? {
      units: 0,
      amount: 0,
      cost: 0,
    };
    existing.units += isReduction ? -tx.units : tx.units;
    existing.amount += tx.amount;
    // Cost comes from cost-type transactions only, mirroring v_inv_position:
    // a signed sum over every type lets adjustment legs leave a residual.
    if (
      (POSITION_COST_TRANSACTION_TYPES as readonly string[]).includes(
        tx.transactionType,
      )
    ) {
      existing.cost += Math.abs(tx.amount);
    }
    txBySecurityId.set(tx.securityId, existing);
  }

  const rows: LiqPrefRow[] = liqSecurities.map((security) => {
    const terms = security.terms!;
    const txAgg = txBySecurityId.get(security.id) ?? {
      units: 0,
      amount: 0,
      cost: 0,
    };
    const pps = terms.originalIssuePrice ?? 0;
    const mult = terms.liquidationMultiplier ?? 1;
    const outstandingShares = terms.outstandingShares ?? null;

    return {
      securityId: security.id,
      equityClass: security.name,
      preference: terms.liquidationSeniority,
      pricePerUnit: terms.originalIssuePrice,
      multiplier: terms.liquidationMultiplier,
      participationType: terms.participationType,
      participationCap: terms.participationCap,
      myShares: txAgg.units,
      myCost: txAgg.cost,
      myLiqPref: txAgg.units * pps * mult,
      totalOutstandingShares: outstandingShares,
      totalLiqPref: terms.aggregateLiqPref ? terms.aggregateLiqPref : null,
    };
  });

  rows.sort((a, b) => {
    if (a.preference == null && b.preference == null) return 0;
    if (a.preference == null) return 1;
    if (b.preference == null) return -1;
    return a.preference - b.preference;
  });

  const computedMyTotal = rows.reduce((sum, r) => sum + r.myLiqPref, 0);
  const computedTotal = rows.reduce((sum, r) => sum + (r.totalLiqPref ?? 0), 0);

  let myTotalLiqPref = computedMyTotal;
  let totalLiqPref = computedTotal;

  const hasPostSnapshotTransactions =
    latestSnapshot != null &&
    transactions.some((tx) => tx.transactionDate > latestSnapshot.snapshotDate);

  if (latestSnapshot && !hasPostSnapshotTransactions) {
    const snapshotLp = extractSnapshotLiqPref(latestSnapshot.capTableDetail);
    if (snapshotLp) {
      if (snapshotLp.our_aggregate_liq_pref != null) {
        myTotalLiqPref = snapshotLp.our_aggregate_liq_pref;
      }
      if (snapshotLp.total_aggregate_liq_pref != null) {
        totalLiqPref = snapshotLp.total_aggregate_liq_pref;
      }
    }
  }

  return { rows, myTotalLiqPref, totalLiqPref };
}
