import { z } from 'zod';
import {
  getInvCompanyValuation,
  getInvCapTableSnapshot,
  getInvTransactions,
  getInvBoardComposition,
  getInvInvestorStatus,
  getInvSecurities,
  getInvLegalTerms,
  getInvFunds,
  getInvEquityPlanSnapshots,
  getInvPortfolioCompanies,
  getInvPortfolioFunds,
  POSITION_COST_TRANSACTION_TYPES,
  POSITION_PROCEEDS_TRANSACTION_TYPES,
  type InvCompany,
  type InvCompanyValuation,
  type InvCapTableSnapshot,
  type InvTransaction,
  type InvBoardSeat,
  type InvSecurity,
  type InvSecurityTerms,
  type InvFund,
} from '@/lib/v2/inv';
import {
  getInvFinancingRounds,
  getInvAllCapTableSnapshots,
  getInvLatestCapTableSnapshotBatch,
  getInvSecurityTypesByCompanyBatch,
  getScopedPortfolioInvCompanies,
  overriddenValuationFieldSet,
} from '@/lib/v2/inv/service';
import {
  extractOurImpliedValue,
  extractRealizedProceeds,
  transformInvToLegalTerms,
  applySnapshotLegalTerms,
  toOverriddenLegalTermsKeys,
} from '@/lib/v2/inv/transforms';
import { NotFoundError } from '@/lib/errors';
import { assertSameOrg } from '@/app/lib/mcp/guards';
import { paginate, paginationSchema } from '@/app/lib/mcp/pagination';
import type { McpToolDef } from '@/app/lib/mcp/tools/types';
import { resolveCompanyRef } from './resolve-company';

// Rate columns (dividend / interest / discount) are stored inconsistently
// across rows: sometimes as a fraction (0.08 = 8%), sometimes as a
// percentage (8 = 8%). Values strictly less than 1 are treated as
// fractions and scaled to a percentage. A real rate of 0.5% would be
// indistinguishable from a fraction of 0.005 — that's an acceptable
// trade-off, since term-sheet rates below 1% are exceptionally rare.
function normalizeRatePercent(value: number | null): number | null {
  if (value == null) return null;
  return value < 1 ? value * 100 : value;
}

export type FmvUnavailableCode =
  | 'noCapTableSnapshot'
  | 'snapshotMissingInputs'
  | 'noRecordedHoldings';

const FMV_UNAVAILABLE_REASONS: Record<FmvUnavailableCode, string> = {
  noCapTableSnapshot:
    'No cap table snapshot has been recorded for this company.',
  snapshotMissingInputs:
    'The latest cap table snapshot is missing ownership percent or implied valuation, so FMV could not be computed.',
  noRecordedHoldings:
    'The latest cap table snapshot records no holdings for this active position, so FMV could not be computed.',
};

export interface FmvResult {
  myFmvUSD: number | null;
  asOfDate: string | null;
  fmvUnavailableCode: FmvUnavailableCode | null;
  fmvUnavailableReason: string | null;
}

function fmvUnavailable(code: FmvUnavailableCode): FmvResult {
  return {
    myFmvUSD: null,
    asOfDate: null,
    fmvUnavailableCode: code,
    fmvUnavailableReason: FMV_UNAVAILABLE_REASONS[code],
  };
}

function fmvAvailable(myFmvUSD: number, asOfDate: string | null): FmvResult {
  return {
    myFmvUSD,
    asOfDate,
    fmvUnavailableCode: null,
    fmvUnavailableReason: null,
  };
}

export interface ComputeFmvInput {
  status: string;
  ourImpliedValue: number | null;
  viewMyFmv: number | null;
  hasCapTableSnapshot: boolean;
  fmvOverridden: boolean;
  /** our_total_shares of the latest cap table snapshot. */
  myUnits: number | null;
  /** snapshot_date of the latest cap table snapshot the FMV derives from. */
  snapshotDate: string | null;
  /** created_at of the active myFmv override, when one exists. */
  overrideCreatedAt: string | null;
}

export interface HoldingsInput {
  status: string;
  myUnits: number | null;
  fmvOverridden: boolean;
}

/**
 * A snapshot that records zero units for an Active company is a position the
 * data has not caught up with (a hand-booked recap, a transfer-out with no
 * follow-on), not a real valuation — 0% ownership times any post-money is 0,
 * which would read as a genuine zero-value position. A manual myFmv override
 * is an explicit mark and still wins.
 */
export function recordsNoHoldings({
  status,
  myUnits,
  fmvOverridden,
}: HoldingsInput): boolean {
  return status === 'active' && myUnits === 0 && !fmvOverridden;
}

/**
 * A closed/exited position legitimately carries no FMV going forward — that
 * 0 is real, not missing data. Otherwise, myFmv normally prefers
 * cap_table_detail.our_implied_value, falling back to the valuation view's
 * my_fmv (= our_fd_ownership_percent * implied_valuation, which SQL nulls
 * out if either input is missing) — but a manual myFmv override always wins
 * over the (now stale) implied value, matching transformInvToPortfolioCompany's
 * fmvOverridden rule. If nothing is available, or the snapshot records no
 * holdings for an Active company, FMV genuinely cannot be calculated and
 * must be null, not 0.
 *
 * asOfDate says how current the estimate is (PSK-1980): FMV only refreshes
 * when new transaction data is uploaded, so it carries the snapshot date the
 * inputs came from. A directly overridden FMV instead carries the override's
 * creation date — the snapshot date would falsely flag a fresh manual mark
 * as stale. A recomputed-only override (an input was edited, not myFmv
 * itself) keeps the snapshot date, since ownership still comes from the
 * snapshot. Date-only, matching snapshot_date's grain.
 */
export function computeFmv({
  status,
  ourImpliedValue,
  viewMyFmv,
  hasCapTableSnapshot,
  fmvOverridden,
  myUnits,
  snapshotDate,
  overrideCreatedAt,
}: ComputeFmvInput): FmvResult {
  if (status !== 'active') {
    return fmvAvailable(0, null);
  }
  if (recordsNoHoldings({ status, myUnits, fmvOverridden })) {
    return fmvUnavailable('noRecordedHoldings');
  }
  const myFmvUSD = fmvOverridden ? viewMyFmv : (ourImpliedValue ?? viewMyFmv);
  if (myFmvUSD != null) {
    const asOfDate = fmvOverridden
      ? (overrideCreatedAt?.slice(0, 10) ?? snapshotDate)
      : snapshotDate;
    return fmvAvailable(myFmvUSD, asOfDate);
  }
  return fmvUnavailable(
    hasCapTableSnapshot ? 'snapshotMissingInputs' : 'noCapTableSnapshot',
  );
}

export type FmvExclusionReason =
  | 'noTransactionData'
  | 'convertibleOnly'
  | FmvUnavailableCode;

export interface FmvCoverage {
  includedCount: number;
  excludedCount: number;
  excludedCostUSD: number;
  excludedByReason: Record<FmvExclusionReason, number>;
}

export interface FmvCoverageEntry {
  hasTransactionData: boolean;
  myAggregateCostUSD: number;
  fmv: FmvResult | undefined;
  securityTypes: ReadonlySet<string> | undefined;
}

/** Instruments with no cap-table position until they convert. */
const STRUCTURALLY_UNVALUED_SECURITY_TYPES: ReadonlySet<string> = new Set([
  'safe',
  'convertible_note',
]);

function isConvertibleOnly(types: ReadonlySet<string> | undefined): boolean {
  if (!types || types.size === 0) return false;
  for (const t of types) {
    if (!STRUCTURALLY_UNVALUED_SECURITY_TYPES.has(t)) return false;
  }
  return true;
}

/**
 * Classifies why a company sits outside the FMV-based totals. Companies with
 * an FMV — including the real 0 of an exited position — are included.
 * Reasons are ordered from most to least fundamental: a company with no
 * transactions has nothing to value; a note/SAFE-only position cannot have a
 * cap-table FMV until it converts; only then does the snapshot state matter.
 */
export function fmvExclusionReason(
  entry: FmvCoverageEntry,
): FmvExclusionReason | null {
  if (entry.fmv?.myFmvUSD != null) return null;
  if (!entry.hasTransactionData) return 'noTransactionData';
  if (isConvertibleOnly(entry.securityTypes)) return 'convertibleOnly';
  return entry.fmv?.fmvUnavailableCode ?? 'noCapTableSnapshot';
}

export function buildFmvCoverage(entries: FmvCoverageEntry[]): FmvCoverage {
  const coverage: FmvCoverage = {
    includedCount: 0,
    excludedCount: 0,
    excludedCostUSD: 0,
    excludedByReason: {
      noTransactionData: 0,
      convertibleOnly: 0,
      noCapTableSnapshot: 0,
      snapshotMissingInputs: 0,
      noRecordedHoldings: 0,
    },
  };
  for (const entry of entries) {
    const reason = fmvExclusionReason(entry);
    if (reason === null) {
      coverage.includedCount += 1;
      continue;
    }
    coverage.excludedCount += 1;
    coverage.excludedCostUSD += entry.myAggregateCostUSD;
    coverage.excludedByReason[reason] += 1;
  }
  return coverage;
}

const listPortfolioCompaniesInput = z.object({
  fund_id: z
    .number()
    .int()
    .optional()
    .describe(
      'Filter to companies with transactions from this fund id (from list_funds).',
    ),
  status: z
    .string()
    .optional()
    .describe(
      'Filter on investmentStatus, e.g. "Active" / "Exited" / "Pending". Case-insensitive exact match.',
    ),
  stage: z
    .string()
    .optional()
    .describe(
      'Filter by current stage (e.g. "Series A", "Seed"). Case-insensitive exact match.',
    ),
  industry: z
    .string()
    .optional()
    .describe('Substring match on industry, case-insensitive.'),
  domain: z
    .string()
    .optional()
    .describe('Substring match on website domain, case-insensitive.'),
  headquarters: z
    .string()
    .optional()
    .describe('Substring match on headquarters location, case-insensitive.'),
  sector: z
    .string()
    .optional()
    .describe('Substring match on sector, case-insensitive.'),
  founded_year: z
    .number()
    .int()
    .optional()
    .describe('Exact match on founding year.'),
  entity_type: z
    .string()
    .optional()
    .describe(
      'Filter on entity type (e.g. "Corporation", "LLC"). Case-insensitive exact match.',
    ),
  min_fmv_usd: z
    .number()
    .optional()
    .describe(
      'Return companies whose current FMV (USD) is at or above this value.',
    ),
  min_moic: z
    .number()
    .optional()
    .describe('Return companies whose multiple is at or above this value.'),
  ...paginationSchema,
});

export type ListPortfolioCompaniesInput = z.infer<
  typeof listPortfolioCompaniesInput
>;

const ciIncludes = (value: string | null | undefined, query: string) =>
  (value ?? '').toLowerCase().includes(query.toLowerCase());

const ciEquals = (value: string | null | undefined, query: string) =>
  (value ?? '').toLowerCase() === query.toLowerCase();

interface IdentityFilterField {
  inputKey: keyof Pick<
    ListPortfolioCompaniesInput,
    | 'industry'
    | 'domain'
    | 'headquarters'
    | 'sector'
    | 'founded_year'
    | 'entity_type'
  >;
  matches: (
    company: InvCompany | undefined,
    input: ListPortfolioCompaniesInput,
  ) => boolean;
  isPopulated: (company: InvCompany) => boolean;
}

/**
 * One table drives both filtering and coverage reporting for the identity
 * fields, matched against InvCompany's raw nullable values rather than the
 * transformed PortfolioCompany fields — transformInvToPortfolioCompany
 * defaults unpopulated identity fields to '' / 0 / 'Corporation' for display,
 * which would make "not populated" indistinguishable from a real value and,
 * for entity_type, actively misrepresent unknowns as a real Corporation.
 */
const IDENTITY_FILTER_FIELDS: IdentityFilterField[] = [
  {
    inputKey: 'industry',
    matches: (c, input) =>
      !input.industry || ciIncludes(c?.industry, input.industry),
    isPopulated: (c) => !!c.industry,
  },
  {
    inputKey: 'domain',
    matches: (c, input) => !input.domain || ciIncludes(c?.domain, input.domain),
    isPopulated: (c) => !!c.domain,
  },
  {
    inputKey: 'headquarters',
    matches: (c, input) =>
      !input.headquarters || ciIncludes(c?.headquarters, input.headquarters),
    isPopulated: (c) => !!c.headquarters,
  },
  {
    inputKey: 'sector',
    matches: (c, input) => !input.sector || ciIncludes(c?.sector, input.sector),
    isPopulated: (c) => !!c.sector,
  },
  {
    inputKey: 'founded_year',
    matches: (c, input) =>
      input.founded_year === undefined || c?.foundedYear === input.founded_year,
    isPopulated: (c) => c.foundedYear != null,
  },
  {
    inputKey: 'entity_type',
    matches: (c, input) =>
      !input.entity_type || ciEquals(c?.entityType, input.entity_type),
    isPopulated: (c) => !!c.entityType,
  },
];

export function matchesIdentityFilters(
  company: InvCompany | undefined,
  input: ListPortfolioCompaniesInput,
): boolean {
  return IDENTITY_FILTER_FIELDS.every((f) => f.matches(company, input));
}

/**
 * For each identity field the caller actually filtered on, report how many
 * of the candidate companies (before this filter narrowed them) have that
 * field populated at all — so an empty/small result can be told apart from
 * "the field just isn't populated for most of this portfolio."
 */
export function buildFieldCoverage(
  input: ListPortfolioCompaniesInput,
  candidates: InvCompany[],
): Record<string, { populatedCount: number; totalCount: number }> {
  const activeFields = IDENTITY_FILTER_FIELDS.filter(
    (f) => input[f.inputKey] !== undefined,
  );
  if (activeFields.length === 0) return {};

  const totalCount = candidates.length;
  const coverage: Record<
    string,
    { populatedCount: number; totalCount: number }
  > = {};
  for (const field of activeFields) {
    coverage[field.inputKey] = {
      populatedCount: candidates.filter(field.isPopulated).length,
      totalCount,
    };
  }
  return coverage;
}

async function listPortfolioCompanies(input: ListPortfolioCompaniesInput) {
  const fundOptions =
    input.fund_id !== undefined ? { fundId: input.fund_id } : undefined;

  const [{ companies }, invCompanies] = await Promise.all([
    getInvPortfolioCompanies(fundOptions),
    getScopedPortfolioInvCompanies(fundOptions),
  ]);

  const invCompanyById = new Map(invCompanies.map((ic) => [ic.id, ic]));
  const fieldCoverage = buildFieldCoverage(input, invCompanies);

  // myTotalFMV on the transformed PortfolioCompany defaults to 0 when FMV
  // can't be computed (a UI display convention) — recomputed here so the
  // list surfaces a real null + reason instead, matching
  // get_portfolio_company's valuation.myFmvUSD behavior. moic (below) is
  // nulled whenever FMV is unavailable but otherwise still reads the
  // transformed company's value — a known, deliberately deferred
  // inconsistency, not an oversight.
  const companyIds = invCompanies.map((ic) => ic.id);
  const [
    latestSnapshotByCompanyId,
    valuationResults,
    securityTypesByCompanyId,
  ] = await Promise.all([
    getInvLatestCapTableSnapshotBatch(companyIds),
    Promise.all(invCompanies.map((ic) => getInvCompanyValuation(ic.id))),
    getInvSecurityTypesByCompanyBatch(companyIds),
  ]);
  const fmvByCompanyId = new Map<number, FmvResult>(
    invCompanies.map((ic, idx) => {
      const snapshot = latestSnapshotByCompanyId.get(ic.id);
      const { valuation, overridden } = valuationResults[idx];
      const ourImpliedValue = extractOurImpliedValue(snapshot?.capTableDetail);
      const fmvOverridden =
        overriddenValuationFieldSet(overridden).has('myFmv');
      return [
        ic.id,
        computeFmv({
          status: ic.status,
          ourImpliedValue,
          viewMyFmv: valuation.myFmv,
          hasCapTableSnapshot: !!snapshot,
          fmvOverridden,
          myUnits: valuation.myUnits,
          snapshotDate: snapshot?.snapshotDate ?? valuation.snapshotDate,
          overrideCreatedAt: overridden.fields.myFmv?.createdAt ?? null,
        }),
      ];
    }),
  );

  const filtered = companies.filter((c) => {
    if (input.status && !ciEquals(c.investmentStatus, input.status)) {
      return false;
    }
    if (input.stage && !ciEquals(c.stage, input.stage)) {
      return false;
    }
    if (!matchesIdentityFilters(invCompanyById.get(c.entityId), input)) {
      return false;
    }
    if (input.min_fmv_usd !== undefined) {
      const myFmvUSD = fmvByCompanyId.get(c.entityId)?.myFmvUSD;
      if (myFmvUSD == null || myFmvUSD < input.min_fmv_usd) {
        return false;
      }
    }
    if (input.min_moic !== undefined) {
      const myFmvUSD = fmvByCompanyId.get(c.entityId)?.myFmvUSD;
      if (myFmvUSD == null || (c.moic ?? 0) < input.min_moic) {
        return false;
      }
    }
    return true;
  });

  // Totals are computed across the full filtered set so they remain
  // meaningful when paginating. Companies whose FMV is unavailable
  // contribute 0 to the sum (same as being excluded), not a fake value.
  const totalPortfolioCostUSD = filtered.reduce(
    (s, c) => s + (c.myAggregateCost || 0),
    0,
  );
  const totalPortfolioFmvUSD = filtered.reduce(
    (s, c) => s + (fmvByCompanyId.get(c.entityId)?.myFmvUSD ?? 0),
    0,
  );
  const weightedMoic =
    totalPortfolioCostUSD > 0
      ? totalPortfolioFmvUSD / totalPortfolioCostUSD
      : null;
  const fmvCoverage = buildFmvCoverage(
    filtered.map((c) => ({
      hasTransactionData: c.hasTransactionData,
      myAggregateCostUSD: c.myAggregateCost || 0,
      fmv: fmvByCompanyId.get(c.entityId),
      securityTypes: securityTypesByCompanyId.get(c.entityId),
    })),
  );

  const rows = filtered.map((c) => {
    const identity = invCompanyById.get(c.entityId);
    const fmv = fmvByCompanyId.get(c.entityId);
    return {
      publicId: c.id,
      name: c.name,
      domain: identity?.domain ?? null,
      investmentStatus: c.investmentStatus ?? null,
      stage: c.stage ?? null,
      industry: identity?.industry ?? null,
      sector: identity?.sector ?? null,
      headquarters: identity?.headquarters ?? null,
      foundedYear: identity?.foundedYear ?? null,
      entityType: identity?.entityType ?? null,
      myAggregateCostUSD: c.myAggregateCost ?? null,
      myFmvUSD: fmv?.myFmvUSD ?? null,
      asOfDate: fmv?.asOfDate ?? null,
      ...(fmv?.fmvUnavailableReason
        ? { fmvUnavailableReason: fmv.fmvUnavailableReason }
        : {}),
      moic: fmv?.myFmvUSD == null ? null : (c.moic ?? null),
      myFullyDilutedPercent: c.myFullyDilutedPercent ?? null,
      postMoneyValuationUSD: c.postMoneyValuation ?? null,
      currentPricePerUnitUSD: c.currentPricePerUnit ?? null,
      lastTransactionDate: c.lastTransactionDate ?? null,
      entryDate: c.myEntryDate ?? null,
      entryStage: c.stageAtEntry ?? null,
      entryCostUSD: c.myEntryCost ?? null,
      primaryFund: c.fund ?? null,
      funds:
        c.funds?.map((f) => ({
          id: f.id,
          name: f.name,
          shortName: f.shortName,
        })) ?? [],
      tags: c.tags.map((t) => t.name),
    };
  });

  const page = paginate(rows, input);
  return {
    count: page.items.length,
    totalMatched: page.totalAvailable,
    nextCursor: page.nextCursor,
    portfolioTotals: {
      companyCount: filtered.length,
      totalPortfolioCostUSD,
      totalPortfolioFmvUSD,
      weightedMoic,
      fmvCoverage,
    },
    // Omitted (not sent as null) when no identity filter was active — see
    // buildFieldCoverage.
    ...(Object.keys(fieldCoverage).length > 0 ? { fieldCoverage } : {}),
    companies: page.items,
  };
}

const COMPANY_SECTIONS = [
  'identity',
  'valuation',
  'entry',
  'investor_status',
  'board',
  'funds',
  'tags',
] as const;

const getPortfolioCompanyInput = z.object({
  public_id: z
    .string()
    .describe(
      'Portfolio company public_id (UUID, from list_portfolio_companies), or its name — full or partial, case and punctuation ignored.',
    ),
  include: z
    .array(z.enum(COMPANY_SECTIONS))
    .optional()
    .describe(
      'Which sections to include. Defaults to all. Pass a subset to keep the response lean — ' +
        '"identity"+"valuation" for the basics, "board"+"investor_status" for governance, etc. ' +
        `Available: ${COMPANY_SECTIONS.join(', ')}. ` +
        'publicId, name, and status are always returned.',
    ),
});

function summarizeFund(f: InvFund | null | undefined) {
  if (!f) return null;
  return { id: f.id, name: f.name, shortName: f.shortName };
}

async function getPortfolioCompanyTool(
  input: z.infer<typeof getPortfolioCompanyInput>,
) {
  const company = await resolveCompanyRef(input.public_id);
  assertSameOrg([company], 'get_portfolio_company');

  const requested = new Set(input.include ?? COMPANY_SECTIONS);

  const identity = {
    publicId: company.publicId,
    name: company.name,
    legalName: company.legalName,
    domain: company.domain,
    industry: company.industry,
    sector: company.sector,
    headquarters: company.headquarters,
    foundedYear: company.foundedYear,
    entityType: company.entityType,
    legalJurisdiction: company.legalJurisdiction,
    description: company.description,
    stage: company.stageDisplayName,
    entryStage: company.entryStageDisplayName,
    investmentThesis: company.investmentThesis,
    contactPerson: company.contactPerson,
    contactEmail: company.contactEmail,
  };

  const projected: Record<string, unknown> = {
    publicId: company.publicId,
    name: company.name,
    status: company.status,
  };

  if (requested.has('identity')) {
    projected.identity = identity;
  }

  if (requested.has('tags')) {
    projected.tags = company.tags ?? [];
  }

  // funds metadata is computed by the valuation view, so the three
  // sections share one fetch.
  const needsValuation =
    requested.has('valuation') ||
    requested.has('entry') ||
    requested.has('funds');
  const valuationResult = needsValuation
    ? await getInvCompanyValuation(company.id)
    : null;
  const valuation: InvCompanyValuation | null =
    valuationResult?.valuation ?? null;

  if (requested.has('valuation') && valuation && valuationResult) {
    // Mirror the UI transform: prefer cap_table_detail.our_implied_value
    // (and investment_position.realized_proceeds) from the latest snapshot,
    // fall back to the v_inv_company_valuation view. The view aggregates
    // can lag the cap_table_detail JSON, so reading it raw is what caused
    // the FMV mismatch with the portfolio table.
    const allSnapshots = await getInvAllCapTableSnapshots(company.id);
    const latestSnapshot = allSnapshots
      .slice()
      .sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate))[0];
    const ourImpliedValue = extractOurImpliedValue(
      latestSnapshot?.capTableDetail,
    );
    const latestRealizedProceeds = extractRealizedProceeds(
      latestSnapshot?.capTableDetail,
    );

    const aggregateCostUSD =
      valuation.aggregateCost != null
        ? Math.abs(valuation.aggregateCost)
        : null;

    const fmvOverridden = overriddenValuationFieldSet(
      valuationResult.overridden,
    ).has('myFmv');
    const { myFmvUSD, asOfDate, fmvUnavailableReason } = computeFmv({
      status: company.status,
      ourImpliedValue,
      viewMyFmv: valuation.myFmv,
      hasCapTableSnapshot: !!latestSnapshot,
      fmvOverridden,
      myUnits: valuation.myUnits,
      snapshotDate: latestSnapshot?.snapshotDate ?? valuation.snapshotDate,
      overrideCreatedAt:
        valuationResult.overridden.fields.myFmv?.createdAt ?? null,
    });

    const realizedProceedsUSD =
      latestRealizedProceeds ?? valuation.realizedProceeds ?? 0;
    const moic =
      aggregateCostUSD && aggregateCostUSD > 0 && myFmvUSD != null
        ? (myFmvUSD + realizedProceedsUSD) / aggregateCostUSD
        : null;

    projected.valuation = {
      myFmvUSD,
      asOfDate,
      ...(fmvUnavailableReason ? { fmvUnavailableReason } : {}),
      myAggregateCostUSD: aggregateCostUSD,
      realizedProceedsUSD,
      moic,
      myOwnershipPercent:
        valuation.ownershipPct != null
          ? Math.round(valuation.ownershipPct * 10000) / 100
          : null,
      myFullyDilutedPercent:
        valuation.myFdPct != null
          ? Math.round(valuation.myFdPct * 10000) / 100
          : null,
      myUnits: recordsNoHoldings({
        status: company.status,
        myUnits: valuation.myUnits,
        fmvOverridden,
      })
        ? null
        : valuation.myUnits,
      postMoneyValuationUSD: valuation.postMoneyValuation,
      currentPricePerUnitUSD: valuation.currentPriceUnit,
      fullyDilutedTotal: valuation.fullyDilutedTotal,
      totalEquityFinancingUSD: valuation.totalEquityFinancing,
      lastTransactionDate: valuation.lastTransactionDate,
      snapshotDate: latestSnapshot?.snapshotDate ?? valuation.snapshotDate,
    };
  }

  if (requested.has('entry') && valuation) {
    projected.entry = {
      entryDate: valuation.entryDate,
      entryAmountUSD: valuation.entryAmount,
      entryStage: valuation.entryStageDisplayName,
      currentStage: valuation.currentStageDisplayName,
    };
  }

  if (requested.has('funds') && valuation) {
    projected.funds = {
      primaryFundName: valuation.primaryFundName,
      primaryFundShortName: valuation.primaryFundShortName,
      fundIds: valuation.fundIds ?? [],
      fundNames: valuation.fundNames ?? [],
      fundShortNames: valuation.fundShortNames ?? [],
    };
  }

  if (requested.has('investor_status')) {
    const status = await getInvInvestorStatus(company.id);
    projected.investorStatus = status;
  }

  if (requested.has('board')) {
    const [{ members }, portfolioFundIds] = await Promise.all([
      getInvBoardComposition(company.id),
      getPortfolioFundIds(),
    ]);
    assertSameOrg(members, 'get_portfolio_company:board');
    projected.board = summarizeBoard(members, portfolioFundIds);
  }

  return projected;
}

/**
 * Funds that have actually deployed capital for this org. inv_fund also holds
 * every co-investor vehicle extracted from documents, so "resolves to a fund
 * in our org" does not mean "ours" — a seat is ours only when its designating
 * fund is one we invested through.
 */
async function getPortfolioFundIds(): Promise<ReadonlySet<number>> {
  const { funds } = await getInvPortfolioFunds();
  return new Set(funds.map((f) => f.id));
}

const OBSERVER_SEAT_TYPES = new Set(['observer', 'board_observer']);
const LEAD_SEAT_TYPES = new Set(['lead', 'investor_lead']);

export function summarizeBoard(
  members: InvBoardSeat[],
  portfolioFundIds: ReadonlySet<number>,
) {
  // Observer bucket is named; everything else is a director (which includes
  // 'director', 'board_director', 'lead', 'investor_lead', etc.). Mirrors
  // the UI transform in lib/v2/inv/transforms.ts.
  const observers = members.filter((m) => OBSERVER_SEAT_TYPES.has(m.seatType));
  const directors = members.filter((m) => !OBSERVER_SEAT_TYPES.has(m.seatType));
  const ourDirectors = directors.filter(
    (m) =>
      m.designatingFundId !== null && portfolioFundIds.has(m.designatingFundId),
  );
  return {
    directorCount: directors.length,
    observerCount: observers.length,
    ourDirectorCount: ourDirectors.length,
    directors: directors.map((m) => ({
      name: m.holderName,
      title: m.holderTitle,
      seatType: m.seatType,
      isLead: LEAD_SEAT_TYPES.has(m.seatType),
      effectiveDate: m.effectiveDate,
      designatingFund: summarizeFund(m.designatingFund ?? undefined),
    })),
    observers: observers.map((m) => ({
      name: m.holderName,
      title: m.holderTitle,
      seatType: m.seatType,
      effectiveDate: m.effectiveDate,
      designatingFund: summarizeFund(m.designatingFund ?? undefined),
    })),
  };
}

const getCapTableInput = z.object({
  public_id: z
    .string()
    .describe(
      'Portfolio company public_id (UUID), or its name — full or partial, case and punctuation ignored.',
    ),
  snapshot_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)')
    .optional()
    .describe(
      'Specific snapshot date (YYYY-MM-DD) to fetch. Defaults to the most recent. ' +
        'Exact match against availableDates — for "as of" a date (e.g. quarter-end), use include_history and take the latest snapshot on or before that date.',
    ),
  include_history: z
    .boolean()
    .optional()
    .describe(
      'When true, returns every snapshot (sorted newest first) instead of one. Use for FMV-over-time / ownership-over-time questions.',
    ),
  include_option_pool: z
    .boolean()
    .optional()
    .describe(
      'When true, includes equity plan snapshots (option pool authorized / issued / outstanding / available).',
    ),
});

// inv_cap_table_snapshot / inv_equity_plan_snapshot percent columns are
// stored inconsistently in the DB — sometimes as a fraction (0.05),
// sometimes as a percentage (5). Mirrors the same defensive normalization
// the UI does in cap-table-utils.ts (originally for ourPreferredPct only).
export function normalizeStoredPercent(value: number | null): number | null {
  if (value == null) return null;
  const percent = value > 1 ? value : value * 100;
  return Math.round(percent * 100) / 100;
}

function summarizeSnapshot(s: InvCapTableSnapshot) {
  return {
    snapshotDate: s.snapshotDate,
    snapshotType: s.snapshotTypeCode,
    financingRoundId: s.financingRoundId,
    stage: s.stageName,
    stageCode: s.stageCode,
    impliedValuationUSD: s.impliedValuation,
    sharePriceUSD: s.sharePrice,
    fullyDilutedTotal: s.fullyDilutedTotal,
    totalOutstanding: s.totalOutstanding,
    common: {
      authorized: s.commonAuthorized,
      outstanding: s.commonOutstanding,
    },
    preferred: {
      authorized: s.preferredAuthorized,
      outstanding: s.preferredOutstanding,
    },
    optionPool: {
      authorized: s.optionPoolAuthorized,
      outstanding: s.optionPoolOutstanding,
      available: s.optionPoolAvailable,
      fdPercent: normalizeStoredPercent(s.optionPoolFdPercent),
    },
    ourPosition: {
      totalShares: s.ourTotalShares,
      commonShares: s.ourCommonShares,
      preferredShares: s.ourPreferredShares,
      preferredPercent: normalizeStoredPercent(s.ourPreferredPct),
      ownershipPercent: normalizeStoredPercent(s.ourOwnershipPercent),
      fdOwnershipPercent: normalizeStoredPercent(s.ourFdOwnershipPercent),
      votingPercent: normalizeStoredPercent(s.ourVotingPct),
      impliedValueUSD: extractOurImpliedValue(s.capTableDetail),
      realizedProceedsUSD: extractRealizedProceeds(s.capTableDetail),
    },
  };
}

async function getCompanyCapTable(input: z.infer<typeof getCapTableInput>) {
  const company = await resolveCompanyRef(input.public_id);

  let snapshots: InvCapTableSnapshot[];
  let availableDates: string[];

  if (input.include_history) {
    snapshots = await getInvAllCapTableSnapshots(company.id);
    availableDates = snapshots.map((s) => s.snapshotDate);
  } else {
    try {
      const result = await getInvCapTableSnapshot(
        company.id,
        input.snapshot_date,
      );
      snapshots = [result.snapshot];
      availableDates = result.availableDates;
    } catch (err) {
      if (err instanceof NotFoundError) {
        return {
          found: false as const,
          publicId: company.publicId,
          availableDates: [],
          reason: 'No cap table snapshots recorded for this company.',
        };
      }
      throw err;
    }
  }

  assertSameOrg(snapshots, 'get_company_cap_table');

  const projected: Record<string, unknown> = {
    found: true as const,
    publicId: company.publicId,
    name: company.name,
    availableDates,
    snapshots: snapshots.map(summarizeSnapshot),
  };

  if (input.include_option_pool) {
    const { snapshots: planSnapshots } = await getInvEquityPlanSnapshots(
      company.id,
    );
    projected.equityPlanSnapshots = planSnapshots.map((p) => ({
      planName: p.planName,
      effectiveDate: p.effectiveDate,
      authorizedShares: p.authorizedShares,
      issuedShares: p.issuedShares,
      outstandingOptions: p.outstandingOptions,
      exercisedShares: p.exercisedShares,
      cancelledShares: p.cancelledShares,
      poolPercentFd: normalizeStoredPercent(p.poolPercentFd),
    }));
  }

  return projected;
}

const TX_TYPES = [
  'purchase',
  'secondary_purchase',
  'sale',
  'secondary_sale',
  'distribution',
  'exit',
  'conversion',
  'cancellation',
] as const;

const getTransactionsInput = z.object({
  public_id: z
    .string()
    .describe(
      'Portfolio company public_id (UUID), or its name — full or partial, case and punctuation ignored.',
    ),
  transaction_type: z
    .string()
    .optional()
    .describe(
      'Filter by transaction_type column (raw db value). Common values: ' +
        TX_TYPES.join(', ') +
        '. Case-insensitive exact match.',
    ),
  fund_id: z
    .number()
    .int()
    .optional()
    .describe('Restrict to transactions from a single fund id.'),
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)')
    .optional()
    .describe('ISO date — transactions on or after this date.'),
  until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)')
    .optional()
    .describe('ISO date — transactions on or before this date.'),
  ...paginationSchema,
});

interface SummarizedTx {
  publicId: string;
  date: string;
  settlementDate: string | null;
  transactionType: string;
  flowType: 'investment' | 'sale' | 'distribution' | 'exit';
  units: number;
  cumulativeUnits: number;
  amountUSD: number;
  costUSD: number;
  realizedProceedsUSD: number;
  currency: string;
  counterparty: string | null;
  notes: string | null;
  fund: ReturnType<typeof summarizeFund>;
  security: {
    name: string;
    securityType: string;
    seriesName: string | null;
  } | null;
  financingRound: {
    name: string;
    stage: string | null | undefined;
    stageCode: string | null | undefined;
    preMoneyValuationUSD: number | null;
    postMoneyValuationUSD: number | null;
    initialCloseDate: string | null;
    finalCloseDate: string | null;
  } | null;
}

/** Mirrors the transaction_type buckets in v_inv_position. */
const POSITION_COST_TYPES: ReadonlySet<string> = new Set(
  POSITION_COST_TRANSACTION_TYPES,
);
const POSITION_PROCEEDS_TYPES: ReadonlySet<string> = new Set(
  POSITION_PROCEEDS_TRANSACTION_TYPES,
);

// Mirrors lib/v2/inv/transforms.ts:transformInvTransactions so the LLM sees
// the same derived fields (flowType, cost/realizedProceeds split,
// cumulativeUnits, computed postMoney) the UI shows.
export function summarizeTransactions(
  transactions: InvTransaction[],
): SummarizedTx[] {
  const sorted = [...transactions].sort(
    (a, b) =>
      new Date(a.transactionDate).getTime() -
      new Date(b.transactionDate).getTime(),
  );

  let cumulativeUnits = 0;
  return sorted.map((t) => {
    const isSecondarySale = t.transactionType === 'secondary_sale';
    const isInflow =
      t.transactionType === 'distribution' || t.transactionType === 'exit';
    if (isInflow) cumulativeUnits -= t.units;
    else cumulativeUnits += t.units;

    const flowType: SummarizedTx['flowType'] = isInflow
      ? (t.transactionType as 'distribution' | 'exit')
      : isSecondarySale
        ? 'sale'
        : 'investment';

    const preMoney = t.financingRound?.preMoneyValuation;
    let postMoney = t.financingRound?.impliedValuation ?? null;
    if (postMoney == null && preMoney != null && preMoney > 0) {
      postMoney = preMoney + t.amount;
    }

    return {
      publicId: t.publicId,
      date: t.transactionDate,
      settlementDate: t.settlementDate,
      transactionType: t.transactionType,
      flowType,
      units: t.units,
      cumulativeUnits,
      amountUSD: t.amount,
      // Two positive lists decide the money split: everything else
      // (transfers, write-offs, conversions, reclassifications) restates a
      // position rather than deploying or returning capital, so it is
      // neither cost nor proceeds by construction.
      costUSD: POSITION_COST_TYPES.has(t.transactionType)
        ? Math.abs(t.amount)
        : 0,
      realizedProceedsUSD: POSITION_PROCEEDS_TYPES.has(t.transactionType)
        ? Math.abs(t.amount)
        : 0,
      currency: t.currency,
      counterparty: t.counterpartyName,
      notes: t.notes,
      fund: summarizeFund(t.fund),
      security: t.security
        ? {
            name: t.security.name,
            securityType: t.security.securityType,
            seriesName: t.security.seriesName,
          }
        : null,
      financingRound: t.financingRound
        ? {
            name: t.financingRound.name,
            stage: t.financingRound.stageName,
            stageCode: t.financingRound.stageCode,
            preMoneyValuationUSD: t.financingRound.preMoneyValuation,
            postMoneyValuationUSD: postMoney,
            initialCloseDate: t.financingRound.initialCloseDate,
            finalCloseDate: t.financingRound.finalCloseDate,
          }
        : null,
    };
  });
}

async function getCompanyTransactions(
  input: z.infer<typeof getTransactionsInput>,
) {
  const company = await resolveCompanyRef(input.public_id);
  const { transactions } = await getInvTransactions(company.id);
  assertSameOrg(transactions, 'get_company_transactions');

  const typeFilter = input.transaction_type?.toLowerCase();
  const filtered = transactions.filter((t) => {
    if (typeFilter && t.transactionType.toLowerCase() !== typeFilter) {
      return false;
    }
    if (input.fund_id !== undefined && t.fundId !== input.fund_id) return false;
    if (input.since && t.transactionDate < input.since) return false;
    if (input.until && t.transactionDate > input.until) return false;
    return true;
  });

  const summarized = summarizeTransactions(filtered);
  // Sort newest first for display — summarizeTransactions sorts ascending
  // because cumulativeUnits needs chronological accumulation.
  const displayed = [...summarized].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );

  // Totals are computed across the full filtered set so they remain
  // meaningful when paginating.
  const totalInvestedUSD = summarized.reduce((s, t) => s + t.costUSD, 0);
  const totalProceedsUSD = summarized.reduce(
    (s, t) => s + t.realizedProceedsUSD,
    0,
  );

  const page = paginate(displayed, input);
  return {
    publicId: company.publicId,
    count: page.items.length,
    totalMatched: page.totalAvailable,
    nextCursor: page.nextCursor,
    totals: {
      totalInvestedUSD,
      totalProceedsUSD,
      netUSD: totalProceedsUSD - totalInvestedUSD,
    },
    transactions: page.items,
  };
}

const LEGAL_SECTIONS = [
  'header_status',
  'information_rights',
  'major_investor',
  'economic_rights',
  'qsbs',
  'dividends',
  'other',
] as const;

export const MAX_LEGAL_SECTIONS_PER_CALL = 3;
export const DEFAULT_LEGAL_SECTIONS = [
  'header_status',
  'economic_rights',
  'other',
] as const;

export const getLegalTermsInputSchema = z.object({
  public_id: z
    .string()
    .describe(
      'Portfolio company public_id (UUID), or its name — full or partial, case and punctuation ignored.',
    ),
  include: z
    .array(z.enum(LEGAL_SECTIONS))
    .max(MAX_LEGAL_SECTIONS_PER_CALL)
    .optional()
    .describe(
      `Which sections to include. Defaults to ["header_status","economic_rights","other"]. Max ${MAX_LEGAL_SECTIONS_PER_CALL} sections per call — request different subsets across calls to retrieve the full record. ` +
        `Available: ${LEGAL_SECTIONS.join(', ')}.`,
    ),
});

async function getCompanyLegalTerms(
  input: z.infer<typeof getLegalTermsInputSchema>,
) {
  const company = await resolveCompanyRef(input.public_id);
  const [legalTermsResult, investorStatus, snapshots] = await Promise.all([
    getInvLegalTerms(company.id),
    getInvInvestorStatus(company.id),
    getInvAllCapTableSnapshots(company.id),
  ]);

  const baseLegalTerms = transformInvToLegalTerms(
    legalTermsResult.informationRights,
    legalTermsResult.roundTerms,
    legalTermsResult.securityTerms,
    investorStatus,
  );

  // Aumni-imported portcos store legal terms inside the latest
  // portfolio_import snapshot's cap_table_detail JSON, not in the
  // structured inv_round_terms / inv_security_terms tables. The UI
  // overlays them via applySnapshotLegalTerms; mirror that so the tool
  // doesn't return nulls on terms the user can see on the page.
  const latestSnapshot = snapshots
    .slice()
    .sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate))[0];
  const legalTerms =
    latestSnapshot?.snapshotTypeCode === 'portfolio_import'
      ? applySnapshotLegalTerms(
          baseLegalTerms,
          latestSnapshot.capTableDetail,
          toOverriddenLegalTermsKeys(legalTermsResult.legalTermsEdit),
        )
      : baseLegalTerms;

  const requested = new Set(input.include ?? DEFAULT_LEGAL_SECTIONS);
  const projected: Record<string, unknown> = {
    publicId: company.publicId,
    name: company.name,
  };

  if (requested.has('header_status')) {
    projected.headerStatus = legalTerms.headerStatus;
  }
  if (requested.has('information_rights')) {
    projected.informationRights = legalTerms.informationRights;
  }
  if (requested.has('major_investor')) {
    // major_investor_threshold_ownership_pct goes through the same
    // unranged ingestion path as the cap table percent columns above, so
    // it needs the same fraction-or-percent normalization.
    projected.majorInvestor = {
      ...legalTerms.majorInvestor,
      thresholdOwnershipPercent: normalizeStoredPercent(
        legalTerms.majorInvestor.thresholdOwnershipPercent,
      ),
    };
  }
  if (requested.has('economic_rights')) {
    projected.economicRights = legalTerms.economicRights;
  }
  if (requested.has('qsbs')) {
    projected.qsbs = legalTerms.qsbs;
  }
  if (requested.has('dividends')) {
    projected.dividends = legalTerms.dividends;
  }
  if (requested.has('other')) {
    projected.otherLegalTerms = legalTerms.otherLegalTerms;
  }

  return projected;
}

const getBoardInput = z.object({
  public_id: z
    .string()
    .describe(
      'Portfolio company public_id (UUID), or its name — full or partial, case and punctuation ignored.',
    ),
});

async function getCompanyBoard(input: z.infer<typeof getBoardInput>) {
  const company = await resolveCompanyRef(input.public_id);
  const [{ members }, portfolioFundIds] = await Promise.all([
    getInvBoardComposition(company.id),
    getPortfolioFundIds(),
  ]);
  assertSameOrg(members, 'get_company_board');

  return {
    publicId: company.publicId,
    name: company.name,
    ...summarizeBoard(members, portfolioFundIds),
  };
}

const getSecuritiesInput = z.object({
  public_id: z
    .string()
    .describe(
      'Portfolio company public_id (UUID), or its name — full or partial, case and punctuation ignored.',
    ),
  security_type: z
    .string()
    .optional()
    .describe(
      'Filter by security_type (e.g. "common", "preferred", "option", "warrant", "safe", "convertible_note"). Case-insensitive exact match.',
    ),
});

function summarizeSecurityTerms(t: InvSecurityTerms | null) {
  if (!t) return null;
  return {
    effectiveDate: t.effectiveDate,
    originalIssuePriceUSD: t.originalIssuePrice,
    authorizedShares: t.authorizedShares,
    issuedShares: t.issuedShares,
    outstandingShares: t.outstandingShares,
    parValueUSD: t.parValue,
    conversionPriceUSD: t.conversionPrice,
    conversionRatio: t.conversionRatio,
    antiDilutionType: t.antiDilutionType,
    aggregateLiqPrefUSD: t.aggregateLiqPref,
    liquidationMultiplier: t.liquidationMultiplier,
    liquidationSeniority: t.liquidationSeniority,
    participationType: t.participationType,
    participationCap: t.participationCap,
    dividendRatePercent: normalizeRatePercent(t.dividendRate),
    dividendCumulative: t.dividendCumulative,
    dividendAccruing: t.dividendAccruing,
    dividendSeniority: t.dividendSeniority,
    // Null on equity securities — these are convertible-note / SAFE-only.
    valuationCapUSD: t.valuationCap,
    discountRatePercent: normalizeRatePercent(t.discountRate),
    interestRatePercent: normalizeRatePercent(t.interestRate),
    interestType: t.interestType,
    maturityDate: t.maturityDate,
    qualifiedFinancingThresholdUSD: t.qualifiedFinancingThreshold,
  };
}

function summarizeSecurity(s: InvSecurity) {
  return {
    publicId: s.publicId,
    name: s.name,
    securityType: s.securityType,
    seriesName: s.seriesName,
    isValuationReference: s.isValuationReference,
    currentTerms: summarizeSecurityTerms(s.terms),
  };
}

async function getCompanySecurities(input: z.infer<typeof getSecuritiesInput>) {
  const company = await resolveCompanyRef(input.public_id);
  const { securities } = await getInvSecurities(company.id);
  assertSameOrg(securities, 'get_company_securities');

  const typeFilter = input.security_type?.toLowerCase();
  const filtered = typeFilter
    ? securities.filter((s) => s.securityType.toLowerCase() === typeFilter)
    : securities;

  return {
    publicId: company.publicId,
    name: company.name,
    count: filtered.length,
    securities: filtered.map(summarizeSecurity),
  };
}

const getRoundsInput = z.object({
  public_id: z
    .string()
    .describe(
      'Portfolio company public_id (UUID), or its name — full or partial, case and punctuation ignored.',
    ),
});

async function getCompanyFinancingRounds(
  input: z.infer<typeof getRoundsInput>,
) {
  const company = await resolveCompanyRef(input.public_id);
  const [rounds, snapshots] = await Promise.all([
    getInvFinancingRounds(company.id),
    getInvAllCapTableSnapshots(company.id),
  ]);
  assertSameOrg(rounds, 'get_company_financing_rounds');

  // getInvFinancingRounds returns impliedValuation: null. Hydrate it by
  // taking the latest snapshot for each round (matches what the UI shows
  // in the FMV timeline and on transaction rows).
  const impliedByRoundId = new Map<number, number | null>();
  for (const snap of snapshots) {
    if (snap.financingRoundId == null) continue;
    const existing = impliedByRoundId.get(snap.financingRoundId);
    if (existing != null) continue;
    impliedByRoundId.set(snap.financingRoundId, snap.impliedValuation);
  }

  return {
    publicId: company.publicId,
    name: company.name,
    count: rounds.length,
    rounds: rounds.map((r) => {
      const impliedFromSnapshot = impliedByRoundId.get(r.id) ?? null;
      const preMoney = r.preMoneyValuation;
      // Fall back to pre-money for rounds that have no snapshot yet; nothing
      // we can do for rounds with neither.
      const impliedValuationUSD = impliedFromSnapshot ?? preMoney ?? null;
      return {
        publicId: r.publicId,
        name: r.name,
        stage: r.stageName,
        stageCode: r.stageCode,
        preMoneyValuationUSD: preMoney,
        impliedValuationUSD,
        announcedDate: r.announcedDate,
        initialCloseDate: r.initialCloseDate,
        finalCloseDate: r.finalCloseDate,
        currency: r.currency,
        notes: r.notes,
      };
    }),
  };
}

const listFundsInput = z.object({
  ...paginationSchema,
});

async function listFunds(input: z.infer<typeof listFundsInput>) {
  const { funds } = await getInvFunds();
  assertSameOrg(funds, 'list_funds');

  const rows = funds.map((f) => ({
    id: f.id,
    publicId: f.publicId,
    name: f.name,
    shortName: f.shortName,
    code: f.code,
    description: f.description,
    currency: f.currency,
    status: f.status,
    vintageYear: f.vintageYear,
    targetSizeUSD: f.targetSize,
    committedCapitalUSD: f.committedCapital,
  }));

  const page = paginate(rows, input);
  return {
    count: page.items.length,
    totalMatched: page.totalAvailable,
    nextCursor: page.nextCursor,
    funds: page.items,
  };
}

export const investorTools: McpToolDef[] = [
  {
    name: 'list_portfolio_companies',
    description:
      "List portfolio companies in the user's organization with rollup metrics — current FMV, MOIC, aggregate cost, FD%, post-money, primary fund, current/entry stage. myFmvUSD is null with an fmvUnavailableReason when it genuinely cannot be computed (including when the latest snapshot records zero holdings for an Active company), not 0 — closed/exited positions are the one legitimate real 0. " +
      'myFmvUSD is a pro-rata estimate (ownership % × last round post-money) that only refreshes when new transaction data is uploaded — asOfDate (YYYY-MM-DD) is the date of the cap-table snapshot it was computed from (or the date a manual FMV override was entered), so an old asOfDate means a stale estimate, not a current mark. ' +
      'Filters: fund_id (from list_funds), status (Active/Exited/Pending), stage (e.g. "Series A"), industry/domain/headquarters/sector (substring), founded_year (exact), entity_type (exact), min_fmv_usd, min_moic. Companies with unavailable FMV never match min_fmv_usd or min_moic. ' +
      'industry/domain/headquarters/sector/founded_year/entity_type are often unpopulated for companies onboarded via document extraction rather than a bulk import — when any of those filters is used, the response includes fieldCoverage showing how many candidate companies had that field populated, so an empty/small result can be told apart from "not populated" rather than "no match." ' +
      'myAggregateCostUSD is gross capital deployed — the |amount| of purchase-type rows (purchase, exercise, secondary_purchase, issuance), never reduced by transfers, write-offs or conversions — and is reported as 0 with a null moic for any company whose status is not Active, so totalPortfolioCostUSD and weightedMoic cover Active companies only. ' +
      'Top-level portfolioTotals (companyCount, totalPortfolioCostUSD, totalPortfolioFmvUSD, weightedMoic) are computed across the full filtered set, not the current page. totalPortfolioFmvUSD sums only companies with an available FMV, while totalPortfolioCostUSD (and so the weightedMoic denominator) includes every company — read portfolioTotals.fmvCoverage to judge how representative they are: includedCount / excludedCount of companies in the FMV sum, excludedCostUSD (cost carried by companies with no FMV), and excludedByReason counts (noTransactionData, convertibleOnly = SAFE/note-only positions with no cap-table stake until conversion, noCapTableSnapshot, snapshotMissingInputs, noRecordedHoldings). Exited companies count as included with a real 0. Paginated.',
    inputSchema: listPortfolioCompaniesInput,
    annotations: {
      title: 'List portfolio companies',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: listPortfolioCompanies as McpToolDef['handler'],
  },
  {
    name: 'get_portfolio_company',
    description:
      'Returns one portfolio company by public_id — the right tool for "show me / open / pull up" a specific company. ' +
      'Sections (pass `include` to slim the response): identity (name, domain, industry, HQ, founded, entity type, jurisdiction, stage, thesis), ' +
      'valuation (FMV, cost, MOIC, ownership%, FD%, post-money, current PPU — myFmvUSD is null with an fmvUnavailableReason when it genuinely cannot be computed, not 0, and when the latest snapshot records zero holdings for an Active company moic and myUnits are null too; asOfDate is the date of the cap-table snapshot or manual override the FMV estimate was computed from, since it only refreshes on new transaction uploads), entry (entry date / amount / stage, current stage), ' +
      'investor_status (major investor, info rights, pro-rata, board seat flags), board (directors/observers with designating funds), ' +
      'funds (fund roster invested in this company), tags. ' +
      'myAggregateCostUSD is gross capital deployed — the |amount| of purchase-type rows (purchase, exercise, secondary_purchase, issuance), never reduced by transfers, write-offs or conversions — and is reported as 0 with a null moic when the company status is not Active. ' +
      'For cap table call get_company_cap_table; for transactions call get_company_transactions; for the full legal-terms block call get_company_legal_terms.',
    inputSchema: getPortfolioCompanyInput,
    annotations: {
      title: 'Get portfolio company',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getPortfolioCompanyTool as McpToolDef['handler'],
  },
  {
    name: 'get_company_cap_table',
    description:
      'Cap table snapshot for a portfolio company. Returns totals (FD, outstanding, implied valuation, share price), common / preferred / option-pool breakdown, and our position (shares, ownership %, voting %, implied value USD, realized proceeds). ' +
      'Defaults to the most recent snapshot. Pass snapshot_date for a specific point in time. Pass include_history:true for every snapshot sorted newest first (for FMV / ownership over time questions). ' +
      'Pass include_option_pool:true to also return equity-plan snapshots (authorized / issued / outstanding options).',
    inputSchema: getCapTableInput,
    annotations: {
      title: 'Get company cap table',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getCompanyCapTable as McpToolDef['handler'],
  },
  {
    name: 'get_company_transactions',
    description:
      'Transaction history for a portfolio company — purchases, sales, secondary sales, distributions, exits, conversions. Each row carries date, type, units, amount USD, the fund and security involved, and the financing round (with stage and pre/implied valuation). ' +
      'Filters: transaction_type, fund_id, since/until (ISO dates). ' +
      'Top-level totals (totalInvestedUSD, totalProceedsUSD, netUSD) are computed across the full filtered set, not the current page. totalInvestedUSD counts only purchase-type rows (purchase, exercise, secondary_purchase, issuance) and totalProceedsUSD only sale/distribution/exit-type rows (sale, secondary_sale, redemption, exit, exit_consideration, distribution, dividend); transfer_out, write_off, conversions and reclassifications count in neither. The flowType on each row is display classification only (investment / sale / distribution / exit) and does not track that split — read costUSD and realizedProceedsUSD for the money. Paginated.',
    inputSchema: getTransactionsInput,
    annotations: {
      title: 'Get company transactions',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getCompanyTransactions as McpToolDef['handler'],
  },
  {
    name: 'get_company_legal_terms',
    description:
      'Legal / governance terms for a portfolio company. Built by overlaying the structured inv_round_terms / inv_security_terms tables with cap_table_detail.legal_terms from the latest portfolio_import snapshot (Aumni-imported portcos keep their terms in the snapshot JSON, not the structured tables). Mirrors what the Legal Terms tab on /investor/company/[id] renders. ' +
      'Sections (pass `include` to slim): header_status (the two badges — major investor, information rights), information_rights (monthly/quarterly/year-end reporting frequency flags across budget/cap-table/balance-sheet/income/audited statements), ' +
      'major_investor (threshold amount/shares/ownership%, named major investors), economic_rights (anti-dilution type, liquidation preference seniority, milestone closings), ' +
      'qsbs (rep made, covenant given), dividends (rate, accruing, cumulative, seniority), ' +
      'other (pro-rata, drag-along, pay-to-play, ROFR/co-sale, D&O insurance, vesting protocols, registration rights, counsel-fee cap, subsequent-closing window, etc.).',
    inputSchema: getLegalTermsInputSchema,
    annotations: {
      title: 'Get company legal terms',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getCompanyLegalTerms as McpToolDef['handler'],
  },
  {
    name: 'get_company_board',
    description:
      'Board composition for a portfolio company — directors and observers with their designating fund. Returns directorCount, observerCount, and ourDirectorCount — director seats designated by a fund we have actually invested through. Co-investor vehicles also appear as designating funds (they are extracted from the same documents) and do not count toward ourDirectorCount.',
    inputSchema: getBoardInput,
    annotations: {
      title: 'Get company board',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getCompanyBoard as McpToolDef['handler'],
  },
  {
    name: 'get_company_securities',
    description:
      'Securities issued by a portfolio company with current terms (where superseded_date IS NULL). Each row carries the security type (common / preferred / option / warrant / safe / convertible_note), series name, and the full terms block: ' +
      'original issue price, authorized/issued/outstanding shares, conversion price + ratio, anti-dilution type, liquidation (aggregate, multiplier, seniority), participation (type + cap), dividends, plus convertible-note / SAFE fields (valuation cap, discount, interest, maturity, qualified-financing threshold). ' +
      'Use this for liquidation-preference and protective-term questions on individual series. Filter by security_type.',
    inputSchema: getSecuritiesInput,
    annotations: {
      title: 'Get company securities',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getCompanySecurities as McpToolDef['handler'],
  },
  {
    name: 'get_company_financing_rounds',
    description:
      'Financing rounds for a portfolio company in chronological order. Each row carries stage, pre-money and implied (post-snapshot) valuation, announced / initial close / final close dates, and round currency. Use for round-history and stage-progression questions.',
    inputSchema: getRoundsInput,
    annotations: {
      title: 'Get company financing rounds',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getCompanyFinancingRounds as McpToolDef['handler'],
  },
  {
    name: 'list_funds',
    description:
      "List investment funds in the user's organization with name, short name, code, vintage year, currency, target size, and committed capital. Use to discover fund ids for filtering other tools (list_portfolio_companies, get_company_transactions).",
    inputSchema: listFundsInput,
    annotations: {
      title: 'List funds',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: listFunds as McpToolDef['handler'],
  },
];
