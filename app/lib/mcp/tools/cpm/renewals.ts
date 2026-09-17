import { z } from 'zod';
import {
  getContractsList,
  getMissingFields,
  type EnrichedContract,
} from '@/lib/v2';
import { extractBudgetFromPriceHistory } from '@/app/lib/budget';
import { getUSDValue } from '@/lib/v2/core/budget';
import { filterExcludeInvoices } from '@/lib/v2/core/filters';
import {
  contractOwners,
  ownerGroupNames,
  ownerSponsorNames,
} from '@/lib/v2/owners/embed';
import { requireMcpContext } from '@/app/lib/mcp/context';
import { assertSameOrg } from '@/app/lib/mcp/guards';
import { paginate, paginationSchema } from '@/app/lib/mcp/pagination';
import { resolveContractUsers } from '@/app/lib/mcp/contract-users';
import type { McpToolDef } from '@/app/lib/mcp/tools/types';

const getContractOrgId = (c: EnrichedContract): string | null | undefined =>
  c.contract?.organization_id;

function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

const upcomingInput = z.object({
  days: z
    .number()
    .int()
    .min(1)
    .max(730)
    .default(60)
    .describe('Window in days from today. Default 60.'),
  vendor_id: z
    .number()
    .int()
    .optional()
    .describe(
      'Restrict to a single vendor (from list_vendors). The day-window still applies, so contracts that are not renewing within `days` are correctly omitted.',
    ),
  ...paginationSchema,
});

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type ActionDateLabel = 'cancel-by' | 'term-end';

// Pick the date the user actually has to act on, plus a label so the agent
// can narrate which kind of date the countdown is anchored to (instead of
// inventing language like "the day before cancel-by"). For auto-renew
// contracts the cancel-by date is the deadline regardless of when the
// term itself ends — surfacing term_end as "action date" there is what
// caused the May-31-vs-June-1 hallucinations during testing.
//
// notice_date is intentionally NOT considered: it's a per-user reminder
// preference set in-app (when do *you* want to be pinged), not a
// contractual deadline.
function pickActionDate(
  cancelDate: string | null,
  termEnd: string | null,
  autoRenewal: boolean | null,
): { date: string | null; label: ActionDateLabel | null } {
  if (autoRenewal === true && cancelDate) {
    return { date: cancelDate, label: 'cancel-by' };
  }
  const candidates: Array<{ date: string; label: ActionDateLabel }> = [];
  if (cancelDate) candidates.push({ date: cancelDate, label: 'cancel-by' });
  if (termEnd) candidates.push({ date: termEnd, label: 'term-end' });
  if (candidates.length === 0) return { date: null, label: null };
  candidates.sort((a, b) => (a.date < b.date ? -1 : 1));
  return candidates[0];
}

const DATE_GUIDANCE =
  'Quote dates verbatim from this response. Do not paraphrase, round, ' +
  'or compute new dates from the ones returned. ' +
  'If you say "this term ends on X", X must equal currentTermEnd. ' +
  'If you say "cancel by X", X must equal cancelByDate. ' +
  'For commitment-length context, use multiYear + subscriptionTerm — ' +
  'do not infer "year N of M" from the dates yourself. ' +
  'actionDateLabel tells you which date the daysUntilAction countdown is ' +
  'anchored to ("cancel-by" / "term-end"); narrate using that label, ' +
  'e.g. "your cancel-by date is June 1, 2026 (23 days away)".';

async function getUpcomingRenewals(input: z.infer<typeof upcomingInput>) {
  const { contracts } = await getContractsList();
  assertSameOrg(contracts, 'get_upcoming_renewals', getContractOrgId);
  // Compare on calendar dates, not Date objects, so contracts whose action
  // date is *today* don't drop out after midnight UTC. actionDate strings
  // (YYYY-MM-DD) sort lexically, so we just compare against the local
  // calendar bounds in the same format.
  const today = new Date();
  const todayKey = toDateKey(today);
  const horizonKey = toDateKey(
    new Date(today.getTime() + input.days * 86_400_000),
  );

  // First pass: compute only the date fields needed to keep/drop a contract,
  // so extractBudgetFromPriceHistory runs on the (small) survivor set rather
  // than on every non-superseded contract in the org.
  const survivors = filterExcludeInvoices(contracts)
    .filter(
      (c) =>
        !c.isFullySuperseded &&
        (input.vendor_id === undefined || c.vendor_id === input.vendor_id),
    )
    .map((c) => {
      const currentTermEnd = c.contract.term_end_date?.[0]?.date ?? null;
      const cancelByDate = c.contract.cancel_date?.[0]?.date ?? null;
      const autoRenewal = c.contract.auto_renewal ?? null;
      const { date: actionDate, label: actionDateLabel } = pickActionDate(
        cancelByDate,
        currentTermEnd,
        autoRenewal,
      );
      return {
        c,
        currentTermEnd,
        cancelByDate,
        autoRenewal,
        actionDate,
        actionDateLabel,
      };
    })
    .filter(
      ({ actionDate }) =>
        !!actionDate && actionDate >= todayKey && actionDate <= horizonKey,
    )
    .sort((a, b) => (a.actionDate! < b.actionDate! ? -1 : 1));

  const items = survivors.map(
    ({
      c,
      currentTermEnd,
      cancelByDate,
      autoRenewal,
      actionDate,
      actionDateLabel,
    }) => {
      const ph = c.priceHistory;
      const budget = ph ? extractBudgetFromPriceHistory(ph) : null;
      return {
        contractId: c.id,
        vendor: { id: c.vendor_id, name: c.vendor_name },
        currentTermEnd,
        cancelByDate,
        actionDate,
        actionDateLabel,
        daysUntilAction: daysUntil(actionDate),
        renewalType: c.contract.renewal_type ?? null,
        autoRenewal,
        multiYear: c.contract.multi_year ?? null,
        subscriptionTerm: c.contract.subscription_term ?? null,
        annualIncrease: c.contract.annual_increase ?? null,
        // null when priceHistory is unavailable — distinct from 0/yr. The
        // legacy *USD source fields hold base-currency values (PSK-1796).
        currentAnnualSpendBase:
          budget?.effectiveCurrentUSD ?? budget?.currentUSD ?? null,
        projectedAnnualSpendBase:
          budget?.effectiveProjectedUSD ?? budget?.projectedUSD ?? null,
      };
    },
  );

  const page = paginate(items, input);
  return {
    horizonDays: input.days,
    count: page.items.length,
    totalMatched: page.totalAvailable,
    nextCursor: page.nextCursor,
    baseCurrency: requireMcpContext().userMetadata.baseCurrency,
    dateGuidance: DATE_GUIDANCE,
    contracts: page.items,
  };
}

const RENEWAL_SECTIONS = [
  'dates',
  'renewal',
  'spend',
  'products',
  'activeUsers',
  'seats',
  'ownership',
  'paymentTerms',
  'cancellationProcess',
  'aiSummary',
  'keyClauses',
  'missingClauses',
  'priceHistory',
] as const;

const summaryInput = z.object({
  contract_id: z
    .number()
    .int()
    .describe(
      'Contract id to brief on. For vendor-scoped questions like "what is renewing for X", call get_upcoming_renewals(vendor_id) first to discover the contract id, then call this for the deep dive.',
    ),
  include: z
    .array(z.enum(RENEWAL_SECTIONS))
    .optional()
    .describe(
      'Which sections to include. Defaults to all. Pass a subset to keep the response lean — ' +
        'e.g. ["dates","renewal","spend"] for a date+price brief, ' +
        '["activeUsers","seats"] for a license utilization check. ' +
        'Heavy sections worth omitting when not needed: priceHistory, missingClauses, keyClauses, products. ' +
        `Available: ${RENEWAL_SECTIONS.join(', ')}.`,
    ),
});

async function getRenewalSummary(input: z.infer<typeof summaryInput>) {
  const { contracts } = await getContractsList();
  assertSameOrg(contracts, 'get_renewal_summary', getContractOrgId);

  const target = contracts.find((c) => c.id === input.contract_id);
  if (!target) return { found: false as const };

  const c = target.contract;
  const ph = target.priceHistory;

  const currentTermEnd = c.term_end_date?.[0]?.date ?? null;
  const cancelByDate = c.cancel_date?.[0]?.date ?? null;
  const autoRenewal = c.auto_renewal ?? null;
  const { date: actionDate, label: actionDateLabel } = pickActionDate(
    cancelByDate,
    currentTermEnd,
    autoRenewal,
  );

  const requested = new Set(input.include ?? RENEWAL_SECTIONS);
  const projected: Record<string, unknown> = {
    found: true,
    contractId: target.id,
    vendor: { id: target.vendor_id, name: target.vendor_name },
  };

  // Denomination of every converted (`*Base`) figure below — attached only
  // when a monetary section is in scope so lean date-only calls stay lean.
  if (
    requested.has('spend') ||
    requested.has('products') ||
    requested.has('priceHistory')
  ) {
    projected.baseCurrency = requireMcpContext().userMetadata.baseCurrency;
  }

  // Each section is computed only when requested so that lean calls
  // (e.g. include: ["dates"]) skip the heavy work — extractBudgetFromPriceHistory,
  // getMissingFields, and the per-period priceHistory map were the offenders
  // running on every call regardless of include.
  if (requested.has('dates')) {
    projected.dates = {
      currentTermStart: c.term_start_date?.[0]?.date ?? null,
      currentTermEnd,
      cancelByDate,
      daysUntilTermEnd: daysUntil(currentTermEnd),
      daysUntilCancelBy: daysUntil(cancelByDate),
      // The single deadline the user has to act on, plus a label so the
      // agent narrates with the right anchor (e.g. "your cancel-by date is
      // X (N days away)" rather than inventing "term ends X — 1 day").
      actionDate,
      actionDateLabel,
      daysUntilAction: daysUntil(actionDate),
    };
  }

  if (requested.has('renewal')) {
    projected.renewal = {
      type: c.renewal_type ?? null,
      period: c.renewal_period ?? null,
      autoRenewal,
      multiYear: c.multi_year ?? null,
      subscriptionTerm: c.subscription_term ?? null,
      annualIncrease: c.annual_increase ?? null,
      annualIncreaseMonths: c.annual_increase_months ?? null,
    };
  }

  if (requested.has('spend')) {
    const budget = ph ? extractBudgetFromPriceHistory(ph) : null;
    // null spend fields mean priceHistory was unavailable — distinct from 0/yr.
    projected.spend = {
      // The contract's own (source) currency — null when the document's
      // currency is unknown; *Base figures are denominated in the response's
      // top-level baseCurrency.
      contractCurrency: c.currency?.toUpperCase() ?? null,
      currentAnnualBase:
        budget?.effectiveCurrentUSD ?? budget?.currentUSD ?? null,
      projectedAnnualBase:
        budget?.effectiveProjectedUSD ?? budget?.projectedUSD ?? null,
      projectedAnnualDifferenceBase: budget?.annualDifference ?? null,
      totalContractValueBase: getUSDValue(target, 'totalContractValue'),
    };
  }

  if (requested.has('products')) {
    projected.products = target.products.map((p) => ({
      productId: p.product_id,
      name: p.name,
      currency: p.currency,
      currentFee: p.currentFee,
      currentFeeBase: p.currentFeeUSD,
      effectiveFeeBase: p.effectiveFeeUSD,
      isSuperseded: p.isSuperseded,
      // Cancelled by a confirmed lineage event (PSK-1830) — struck like a
      // superseded product but with no amendment fee merge.
      isCancelled: p.isCancelled === true,
      // Books once in its recorded year; excluded from renewal projections
      // (psk-1492).
      oneTimeOnly: p.one_time_only === true,
    }));
  }

  // activeUsers and seats.isOverAssigned both need the active user count, so
  // materialize once outside the if-blocks rather than twice.
  // Two distinct concepts kept separate so seats and people are not conflated:
  //   activeUsers (assigned) = rows in contract_users (real people on the contract)
  //   seats.totalLicensed    = number_of_users on vendor_products_users (contractual cap)
  //
  // resolveContractUsers issues a fresh, org-scoped query that joins
  // org_employees — the bulk getContractsList payload carries only the inline
  // contract_users snapshot, which goes stale relative to the canonical
  // master record when HR fields are edited org-wide.
  const activeUsers =
    requested.has('activeUsers') || requested.has('seats')
      ? await resolveContractUsers(target.id)
      : null;

  if (requested.has('activeUsers') && activeUsers) {
    projected.activeUsers = {
      count: activeUsers.length,
      list: activeUsers,
    };
  }

  if (requested.has('seats')) {
    const seatAllocations = (c.vendor_products_users ?? []) as Array<{
      product_id: number;
      number_of_users?: number | null;
      enterprise?: boolean;
    }>;
    const totalLicensedSeats = seatAllocations.reduce(
      (s, u) => s + (u.number_of_users ?? 0),
      0,
    );
    const activeCount = activeUsers?.length ?? 0;
    projected.seats = {
      totalLicensed: totalLicensedSeats,
      perProduct: seatAllocations,
      isOverAssigned:
        activeCount > totalLicensedSeats && totalLicensedSeats > 0,
    };
  }

  if (requested.has('ownership')) {
    const owners = contractOwners(c);
    const sponsorNames = ownerSponsorNames(owners);
    projected.ownership = {
      businessGroups: ownerGroupNames(owners),
      businessSponsor: sponsorNames.length > 0 ? sponsorNames : null,
    };
  }

  if (requested.has('paymentTerms')) {
    projected.paymentTerms = c.payment_terms ?? null;
  }

  if (requested.has('cancellationProcess')) {
    projected.cancellationProcess = c.cancellation_process ?? null;
  }

  if (requested.has('aiSummary')) {
    projected.aiSummary = c.summary ?? null;
  }

  if (requested.has('keyClauses')) {
    projected.keyClauses = {
      service_level_agreements: c.service_level_agreements ?? null,
      audit_requirements: c.audit_requirements ?? null,
      data_disposal_tnc: c.data_disposal_tnc ?? null,
      security_awareness: c.security_awareness ?? null,
      market_data_types: c.market_data_types ?? null,
      ai_training_restrictions: c.ai_training_restrictions ?? null,
    };
  }

  if (requested.has('missingClauses')) {
    // requireMcpContext is only needed to look up the org's missing-clause
    // settings — pulling it eagerly meant every dates-only call paid for a
    // user-metadata lookup it discarded.
    const ctx = requireMcpContext();
    projected.missingClauses = getMissingFields(
      c,
      ctx.userMetadata.organizationMissingClauseSettings?.settings ?? null,
    );
  }

  if (requested.has('priceHistory')) {
    projected.priceHistory =
      ph?.periods?.map(
        (p: {
          startDate?: string;
          endDate?: string;
          isCurrentTerm?: boolean;
          totalFeesUSD?: number;
          annualizedFeesUSD?: number;
        }) => ({
          startDate: p.startDate,
          endDate: p.endDate,
          isCurrentTerm: Boolean(p.isCurrentTerm),
          totalFeesBase: p.totalFeesUSD ?? null,
          annualizedFeesBase: p.annualizedFeesUSD ?? null,
        }),
      ) ?? [];
  }

  // Only attach the narration rule when date fields are actually in scope —
  // otherwise it's noise on a clauses-only or seats-only call.
  if (requested.has('dates') || requested.has('renewal')) {
    projected.dateGuidance = DATE_GUIDANCE;
  }
  return projected;
}

export const renewalsTools: McpToolDef[] = [
  {
    name: 'get_upcoming_renewals',
    description:
      'List active contracts whose action date falls within N days, sorted by urgency — the right tool for "what should I act on" questions and for vendor-scoped queries like "what is renewing for Bloomberg?" (pass vendor_id; contracts not renewing within the window are correctly omitted). ' +
      'Each row has currentTermEnd (term_end_date[0] = the actual end of the current contracted term, not a per-year checkpoint), cancelByDate, and actionDate + actionDateLabel. ' +
      'actionDate is the cancel-by date when auto_renewal=true (that is the deadline that drives the decision); otherwise it is the sooner of cancel-by or term-end. ' +
      'multiYear + subscriptionTerm are returned so commitment length comes from those fields rather than being inferred from dates. ' +
      "Spend figures (fields suffixed `Base`) are denominated in the organization's base display currency — see the response `baseCurrency`, and format amounts with that currency, never assuming USD. " +
      'The response carries a dateGuidance field describing how dates should be quoted. Paginated.',
    inputSchema: upcomingInput,
    annotations: {
      title: 'Upcoming renewals',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getUpcomingRenewals as McpToolDef['handler'],
  },
  {
    name: 'get_renewal_summary',
    description:
      'Renewal-decision brief for a single contract by id: cancel-by deadlines, auto-renew status, what happens at term end, should-we-renew, price changes at renewal. Sibling get_contract returns the general overview; this one is scoped to renewal timing and decisions. For vendor-scoped questions ("what is renewing for X?") call get_upcoming_renewals(vendor_id) first to get the candidate list, then call this for the deep dive on a specific contract. ' +
      'Includes term dates (currentTermStart / currentTermEnd from term_*_date[0] = the current contracted term, plus cancel-by and a single actionDate + actionDateLabel anchor), renewal terms (auto/multi-year/subscriptionTerm/annual increase), products with current and projected fees, price-change deltas, active users (real people on the contract with HR metadata — cost center, country, region, division, department, employee id, group, dates — merged from org_employees when linked, else from the inline contract_users snapshot; see list_contract_users for the same payload as a dedicated tool), seat allocation (contractual cap from vendor_products_users — kept separate from active users so seats and people are not conflated), business owner/group, missing clauses (clauses the org expects to see that are absent from this contract — surface as items to negotiate in at renewal), and price history. ' +
      "Converted fee figures (fields suffixed `Base`) are denominated in the organization's base display currency — see the response `baseCurrency`, and format amounts with that currency, never assuming USD; per-product currentFee/currency carry the native pair. " +
      'The response carries a dateGuidance field when date or renewal sections are in scope.',
    inputSchema: summaryInput,
    annotations: {
      title: 'Renewal summary',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getRenewalSummary as McpToolDef['handler'],
  },
];
