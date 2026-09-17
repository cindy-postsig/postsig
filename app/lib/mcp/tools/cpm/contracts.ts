import { z } from 'zod';
import {
  getContractsList,
  getArchivedContracts,
  getContract,
  filterForAggregation,
  type EnrichedContract,
} from '@/lib/v2';
import {
  contractOwners,
  ownerGroupNames,
  ownerSponsorNames,
} from '@/lib/v2/owners/embed';
import { getUSDValue } from '@/lib/v2/core/budget';
import { filterExcludeInvoices } from '@/lib/v2/core/filters';
import { hasInvoicesAccess } from '@/lib/v2/invoices/access';
import { extractBudgetFromPriceHistory } from '@/app/lib/budget';
import { requireMcpContext, requireScope } from '@/app/lib/mcp/context';
import { assertSameOrg } from '@/app/lib/mcp/guards';
import { updateContractFromMcp } from '@/app/lib/mcp/update-contract';
import { NotFoundToolError, ValidationToolError } from '@/app/lib/mcp/errors';
import { paginate, paginationSchema } from '@/app/lib/mcp/pagination';
import {
  contractTypes as contractTypeAbbrevToId,
  isInvoiceType,
  reverseContractTypeMap,
} from '@/app/lib/constants';
import { normalizeOrderNumber } from '@/lib/v2/contracts/orderNumber';
import type { McpToolContext, McpToolDef } from '@/app/lib/mcp/tools/types';

const getContractOrgId = (c: EnrichedContract): string | null | undefined =>
  c.contract?.organization_id;

// Converted monetary fields (suffixed `Base`) are denominated in the org's
// base display currency — engine stamps and price-history conversion already
// target it (PSK-1796). Responses carry the code so consumers never assume USD.
const orgBaseCurrency = (): string =>
  requireMcpContext().userMetadata.baseCurrency;

// 'all' here means published + archived; getContractsList's 'all' also
// surfaces internal workflow statuses, which must not reach the assistant.
// Invoices are billing records, not contracts, so they stay out of every
// list unless the caller asks for them and the org's Invoices module is on —
// callers pass that combined verdict as includeInvoices.
async function getPublishedAndArchivedContracts(
  status?: 'active' | 'all',
  includeInvoices = false,
): Promise<EnrichedContract[]> {
  const { contracts } = await getContractsList();
  const archived =
    status === 'all' ? (await getArchivedContracts()).contracts : [];
  const combined = [...contracts, ...archived];
  return includeInvoices ? combined : filterExcludeInvoices(combined);
}

/**
 * Pull unique product names from the enriched products, ordered by sort_order,
 * dropping superseded entries. Mirrors vendors.ts so a list_contracts /
 * query_contracts row identifies what each contract covers without a
 * follow-up fan-out.
 */
function productNamesFromContract(c: EnrichedContract): string[] {
  const sorted = [...c.products].sort((a, b) => {
    const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });
  const names = sorted
    // The struck set: superseded by an amendment OR cancelled by a confirmed
    // lineage event (PSK-1830) — neither is a live licensed product.
    .filter((p) => !p.isSuperseded && p.isCancelled !== true)
    .map((p) => p.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);
  return Array.from(new Set(names));
}

/**
 * Why a contract qualifies as having a price escalator. "annual_increase"
 * means the structured annual_increase column is set and non-zero;
 * "renewal_step_up" means the projected next-period annual spend is higher
 * than the current annual spend (a step-up at renewal even when the
 * structured column isn't filled in); "both" means both are true.
 */
type PriceEscalatorReason = 'annual_increase' | 'renewal_step_up' | 'both';

interface ContractSummary {
  id: number;
  /**
   * `domain` is surfaced so the UI can render the vendor-icon + name lockup
   * without a follow-up get_vendor call. Null when we don't have a domain on
   * file for the vendor.
   */
  vendor: { id: number | null; name: string; domain: string | null };
  status: string;
  /** Full contract type name, e.g. "Master Services Agreement". */
  contractType: string | null;
  /**
   * In-app abbreviation for the type, e.g. "MSA" / "NDA" / "SO" / "TOS".
   * Null when the type has no abbreviation registered in app/lib/constants.
   */
  contractTypeAbbreviation: string | null;
  /**
   * Document-extracted contract/order/invoice number
   * (metadata.lineage.order_number) — the number printed on the source
   * document, NOT the internal contract id. Null when extraction found none.
   */
  orderNumber: string | null;
  termStart: string | null;
  termEnd: string | null;
  cancelByDate: string | null;
  uploadedAt: string | null;
  /**
   * The contract's own (source) currency code — the denomination the document
   * was written in, NOT the denomination of the `*Base` figures below.
   */
  currency: string;
  /** Denominated in the org's base display currency (response `baseCurrency`). */
  totalContractValueBase: number;
  /** null when priceHistory is unavailable — distinct from 0/yr. */
  currentAnnualSpendBase: number | null;
  /** Annual spend at the next renewal price. null when not derivable. */
  projectedAnnualSpendBase: number | null;
  /** projectedAnnualSpendBase - currentAnnualSpendBase. null when either is null. */
  projectedAnnualSpendDeltaBase: number | null;
  annualIncrease: number | null;
  discount: number | null;
  /**
   * Non-null when the contract has a price escalator. See PriceEscalatorReason.
   * Use this to group narration into the two natural buckets when answering
   * "which vendors have price escalators?".
   */
  priceEscalatorReason: PriceEscalatorReason | null;
  businessGroup: string | null;
  businessSponsor: unknown | null;
  /**
   * Active product names on this contract, deduped, in sort order. Superseded
   * products are dropped. Surfaced so an agent can pick the right contract by
   * product without a follow-up get_contract / get_vendor fanout — matches
   * what get_vendor already returns per contract.
   */
  products: string[];
  assetClasses: string[];
  tags: Array<{ id: number; name: string }>;
  renewalType: string | null;
  renewalPeriod: number | null;
  autoRenewal: boolean | null;
  willNotRenew: boolean | null;
  multiYear: boolean | null;
  docFullyExecuted: boolean | null;
  isSuperseded: boolean;
  isSuperseding: boolean;
  /**
   * True for invoice contracts (type_id 6) linked to a parent contract.
   * Their spend is already rolled into the parent in org-wide totals, so
   * summing rows naively will over-count. Agents should narrate this when
   * showing a vendor with both a master contract and linked invoices.
   */
  isLinkedChildInvoice: boolean;
}

function extractedOrderNumber(
  contractRecord:
    | { metadata?: { lineage?: { order_number?: unknown } } | null }
    | null
    | undefined,
): string | null {
  const raw = contractRecord?.metadata?.lineage?.order_number;
  return raw !== null && raw !== undefined ? String(raw) : null;
}

// Shared by the asset_class filter and the assetClasses summary field so the
// two can't drift apart.
function assetClassNames(enriched: EnrichedContract): string[] {
  const raw = (enriched.contract.contract_asset_classes ?? []) as Array<{
    asset_classes?: { name?: string } | null;
  }>;
  return raw
    .map((ac) => ac.asset_classes?.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);
}

function summarizeContract(enriched: EnrichedContract): ContractSummary {
  const c = enriched.contract;
  const ph = enriched.priceHistory;
  const budget = ph ? extractBudgetFromPriceHistory(ph) : null;

  const tagsRaw = (c.contract_tags ?? []) as Array<{
    tag_id: number;
    user_tags?: { name?: string } | null;
  }>;
  const tags = tagsRaw
    .map((t) => ({ id: t.tag_id, name: t.user_tags?.name ?? '' }))
    .filter((t) => t.name);

  const owners = contractOwners(c);
  const businessGroups = ownerGroupNames(owners);
  const sponsorNames = ownerSponsorNames(owners);

  const contractTypes = c.contract_types as
    | { id?: number | null; name?: string | null }
    | null
    | undefined;
  const contractTypeId = contractTypes?.id ?? c.type_id ?? null;
  const contractType = contractTypes?.name ?? null;
  const contractTypeAbbreviation =
    contractTypeId !== null
      ? (reverseContractTypeMap[contractTypeId] ?? null)
      : null;

  // effectiveCurrentUSD/currentUSD are legacy field names — since PSK-1796
  // they hold values converted to the org's base display currency.
  const currentAnnualSpendBase =
    budget?.effectiveCurrentUSD ?? budget?.currentUSD ?? null;
  const projectedAnnualSpendBase =
    budget?.effectiveProjectedUSD ?? budget?.projectedUSD ?? null;
  const projectedAnnualSpendDeltaBase =
    currentAnnualSpendBase !== null && projectedAnnualSpendBase !== null
      ? projectedAnnualSpendBase - currentAnnualSpendBase
      : null;

  // A contract qualifies as having an "escalator" if either the structured
  // annual_increase is set OR the next-period projected spend is higher
  // than current. Tracking both reasons lets the agent split narration
  // into the two buckets the user expects.
  const annualIncrease = c.annual_increase ?? null;
  const hasStructuredIncrease = (annualIncrease ?? 0) > 0;
  const hasRenewalStepUp = (projectedAnnualSpendDeltaBase ?? 0) > 0;
  let priceEscalatorReason: PriceEscalatorReason | null = null;
  if (hasStructuredIncrease && hasRenewalStepUp) {
    priceEscalatorReason = 'both';
  } else if (hasStructuredIncrease) {
    priceEscalatorReason = 'annual_increase';
  } else if (hasRenewalStepUp) {
    priceEscalatorReason = 'renewal_step_up';
  }

  return {
    id: enriched.id,
    vendor: {
      id: enriched.vendor_id,
      name: enriched.vendor_name,
      domain: enriched.vendor_domain ?? null,
    },
    status: c.status ?? 'unknown',
    contractType,
    contractTypeAbbreviation,
    orderNumber: extractedOrderNumber(c),
    termStart: c.term_start_date?.[0]?.date ?? null,
    termEnd: c.term_end_date?.[0]?.date ?? null,
    cancelByDate: c.cancel_date?.[0]?.date ?? null,
    uploadedAt: c.created_at ?? null,
    currency: (c.currency ?? 'USD').toUpperCase(),
    totalContractValueBase: getUSDValue(enriched, 'totalContractValue'),
    currentAnnualSpendBase,
    projectedAnnualSpendBase,
    projectedAnnualSpendDeltaBase,
    annualIncrease,
    discount: c.discount ?? null,
    priceEscalatorReason,
    businessGroup: businessGroups.join(', ') || null,
    businessSponsor: sponsorNames.length > 0 ? sponsorNames : null,
    products: productNamesFromContract(enriched),
    assetClasses: assetClassNames(enriched),
    tags,
    renewalType: c.renewal_type ?? null,
    renewalPeriod: c.renewal_period ?? null,
    autoRenewal: c.auto_renewal ?? null,
    willNotRenew: c.will_not_renew ?? null,
    multiYear: c.multi_year ?? null,
    docFullyExecuted: c.doc_fully_executed ?? null,
    isSuperseded: Boolean(enriched.isFullySuperseded),
    isSuperseding: enriched.products.some((p) => p.isSuperseding),
    isLinkedChildInvoice: Boolean(enriched.isLinkedChildInvoice),
  };
}

// Projected shape for list/query responses. Strips detailed financial figures
// to reduce bulk-extraction value. Of these, get_contract still exposes
// `discount` (commercial section) and `annualIncrease` (renewal section) for a
// targeted single-contract lookup; the derived projected-spend figures are
// intentionally list-only and not re-exposed anywhere. currentAnnualSpendBase
// and priceEscalatorReason are kept so ordering and escalator filters still work.
export function toListRow(s: ContractSummary) {
  const {
    projectedAnnualSpendBase: _p,
    projectedAnnualSpendDeltaBase: _d,
    annualIncrease: _a,
    discount: _disc,
    ...rest
  } = s;
  return rest;
}

const listInput = z.object({
  status: z
    .enum(['active', 'all'])
    .optional()
    .describe('active (default) or all (includes archived)'),
  vendor_id: z
    .number()
    .int()
    .optional()
    .describe(
      'Filter to contracts owned by this vendor id (from list_vendors).',
    ),
  business_group: z
    .string()
    .optional()
    .describe(
      'Filter to contracts in this business group. Exact match, case-insensitive — pass the full group name.',
    ),
  ...paginationSchema,
});

async function listContracts(input: z.infer<typeof listInput>) {
  const contracts = await getPublishedAndArchivedContracts(input.status);
  assertSameOrg(contracts, 'list_contracts', getContractOrgId);
  let filtered = contracts;
  if (input.vendor_id !== undefined) {
    filtered = filtered.filter((c) => c.vendor_id === input.vendor_id);
  }
  if (input.business_group) {
    const target = input.business_group.toLowerCase();
    filtered = filtered.filter((c) =>
      ownerGroupNames(contractOwners(c.contract)).some(
        (name) => name.toLowerCase() === target,
      ),
    );
  }
  const page = paginate(filtered, input);
  return {
    count: page.items.length,
    totalMatched: page.totalAvailable,
    nextCursor: page.nextCursor,
    baseCurrency: orgBaseCurrency(),
    contracts: page.items.map((c) => toListRow(summarizeContract(c))),
  };
}

const CONTRACT_SECTIONS = [
  'summary',
  'dates',
  'renewal',
  'commercial',
  'legal',
  'signature',
  'ownership',
  'nda_fields',
  'tags',
] as const;

export const MAX_CONTRACT_SECTIONS_PER_CALL = 4;
export const DEFAULT_CONTRACT_SECTIONS = ['summary', 'dates'] as const;

export const getContractInputSchema = z.object({
  id: z
    .number()
    .int()
    .optional()
    .describe(
      'Contract id (from list_contracts / query_contracts results). Provide id OR order_number.',
    ),
  order_number: z
    .string()
    .optional()
    .describe(
      'Document-extracted contract/order/invoice number — NOT the internal contract id. Use when the user cites a number from the document, e.g. "get me contract number 202.205-23". Matching ignores punctuation and case, so "202.205-23" finds a stored "20220523". When several contracts share the number, the response lists candidates to disambiguate instead of returning one contract.',
    ),
  include: z
    .array(z.enum(CONTRACT_SECTIONS))
    .max(MAX_CONTRACT_SECTIONS_PER_CALL)
    .optional()
    .describe(
      `Which sections to include. Defaults to ["summary","dates"]. Max ${MAX_CONTRACT_SECTIONS_PER_CALL} sections per call — request different subsets across calls to retrieve the full record. ` +
        '"dates"+"renewal" for renewal context, "legal" for clause review, "commercial" for billing/payment terms, etc. ' +
        `Available sections: ${CONTRACT_SECTIONS.join(', ')}. ` +
        'id, contract_name, vendor, status, contract_type, order_number (the document-extracted contract/invoice number), and currency are always returned.',
    ),
});

async function getContractTool(input: z.infer<typeof getContractInputSchema>) {
  let contractId = input.id ?? null;
  if (contractId === null) {
    if (!input.order_number) {
      throw new ValidationToolError('Provide id or order_number.');
    }
    const target = normalizeOrderNumber(input.order_number);
    if (!target) {
      throw new ValidationToolError(
        'order_number must contain letters or digits.',
      );
    }
    // A document number names one specific document, invoice or not, so the
    // lookup keeps invoices in scope whenever the org can see them at all.
    const contracts = await getPublishedAndArchivedContracts(
      'all',
      await hasInvoicesAccess(),
    );
    assertSameOrg(contracts, 'get_contract', getContractOrgId);
    const numbered = contracts
      .map((c) => ({ c, orderNumber: extractedOrderNumber(c.contract) }))
      .filter(
        (x): x is { c: EnrichedContract; orderNumber: string } =>
          x.orderNumber !== null,
      );
    let matches = numbered.filter(
      (x) => normalizeOrderNumber(x.orderNumber) === target,
    );
    if (matches.length === 0) {
      matches = numbered.filter((x) =>
        normalizeOrderNumber(x.orderNumber).includes(target),
      );
    }
    if (matches.length === 0) return { found: false as const };
    if (matches.length > 1) {
      return {
        found: false as const,
        reason: 'ambiguous_order_number' as const,
        requestedOrderNumber: input.order_number,
        note:
          `Multiple contracts carry order number "${input.order_number}" — often one document family (a master plus its amendments/service orders). ` +
          'When asking the user which they meant, quote the number exactly as the user typed it (stored punctuation may differ), and show each candidate with its orderNumber, vendor, contract type, and id so they can confirm.',
        baseCurrency: orgBaseCurrency(),
        candidates: matches.map((x) => toListRow(summarizeContract(x.c))),
      };
    }
    contractId = matches[0].c.id;
  }

  const contract = await getContract(contractId);
  if (!contract) return { found: false as const };
  assertSameOrg([contract], 'get_contract', (c) => c?.organization_id);
  const owners = contractOwners(contract);
  const sponsorNames = ownerSponsorNames(owners);

  const legalRaw: Record<string, unknown> = {
    scope_of_use: contract.scope_of_use ?? null,
    permissions: contract.permissions ?? null,
    activities: contract.activities ?? null,
    end_users: contract.end_users ?? null,
    internal_external_users: contract.internal_external_users ?? null,
    exclusivity_terms: contract.exclusivity_terms ?? null,
    distribution_rights: contract.distribution_rights ?? null,
    derivative_works: contract.derivative_works ?? null,
    marketing_rights: contract.marketing_rights ?? null,
    geo_restrictions: contract.geo_restrictions ?? null,
    market_data_types: contract.market_data_types ?? null,
    audit_requirements: contract.audit_requirements ?? null,
    security_awareness: contract.security_awareness ?? null,
    data_disposal_tnc: contract.data_disposal_tnc ?? null,
    ai_training_restrictions: contract.ai_training_restrictions ?? null,
    service_level_agreements: contract.service_level_agreements ?? null,
    suspension_of_service: contract.suspension_of_service ?? null,
    arbitration_and_conflict_resolution:
      contract.arbitration_and_conflict_resolution ?? null,
    cancellation_process: contract.cancellation_process ?? null,
    cost_mitigation: contract.cost_mitigation ?? null,
    amended_clauses: contract.other_attributes?.amended_clauses ?? null,
  };
  const legal = Object.fromEntries(
    Object.entries(legalRaw).filter(([, v]) => v !== null && v !== undefined),
  );

  const sections = {
    summary: contract.summary ?? null,
    dates: {
      term_start: contract.term_start_date?.[0]?.date ?? null,
      term_end: contract.term_end_date?.[0]?.date ?? null,
      cancel_by: contract.cancel_date?.[0]?.date ?? null,
      execution_date: contract.execution_date ?? null,
      date_of_last_signature: contract.date_of_last_signature ?? null,
    },
    renewal: {
      renewal_type: contract.renewal_type ?? null,
      renewal_period: contract.renewal_period ?? null,
      auto_renewal: contract.auto_renewal ?? null,
      will_not_renew: contract.will_not_renew ?? null,
      // Keeps the documented `will_not_renew_meta.updated_at` path connector
      // clients already read, minus `updated_by` — the auth user id of whoever
      // set the flag, an internal identifier of no use to a client.
      will_not_renew_meta: contract.will_not_renew_meta?.updated_at
        ? { updated_at: contract.will_not_renew_meta.updated_at }
        : null,
      annual_increase: contract.annual_increase ?? null,
      annual_increase_months: contract.annual_increase_months ?? null,
    },
    commercial: {
      billing_frequency: contract.billing_frequency ?? null,
      payment_terms: contract.payment_terms ?? null,
      discount: contract.discount ?? null,
      multi_year: contract.multi_year ?? null,
      subscription_term: contract.subscription_term ?? null,
      cpi:
        contract.other_attributes?.increase?.cpi ??
        contract.other_attributes?.cpi ??
        null,
    },
    legal,
    signature: {
      doc_fully_executed: contract.doc_fully_executed ?? null,
      all_parties_signed: contract.all_parties_signed ?? null,
      required_signature_count: contract.required_signature_count ?? null,
    },
    ownership: {
      business_group: ownerGroupNames(owners).join(', ') || null,
      business_sponsor: sponsorNames.length > 0 ? sponsorNames : null,
      business_justification: contract.business_justification ?? null,
    },
    nda_fields: contract.other_attributes?.nda_fields ?? null,
    tags: (contract.contract_tags ?? [])
      .map((t: { tag_id: number; user_tags?: { name?: string } | null }) => ({
        id: t.tag_id,
        name: t.user_tags?.name,
      }))
      .filter((t: { name?: string }) => t.name),
  };

  const identity = {
    id: contract.id,
    vendor: {
      id: contract.vendor_id ?? null,
      name: contract.vendor?.name ?? null,
      domain: contract.vendor_domain ?? null,
      location: contract.vendor_location ?? null,
    },
    status: contract.status ?? null,
    contract_type: contract.contract_types?.name ?? null,
    order_number: extractedOrderNumber(contract),
    currency: contract.currency ?? null,
  };

  const requested = input.include ?? DEFAULT_CONTRACT_SECTIONS;
  const projected: Record<string, unknown> = { ...identity };
  for (const key of requested) {
    projected[key] = sections[key];
  }

  return { found: true as const, contract: projected };
}

const CLAUSE_FIELDS = [
  'scope_of_use',
  'permissions',
  'activities',
  'end_users',
  'internal_external_users',
  'exclusivity_terms',
  'distribution_rights',
  'derivative_works',
  'marketing_rights',
  'geo_restrictions',
  'market_data_types',
  'audit_requirements',
  'security_awareness',
  'data_disposal_tnc',
  'ai_training_restrictions',
  'service_level_agreements',
  'suspension_of_service',
  'arbitration_and_conflict_resolution',
  'cancellation_process',
  'cost_mitigation',
] as const;

const queryInput = z.object({
  vendor_id: z
    .number()
    .int()
    .optional()
    .describe('Filter to a single vendor id (from list_vendors).'),
  vendor_name_contains: z
    .string()
    .optional()
    .describe(
      'Match contracts whose vendor name contains this string (case-insensitive). Use when the user names a vendor without an id.',
    ),
  order_number_contains: z
    .string()
    .optional()
    .describe(
      'Match contracts whose document-extracted contract/order/invoice number contains this string (case-insensitive). This is the number printed on the source document — NOT the internal contract id. Use when the user supplies a contract number or invoice number, e.g. "find contract 00768208" / "pull up invoice INV-2024-001".',
    ),
  status: z
    .enum(['active', 'all'])
    .optional()
    .describe('active (default) or all (includes archived).'),
  business_group: z
    .string()
    .optional()
    .describe(
      'Filter to contracts in this business group. Exact match, case-insensitive — pass the full group name.',
    ),
  tag_id: z
    .number()
    .int()
    .optional()
    .describe('Filter to contracts carrying this tag id (from list_tags).'),
  tag_name: z
    .string()
    .optional()
    .describe(
      'Match contracts whose tag names contain this string (case-insensitive). Use when the user names a tag rather than knowing its id.',
    ),
  untagged: z
    .boolean()
    .optional()
    .describe(
      'When true, return only contracts that carry NO tags. The canonical filter for "which contracts are untagged / have no tags?". Combining with tag_id/tag_name is contradictory and naturally yields no rows.',
    ),
  asset_class: z
    .string()
    .optional()
    .describe(
      'Match contracts whose asset-class name contains this string (case-insensitive), e.g. "ESG", "Equity", "Fixed Income".',
    ),
  has_discount: z
    .boolean()
    .optional()
    .describe(
      'When true, return only contracts that have a discount (the structured discount column is set and greater than zero).',
    ),
  contract_type: z
    .string()
    .optional()
    .describe(
      'Filter by contract type. Accepts either the full name (e.g. "Master Services Agreement") OR the in-app abbreviation (e.g. "MSA", "NDA", "SO", "TOS", "Invoice", "Trial", "Addendum"). Case-insensitive. ' +
        'See the cpm://reference/contract-types resource for the full catalog. ' +
        'The right filter when the user names a type; get_contract fetches one already-known contract by id, not a type-scoped list.',
    ),
  include_invoices: z
    .boolean()
    .optional()
    .describe(
      'Invoices are billing records, not contracts, and are excluded by default. Pass true only when the user explicitly asks for invoices alongside contracts; contract_type:"Invoice" also returns them. An organization with the Invoices module disabled never returns invoices, whatever is passed here.',
    ),
  renewal_type: z
    .enum(['Auto', 'Manual', 'One-Time'])
    .optional()
    .describe(
      'Exact match on the renewal_type column. "One-Time" contracts do not renew — exclude them when answering "what is renewing?" questions.',
    ),
  auto_renewal: z
    .boolean()
    .optional()
    .describe('Filter on the auto_renewal flag.'),
  will_not_renew: z
    .boolean()
    .optional()
    .describe(
      'Filter on the will_not_renew flag — true returns contracts the user has marked as not renewing.',
    ),
  multi_year: z.boolean().optional().describe('Filter on the multi_year flag.'),
  doc_fully_executed: z
    .boolean()
    .optional()
    .describe(
      'Filter on the doc_fully_executed flag — true returns contracts marked as fully signed.',
    ),
  has_price_escalator: z
    .boolean()
    .optional()
    .describe(
      'CANONICAL filter for "which contracts/vendors have price escalators?". ' +
        'When true, returns contracts that EITHER have a structured annual_increase set and non-zero ' +
        'OR whose projected next-period annual spend is higher than current annual spend (a step-up at renewal). ' +
        'Each row is tagged with priceEscalatorReason ("annual_increase" / "renewal_step_up" / "both") so you can ' +
        'group narration into those two buckets. Independent of renewal type — auto_renewal is a separate axis; combine the two only when the user specifically asks for auto-renew escalators. ' +
        'Bonus pass for clause-text-only escalators: also call search_contract_clauses, e.g. ' +
        'clause_contains: { field: "cost_mitigation", value: "increase" } (or "CPI", "escalator").',
    ),
  has_annual_increase: z
    .boolean()
    .optional()
    .describe(
      'Stricter filter — only contracts whose structured annual_increase column is set and non-zero. ' +
        'For the general "which contracts have escalators?" question prefer has_price_escalator, which ' +
        'also catches renewal step-ups where the column is null but projected > current.',
    ),
  has_renewal_step_up: z
    .boolean()
    .optional()
    .describe(
      'Stricter filter — only contracts where projected next-period annual spend is higher than current. ' +
        'For the general "which contracts have escalators?" question prefer has_price_escalator.',
    ),
  min_annual_increase: z
    .number()
    .optional()
    .describe('Decimal (e.g. 0.05 for 5%); returns contracts at or above this'),
  term_end_after: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)')
    .optional()
    .describe('ISO date — return contracts whose term end is on or after this'),
  term_end_before: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)')
    .optional()
    .describe(
      'ISO date — return contracts whose term end is on or before this',
    ),
  term_start_after: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)')
    .optional()
    .describe(
      'ISO date — return contracts whose current term start is on or after this',
    ),
  term_start_before: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)')
    .optional()
    .describe(
      'ISO date — return contracts whose current term start is on or before this',
    ),
  cancel_by_after: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)')
    .optional()
    .describe(
      'ISO date — return contracts whose cancel-by date is on or after this',
    ),
  cancel_by_before: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)')
    .optional()
    .describe(
      'ISO date — return contracts whose cancel-by date is on or before this',
    ),
  uploaded_after: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)')
    .optional()
    .describe(
      'ISO date — return contracts uploaded/created on or after this. Use for "recently uploaded / added" questions.',
    ),
  sort_by: z
    .enum(['term_end', 'term_start', 'cancel_by'])
    .optional()
    .describe(
      'Sort the result chronologically by the chosen date. ' +
        'Useful for calendar-style listings ("show me everything happening between X and Y, sorted by date").',
    ),
  aggregation_mode: z
    .enum(['all', 'rollup'])
    .optional()
    .default('all')
    .describe(
      'Default "all" — every matching contract row including fully-superseded amendments and any linked-child invoices in scope (use for introspection / per-contract Q&A). ' +
        'Pass "rollup" to drop those (matches what list_vendors and get_spend do internally) when you intend to SUM the row-level base-currency figures — otherwise per-row sums will over-count.',
    ),
  min_annual_spend: z
    .number()
    .optional()
    .describe(
      "Return contracts whose current annual spend (in the organization's base display currency) is at or above this value. Contracts with unknown spend (no priceHistory) are excluded — null is not 0.",
    ),
  max_annual_spend: z
    .number()
    .optional()
    .describe(
      "Return contracts whose current annual spend (in the organization's base display currency) is at or below this value. Contracts with unknown spend are excluded.",
    ),
  ...paginationSchema,
});

async function queryContracts(input: z.infer<typeof queryInput>) {
  const orderNumberTarget =
    input.order_number_contains !== undefined
      ? normalizeOrderNumber(input.order_number_contains)
      : null;
  if (orderNumberTarget === '') {
    throw new ValidationToolError(
      'order_number_contains must contain letters or digits.',
    );
  }

  // Resolve contract_type once before the loop. Accepts either an
  // abbreviation (matched against app/lib/constants — "MSA" → 1, "NDA" → 8,
  // …) or the full name (matched against contract_types.name). Unknown
  // strings fall through to the name comparison below — no error, no
  // surprise empty set.
  const requestedTypeLower = input.contract_type?.trim().toLowerCase();
  let resolvedTypeId: number | null = null;
  if (requestedTypeLower) {
    for (const [abbrev, id] of Object.entries(contractTypeAbbrevToId)) {
      if (abbrev.toLowerCase() === requestedTypeLower) {
        resolvedTypeId = id as number;
        break;
      }
    }
  }

  // A contract_type opts in when it is an invoice type — or, unresolved to an
  // id, might be one (a full name like "Exchange Agreement Invoice" only
  // matches on the name path below). "MSA" must not pull invoices in just to
  // filter them out. The org's Invoices module toggle has the final say.
  const typeFilterMayTargetInvoices =
    Boolean(requestedTypeLower) &&
    (resolvedTypeId === null || isInvoiceType(resolvedTypeId));
  const includeInvoices =
    (input.include_invoices === true || typeFilterMayTargetInvoices) &&
    (await hasInvoicesAccess());
  const contracts = await getPublishedAndArchivedContracts(
    input.status,
    includeInvoices,
  );
  assertSameOrg(contracts, 'query_contracts', getContractOrgId);

  // summarizeContract does currency conversion + budget extraction per row;
  // memoize so filter/sort/map share one result per contract instead of
  // recomputing 3–5 times.
  const summaryCache = new Map<EnrichedContract, ContractSummary>();
  const summaryFor = (c: EnrichedContract): ContractSummary => {
    let s = summaryCache.get(c);
    if (!s) {
      s = summarizeContract(c);
      summaryCache.set(c, s);
    }
    return s;
  };

  const matched = contracts.filter((c) => {
    const summary = summaryFor(c);
    if (input.vendor_id !== undefined && c.vendor_id !== input.vendor_id) {
      return false;
    }
    // contract type — abbreviation resolves to an id and we match on that;
    // otherwise fall back to a case-insensitive name comparison so unmapped
    // types (e.g. "Lease") still work.
    if (resolvedTypeId !== null) {
      const rowTypeId =
        (c.contract.contract_types as { id?: number | null } | null | undefined)
          ?.id ?? c.contract.type_id;
      if (rowTypeId !== resolvedTypeId) return false;
    } else if (requestedTypeLower) {
      const name = (summary.contractType ?? '').toLowerCase();
      if (name !== requestedTypeLower) return false;
    }
    if (
      input.vendor_name_contains &&
      !c.vendor_name
        .toLowerCase()
        .includes(input.vendor_name_contains.toLowerCase())
    ) {
      return false;
    }
    if (orderNumberTarget) {
      const candidate = normalizeOrderNumber(summary.orderNumber ?? '');
      if (!candidate.includes(orderNumberTarget)) {
        return false;
      }
    }
    if (input.business_group) {
      const target = input.business_group.toLowerCase();
      const matches = ownerGroupNames(contractOwners(c.contract)).some(
        (name) => name.toLowerCase() === target,
      );
      if (!matches) return false;
    }
    if (input.tag_id !== undefined) {
      if (!summary.tags.some((t) => t.id === input.tag_id)) return false;
    }
    if (input.tag_name) {
      const target = input.tag_name.toLowerCase();
      if (!summary.tags.some((t) => t.name.toLowerCase().includes(target))) {
        return false;
      }
    }
    if (input.untagged && summary.tags.length !== 0) {
      return false;
    }
    if (input.asset_class) {
      const target = input.asset_class.toLowerCase();
      if (!assetClassNames(c).some((n) => n.toLowerCase().includes(target))) {
        return false;
      }
    }
    if (input.has_discount) {
      const discount = c.contract.discount;
      if (discount === null || discount === undefined || discount <= 0) {
        return false;
      }
    }
    if (input.renewal_type && summary.renewalType !== input.renewal_type) {
      return false;
    }
    if (
      input.auto_renewal !== undefined &&
      c.contract.auto_renewal !== input.auto_renewal
    ) {
      return false;
    }
    if (
      input.will_not_renew !== undefined &&
      c.contract.will_not_renew !== input.will_not_renew
    ) {
      return false;
    }
    if (
      input.multi_year !== undefined &&
      c.contract.multi_year !== input.multi_year
    ) {
      return false;
    }
    if (
      input.doc_fully_executed !== undefined &&
      c.contract.doc_fully_executed !== input.doc_fully_executed
    ) {
      return false;
    }
    if (input.has_price_escalator && summary.priceEscalatorReason === null) {
      return false;
    }
    if (input.has_annual_increase) {
      const ai = c.contract.annual_increase;
      if (ai === null || ai === undefined || ai === 0) return false;
    }
    if (input.has_renewal_step_up) {
      if (
        summary.projectedAnnualSpendDeltaBase === null ||
        summary.projectedAnnualSpendDeltaBase <= 0
      ) {
        return false;
      }
    }
    if (input.min_annual_increase !== undefined) {
      const ai = c.contract.annual_increase;
      if (ai === null || ai === undefined || ai < input.min_annual_increase) {
        return false;
      }
    }
    if (input.term_end_after) {
      if (!summary.termEnd || summary.termEnd < input.term_end_after) {
        return false;
      }
    }
    if (input.term_end_before) {
      if (!summary.termEnd || summary.termEnd > input.term_end_before) {
        return false;
      }
    }
    if (input.term_start_after) {
      if (!summary.termStart || summary.termStart < input.term_start_after) {
        return false;
      }
    }
    if (input.term_start_before) {
      if (!summary.termStart || summary.termStart > input.term_start_before) {
        return false;
      }
    }
    if (input.cancel_by_after) {
      if (
        !summary.cancelByDate ||
        summary.cancelByDate < input.cancel_by_after
      ) {
        return false;
      }
    }
    if (input.cancel_by_before) {
      if (
        !summary.cancelByDate ||
        summary.cancelByDate > input.cancel_by_before
      ) {
        return false;
      }
    }
    // created_at is a full ISO timestamp; comparing it against the bare
    // YYYY-MM-DD threshold lexicographically yields an on-or-after match
    // (a same-day timestamp sorts after the date prefix).
    if (input.uploaded_after) {
      const createdAt = c.contract.created_at as string | null | undefined;
      if (!createdAt || createdAt < input.uploaded_after) {
        return false;
      }
    }
    // Unknown spend is excluded from numeric range filters — null is not 0.
    if (input.min_annual_spend !== undefined) {
      if (
        summary.currentAnnualSpendBase === null ||
        summary.currentAnnualSpendBase < input.min_annual_spend
      ) {
        return false;
      }
    }
    if (input.max_annual_spend !== undefined) {
      if (
        summary.currentAnnualSpendBase === null ||
        summary.currentAnnualSpendBase > input.max_annual_spend
      ) {
        return false;
      }
    }
    return true;
  });

  // Apply rollup AFTER user filters so date/spend predicates see every row,
  // but base-currency totals remain summable when the agent passes
  // aggregation_mode='rollup'.
  const aggregated =
    input.aggregation_mode === 'rollup'
      ? filterForAggregation(matched)
      : matched;

  // Calendar-style sort. Descending isn't useful for "what's coming up", so
  // sort_by always means ascending (soonest first); contracts missing the
  // sorted date get pushed to the end deterministically.
  const SORT_KEYS: Record<
    NonNullable<typeof input.sort_by>,
    keyof ContractSummary
  > = {
    term_end: 'termEnd',
    term_start: 'termStart',
    cancel_by: 'cancelByDate',
  };
  const sorted = input.sort_by
    ? [...aggregated].sort((a, b) => {
        const key = SORT_KEYS[input.sort_by!];
        const aVal = (summaryFor(a)[key] ?? null) as string | null;
        const bVal = (summaryFor(b)[key] ?? null) as string | null;
        if (aVal === null && bVal === null) return 0;
        if (aVal === null) return 1;
        if (bVal === null) return -1;
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      })
    : aggregated;

  const page = paginate(sorted, input);
  return {
    count: page.items.length,
    totalMatched: page.totalAvailable,
    nextCursor: page.nextCursor,
    aggregationMode: input.aggregation_mode ?? 'all',
    baseCurrency: orgBaseCurrency(),
    contracts: page.items.map((c) => toListRow(summaryFor(c))),
  };
}

const searchClausesInput = z.object({
  has_clause: z
    .enum(CLAUSE_FIELDS)
    .optional()
    .describe(
      'Returns only contracts where this legal clause has a non-empty value. ' +
        `Available: ${CLAUSE_FIELDS.join(', ')}. ` +
        'Use for "which contracts have X documented?" questions, e.g. has_clause:"ai_training_restrictions" → contracts that explicitly call out AI restrictions.',
    ),
  clause_contains: z
    .object({
      field: z.enum(CLAUSE_FIELDS),
      value: z.string(),
    })
    .optional()
    .describe(
      'Substring search within a specific clause. Case-insensitive. ' +
        'e.g. { field: "geo_restrictions", value: "EU" }, or ' +
        '{ field: "market_data_types", value: "real-time equities" } for hedge-fund queries.',
    ),
  summary_contains: z
    .string()
    .optional()
    .describe(
      "Substring search on the AI-generated contract summary. Use as a coarse search across the contract's natural-language overview.",
    ),
  status: z
    .enum(['active', 'all'])
    .optional()
    .describe('active (default) or all (includes archived)'),
  ...paginationSchema,
});

async function searchContractClauses(
  input: z.infer<typeof searchClausesInput>,
) {
  if (!input.has_clause && !input.clause_contains && !input.summary_contains) {
    return {
      count: 0,
      totalMatched: 0,
      nextCursor: null,
      contracts: [],
      hint: 'Provide at least one of has_clause, clause_contains, or summary_contains.',
    };
  }

  const contracts = await getPublishedAndArchivedContracts(input.status);
  assertSameOrg(contracts, 'search_contract_clauses', getContractOrgId);

  const matched = contracts.filter((c) => {
    if (input.has_clause) {
      const value = c.contract[input.has_clause];
      if (
        value === null ||
        value === undefined ||
        (typeof value === 'string' && value.trim() === '')
      ) {
        return false;
      }
    }
    if (input.clause_contains) {
      const target = input.clause_contains.value.toLowerCase();
      const value = c.contract[input.clause_contains.field];
      if (
        value === null ||
        value === undefined ||
        !String(value).toLowerCase().includes(target)
      ) {
        return false;
      }
    }
    if (input.summary_contains) {
      const target = input.summary_contains.toLowerCase();
      const value = (c.contract.summary ?? '').toLowerCase();
      if (!value.includes(target)) return false;
    }
    return true;
  });

  const page = paginate(matched, input);
  return {
    count: page.items.length,
    totalMatched: page.totalAvailable,
    nextCursor: page.nextCursor,
    baseCurrency: orgBaseCurrency(),
    contracts: page.items.map((c) => toListRow(summarizeContract(c))),
  };
}

const updateInput = z.object({
  id: z
    .number()
    .int()
    .describe('Contract id to update (from list_contracts / query_contracts).'),
  business_sponsor: z
    .union([z.string(), z.record(z.string(), z.unknown()), z.null()])
    .optional()
    .describe(
      'Business owner. Stored as JSON. A plain string is wrapped as { name: string }.',
    ),
  tags: z
    .array(z.number().int())
    .optional()
    .describe('Tag IDs to associate. Replaces existing tags.'),
});

function describeUpdate(
  id: number,
  normalized: {
    business_sponsor?: unknown;
    tags?: number[];
  },
): string {
  const lines: string[] = [`Update contract #${id}:`];
  if ('business_sponsor' in normalized) {
    const v = normalized.business_sponsor;
    const display =
      v === null
        ? '(cleared)'
        : typeof v === 'object'
          ? JSON.stringify(v)
          : String(v);
    lines.push(`  business_sponsor → ${display}`);
  }
  if (normalized.tags !== undefined) {
    lines.push(
      normalized.tags.length > 0
        ? `  tags → [${normalized.tags.join(', ')}]`
        : '  tags → (cleared)',
    );
  }
  return lines.join('\n');
}

async function updateContractTool(
  input: z.infer<typeof updateInput>,
  ctx: McpToolContext,
) {
  // Defense-in-depth: route handler also checks requiredScope before parsing.
  requireScope('write');

  const { id, ...rest } = input;
  const normalized: {
    business_sponsor?: unknown;
    tags?: number[];
  } = {};

  if (rest.business_sponsor !== undefined) {
    normalized.business_sponsor =
      typeof rest.business_sponsor === 'string'
        ? { name: rest.business_sponsor }
        : rest.business_sponsor;
  }
  if (rest.tags !== undefined) {
    normalized.tags = rest.tags;
  }

  // Elicitation: when the host supports it, confirm with the user before
  // mutating. When not supported, proceed — the LLM is expected to have
  // confirmed in chat first.
  if (ctx.elicitInput) {
    const decision = await ctx.elicitInput({
      message: `${describeUpdate(id, normalized)}\n\nApprove this change?`,
      requestedSchema: {
        type: 'object',
        properties: {
          confirmed: {
            type: 'boolean',
            description: 'Approve the update',
          },
        },
        required: ['confirmed'],
      },
    });
    if (decision.action !== 'accept' || !decision.content?.confirmed) {
      return {
        applied: false,
        contractId: id,
        reason: decision.action === 'accept' ? 'declined' : decision.action,
      };
    }
  }

  try {
    const result = await updateContractFromMcp(id, normalized);
    return { applied: true, ...result };
  } catch (err) {
    if (err instanceof NotFoundToolError) throw err;
    throw err;
  }
}

export const contractsTools: McpToolDef[] = [
  {
    name: 'list_contracts',
    description:
      'List contracts in the user\'s organization. Defaults to active. Returns concise summaries (id, name, vendor, dates, spend, tags, business group). Invoices are billing records, not contracts, and are never included here — when the user asks for invoices use query_contracts with include_invoices or contract_type:"Invoice", or get_report_data type:"invoices". Spend figures (fields suffixed `Base`) are denominated in the organization\'s base display currency — see the response `baseCurrency`, and format amounts with that currency, never assuming USD. Paginated — pass cursor for the next page.',
    inputSchema: listInput,
    annotations: {
      title: 'List contracts',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: listContracts as McpToolDef['handler'],
  },
  {
    name: 'get_contract',
    description:
      'Returns full detail for one contract by id or by document-extracted number — the right tool for "show me / open / pull up / give me the full picture of" a specific contract. ' +
      'For "get me contract number 202.205-23" / "pull up invoice INV-2024-001" pass order_number (punctuation-insensitive; NOT the internal id); ambiguous numbers return a candidates list to pick from. Sibling get_renewal_summary is scoped to renewal-timing questions (cancel-by, auto-renew, should-we-renew); this tool is the one for overviews. ' +
      'Sections: summary (AI overview), dates (term/cancel/execution), renewal (type, period, auto/will-not-renew, annual increase), commercial (billing, payment terms, discount, multi-year, subscription term, CPI), legal clauses (scope, permissions, exclusivity, distribution/derivative/marketing rights, geo + data restrictions, AI training, SLAs, audit, security, dispute resolution, cancellation, cost mitigation, plus amended clauses — see search_contract_clauses for the full field enumeration), signature state, ownership (business_group, business_sponsor, business_justification), nda_fields (NDAs only), tags. ' +
      'Suitable for rendering as a card with vendor + type prominent and dates/clauses surfaced.',
    inputSchema: getContractInputSchema,
    annotations: {
      title: 'Get contract',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getContractTool as McpToolDef['handler'],
  },
  {
    name: 'query_contracts',
    description:
      'Filter contracts by combinations of vendor, contract type, business group, tag, renewal type, date windows (term-start, term-end, cancel-by), annual spend range, and price-escalator status. Sort chronologically with sort_by for calendar-style listings. Use when no single existing tool fits. ' +
      'For "show me X\'s MSA / NDA / SO / TOS" use contract_type — it accepts both full names ("Master Services Agreement") and abbreviations ("MSA"). See cpm://reference/contract-types for the catalog. ' +
      'Invoices are billing records, not contracts: results exclude them unless the user explicitly asks for invoices, in which case pass include_invoices:true (or contract_type:"Invoice" for invoices only). ' +
      'For "which vendors/contracts have price escalators?" use has_price_escalator (the umbrella) — every row is tagged with priceEscalatorReason ("annual_increase" / "renewal_step_up" / "both") so you can group narration into the two natural buckets. ' +
      'For "what\'s happening between X and Y" calendar-style questions, use cancel_by_after / cancel_by_before / term_end_after / term_end_before with sort_by:"cancel_by" or "term_end". ' +
      'For "which contracts have a discount?" use has_discount; for "contracts in the ESG / Equity / Fixed Income asset class" use asset_class; for "recently uploaded / added contracts" use uploaded_after; for "which contracts are untagged / have no tags?" use untagged. ' +
      'When the user supplies a contract number or invoice number from a document (e.g. "find contract 00768208", "invoice INV-2024-001") use order_number_contains — it matches the document-extracted number, which is NOT the internal contract id. ' +
      "Spend figures (fields suffixed `Base`) are denominated in the organization's base display currency — see the response `baseCurrency`, and format amounts with that currency, never assuming USD. " +
      'When you intend to SUM the row-level base-currency figures, pass aggregation_mode:"rollup" so fully-superseded amendments (and any linked-child invoices in scope) are dropped (matches list_vendors / get_spend). Default "all" includes them for per-contract introspection. This is the right path for a vendor- or tag-scoped spend TOTAL ("total ESG spend", "how much do we spend on Bloomberg") — filter by tag_name / vendor_name_contains with aggregation_mode:"rollup", follow nextCursor until it is null, then sum only the non-null currentAnnualSpendBase values yourself (the response carries no precomputed total) and report rows with unknown (null) spend separately rather than counting them as 0. (get_spend is org-wide only and does not scope.) ' +
      'For clause-text search use search_contract_clauses instead. Paginated.',
    inputSchema: queryInput,
    annotations: {
      title: 'Query contracts',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: queryContracts as McpToolDef['handler'],
  },
  {
    name: 'search_contract_clauses',
    description:
      'Search contracts by their legal clause text or AI summary. ' +
      'Use has_clause to find contracts where a clause is documented at all (e.g. ai_training_restrictions). ' +
      'Use clause_contains for substring search within a specific clause (e.g. { field: "geo_restrictions", value: "EU" }). ' +
      'Use summary_contains for a coarse search across the AI-generated overview. ' +
      'Returns concise contract summaries; call get_contract for the full clause text. Paginated.',
    inputSchema: searchClausesInput,
    annotations: {
      title: 'Search contract clauses',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: searchContractClauses as McpToolDef['handler'],
  },
  {
    name: 'update_contract',
    description:
      'Update a contract. Whitelisted fields only: business_sponsor (business owner), tags. Business groups are cost allocations, edited in the app. Requires the write scope.',
    inputSchema: updateInput,
    annotations: {
      title: 'Update contract',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    requiredScope: 'write',
    handler: updateContractTool as McpToolDef['handler'],
  },
];
