/**
 * Invoices Report Transform
 *
 * Extends base contract table row with invoice discrepancy data.
 */

import { buildContractTableRow } from '@/lib/v2/contracts/transforms';
import { EnrichedContract } from '@/lib/v2/contracts/service';
import {
  ProcessedContract,
  MatchedInvoiceProduct,
} from '@/app/lib/definitions';
import { InvoiceDataContext, InvoiceData } from '../filters';
import {
  calculateInvoiceDiscrepancy,
  calculateCompoundedProductFee,
  calculateContractYear,
  normalizeBillingFrequency,
  calculateFrequencyMultiplier,
  getAnnualFactorForFrequency,
} from '@/app/lib/budget';
import {
  getDailyUsdRates,
  getLatestUsdRates,
  dailyCrossMultiplier,
  crossMultiplier,
} from '@/lib/v2/core/fxRates';
import { getEffectiveBaseCurrency } from '@/data/users';
import type { Contract as BudgetContract } from '@/app/lib/budget/contractStatusUtils';
import {
  parseISO,
  isValid,
  format,
  subDays,
  addDays,
  addMonths,
  differenceInMonths,
} from 'date-fns';
import {
  annualFeeRepeats,
  earliestIsoDate,
  type SpendContractInput,
} from '@/lib/v2/spend';
import { expectedPeriodFee, type SegmentFeeContext } from './expectedSegments';
import { isInvoiceType, contractTypes } from '@/app/lib/constants';
import { isHierarchyEdge } from '@/lib/contracts/relationshipEdges';

export interface InvoicesReportRow extends ProcessedContract {
  isInvoiceReport: boolean;
  expectedInvoiceAmount: number;
  invoiceAmount: number;
  discrepancy: number;
  discrepancyBase: number;
  difference: number;
  frequencyMismatch: boolean;
  frequencyAligned: boolean;
  frequencyMultiplier: number;
  invoiceFreqMultiplier: number;
  parentBillingFrequency: string;
  invoiceBillingFrequency: string;
  matchedProducts: MatchedInvoiceProduct[];
  rawParentAmount: number;
  rawInvoiceAmount: number;
  adjustedParentAmount: number;
  adjustedInvoiceAmount: number;
  hasUnmatchedProducts: boolean;
}

export interface InvoiceProductSubRow {
  id: string;
  contract_id: number;
  product: { vendor_products: { id: string | number; name: string } }[];
  expectedInvoiceAmount: number;
  adjustedParentAmount: number;
  invoiceAmount: number;
  adjustedInvoiceAmount: number;
  parentBillingFrequency: string;
  invoiceBillingFrequency: string;
  difference: number;
  discrepancy: number;
  frequencyAligned: boolean;
  frequencyMultiplier: number;
  invoiceFreqMultiplier: number;
  frequencyMismatch: boolean;
  parent_fee: number;
  invoice_fee: number;
  currency: string;
  isReportRow: boolean;
  isInvoiceProductRow: boolean;
  isUnmatched: boolean;
  reportType: string;
  isSuperseded?: boolean;
}

/**
 * Product ids struck on the invoice row itself. `supersededProducts` keys are
 * `${product_id}-${year}`, so only the trailing numeric year is stripped — a
 * string product id can itself carry dashes, and exact set membership keeps
 * product 1 from matching product 10. Cancellations strike a product across
 * every year row, so the year is deliberately dropped.
 */
function struckProductIds(supersededProducts?: string[]): Set<string> {
  return new Set(
    (supersededProducts ?? []).map((key) => key.replace(/-\d+$/, '')),
  );
}

/**
 * Build an invoices report row from an enriched contract.
 * Uses context Map to get invoice data for each contract.
 */
export function buildInvoicesRow(
  contract: EnrichedContract,
  context?: InvoiceDataContext,
): InvoicesReportRow {
  const base = buildContractTableRow(contract);

  // Get invoice data from context map
  const invoiceData: Partial<InvoiceData> = context?.get(contract.id) || {};

  const matchedProducts = invoiceData.matchedProducts || [];
  const unmatchedProducts = invoiceData.unmatchedProducts || [];
  const totalProducts = matchedProducts.length + unmatchedProducts.length;

  // Build subrows when there are multiple products (matched + unmatched)
  const subRows: InvoiceProductSubRow[] = [];
  const struckProducts = struckProductIds(base.supersededProducts);

  if (totalProducts > 1) {
    // Add matched product subrows
    for (const matchedProduct of matchedProducts) {
      subRows.push({
        id: matchedProduct.id,
        contract_id: contract.id,
        // Struck state rides down so the spread product view renders the same
        // strikethrough the contracts table shows.
        isSuperseded: struckProducts.has(String(matchedProduct.product_id)),
        product: [
          {
            vendor_products: {
              id: matchedProduct.product_id,
              name: matchedProduct.product_name,
            },
          },
        ],
        expectedInvoiceAmount: matchedProduct.expectedInvoiceAmount,
        adjustedParentAmount: matchedProduct.adjustedParentAmount,
        invoiceAmount: matchedProduct.adjustedInvoiceAmount,
        adjustedInvoiceAmount: matchedProduct.adjustedInvoiceAmount,
        parentBillingFrequency: matchedProduct.parentBillingFrequency,
        invoiceBillingFrequency: matchedProduct.invoiceBillingFrequency,
        difference: matchedProduct.difference,
        discrepancy: matchedProduct.discrepancy,
        frequencyAligned: matchedProduct.frequencyAligned,
        frequencyMultiplier: matchedProduct.frequencyMultiplier,
        invoiceFreqMultiplier: matchedProduct.invoiceFreqMultiplier,
        frequencyMismatch: !matchedProduct.frequencyAligned,
        parent_fee: matchedProduct.parent_fee,
        invoice_fee: matchedProduct.invoice_fee,
        currency: base.currency || '',
        isReportRow: true,
        isInvoiceProductRow: true,
        isUnmatched: false,
        reportType: 'invoices',
      });
    }

    // Add unmatched product subrows
    for (const unmatched of unmatchedProducts) {
      subRows.push({
        id: unmatched.id,
        contract_id: contract.id,
        isSuperseded: struckProducts.has(String(unmatched.product_id)),
        product: [
          {
            vendor_products: {
              id: unmatched.product_id,
              name: unmatched.product_name,
            },
          },
        ],
        expectedInvoiceAmount: 0,
        adjustedParentAmount: 0,
        invoiceAmount: unmatched.invoice_fee,
        adjustedInvoiceAmount: unmatched.invoice_fee,
        parentBillingFrequency: invoiceData.parentBillingFrequency || '',
        invoiceBillingFrequency: invoiceData.invoiceBillingFrequency || '',
        difference: 0,
        discrepancy: unmatched.invoice_fee,
        frequencyAligned: true,
        frequencyMultiplier: 1,
        invoiceFreqMultiplier: 1,
        frequencyMismatch: false,
        parent_fee: 0,
        invoice_fee: unmatched.invoice_fee,
        currency: base.currency || '',
        isReportRow: true,
        isInvoiceProductRow: true,
        isUnmatched: true,
        reportType: 'invoices',
      });
    }
  }

  return {
    ...base,
    isInvoiceReport: true,
    expectedInvoiceAmount: invoiceData.expectedInvoiceAmount || 0,
    invoiceAmount: invoiceData.invoiceAmount || 0,
    discrepancy: invoiceData.discrepancy || 0,
    discrepancyBase: invoiceData.discrepancyBase || 0,
    difference: invoiceData.difference || 0,
    frequencyMismatch: invoiceData.frequencyMismatch || false,
    frequencyAligned: invoiceData.frequencyAligned ?? true,
    frequencyMultiplier: invoiceData.frequencyMultiplier || 1,
    invoiceFreqMultiplier: invoiceData.invoiceFreqMultiplier || 1,
    parentBillingFrequency: invoiceData.parentBillingFrequency || '',
    invoiceBillingFrequency: invoiceData.invoiceBillingFrequency || '',
    matchedProducts,
    rawParentAmount: invoiceData.rawParentAmount || 0,
    rawInvoiceAmount: invoiceData.rawInvoiceAmount || 0,
    adjustedParentAmount: invoiceData.adjustedParentAmount || 0,
    adjustedInvoiceAmount: invoiceData.adjustedInvoiceAmount || 0,
    hasUnmatchedProducts: invoiceData.hasUnmatchedProducts || false,
    subRows: subRows.length > 0 ? subRows : undefined,
  } as InvoicesReportRow;
}

/**
 * Build rows for all invoice contracts with invoice data context.
 */
export function buildInvoicesRows(
  contracts: EnrichedContract[],
  context?: InvoiceDataContext,
): InvoicesReportRow[] {
  return contracts.map((contract) => buildInvoicesRow(contract, context));
}

/**
 * Resolve the date an invoice falls on. Manual invoices store term_start_date as
 * an array of dated entries; integration-synced invoices store `{ start }`.
 * Returns undefined when the date is missing or unparseable so callers fall back
 * to today.
 */
type InvoiceTermStartDate =
  | Array<{ date?: string | null }>
  | { start?: string | null }
  | null
  | undefined;

interface ParentProductRow {
  product_id?: number | null;
  year?: number | null;
  fees?: number | string | null;
  one_time_only?: boolean | null;
  vendor_products?: {
    name?: string | null;
    product_code?: string | null;
  } | null;
}

/**
 * A `vendor_products_eafs_fees` row, embedded on the invoice's product row.
 * `vpd_id` is UNIQUE, so PostgREST returns this as a single object — but the
 * read stays defensive of a one-element array too.
 */
interface EafsFeeRow {
  product_fee: number | string;
  period_months: number | string;
}

interface InvoiceProductRow {
  product_id?: number | null;
  fees?: number | string | null;
  vendor_products?: {
    name?: string | null;
    product_code?: string | null;
  } | null;
  vendor_products_eafs_fees?: EafsFeeRow | EafsFeeRow[] | null;
}

interface ContractRelationship {
  active?: boolean;
  disabled?: boolean;
  relationship_type?: string | null;
}

/**
 * The same row plus the embedded parent contract. `parent` is the untyped
 * contract embed this module already works in (`processInvoiceData` takes
 * `contract: any`) — the reconciliation reads its currency, term and
 * billing-frequency fields directly.
 */
interface ParentEdge extends ContractRelationship {
  parent?: any;
}

/**
 * An invoice is routinely billed against several service orders: one hierarchy
 * parent plus a `'billing'` edge per additional payer. Reconciling against the
 * hierarchy parent alone reported every line sourced from the others as an
 * unmatched product — a discrepancy the vendor never actually caused.
 *
 * The hierarchy parent still supplies currency, billing frequency and term
 * anchoring (a billing parent names a payer, not the structural agreement), so
 * only the *expected products* are unioned — and only those the hierarchy
 * parent does not itself price, so its own fee rows are never displaced.
 */
function isQualifyingParentEdge(rel: ContractRelationship): boolean {
  return rel.active === true && rel.disabled !== true;
}

/**
 * The contract that prices a product — everything the per-product fee
 * resolution reads off it. Narrower than the untyped `parent` embed this module
 * otherwise works in: these are exactly the fields that decide a product's
 * expected fee, so widening the read surface should mean widening this type.
 */
interface ProductOwner {
  id: number;
  type_id?: number | null;
  currency?: string | null;
  billing_frequency?: string | null;
  subscription_term?: number | null;
  annual_increase?: number | null;
  renewal_type?: string | null;
  /**
   * Dated term entries, newest-first. `date` is non-optional to match what the
   * spend resolver and the budget calculators both require of a contract they
   * are handed — `earliestIsoDate` still validates each entry at runtime, so a
   * malformed row is dropped rather than trusted.
   */
  term_start_date?: Array<{ date: string }> | null;
  term_end_date?: Array<{ date: string }> | null;
  vendor_products_details?: ParentProductRow[] | null;
}

/** A parent product row paired with the contract that contributed it. */
interface OwnedProductRow {
  row: ParentProductRow;
  owner: ProductOwner;
}

/**
 * The rows pricing one product, plus the single contract they came from.
 * `billingParentRows` guarantees one owner per product, so this is never a
 * mixture of two parents' rows.
 */
interface ProductPricing {
  owner: ProductOwner;
  rows: ParentProductRow[];
}

/**
 * Product rows contributed by billing parents, one parent per product: parents
 * are taken in ascending id order and the first to price a product supplies
 * ALL of its rows for it. Two billing parents pricing the same product would
 * otherwise pool their rows, letting the unordered relationship fetch decide —
 * via array order — which parent's row selectParentRowForYear picks. Same
 * lowest-id rule as the anchor fallback in processInvoiceData.
 */
function billingParentRows(
  qualifyingEdges: ParentEdge[],
  hierarchyProductIds: Set<number>,
): OwnedProductRow[] {
  const productOwner = new Map<number, number>();
  const rows: OwnedProductRow[] = [];
  const billingParents = qualifyingEdges
    .filter((r) => !isHierarchyEdge(r) && r.parent?.id != null)
    .map((r) => r.parent)
    .sort((a, b) => a.id - b.id);
  for (const parent of billingParents) {
    for (const row of parent.vendor_products_details || []) {
      if (row.product_id == null || hierarchyProductIds.has(row.product_id)) {
        continue;
      }
      const owner = productOwner.get(row.product_id);
      if (owner === undefined) productOwner.set(row.product_id, parent.id);
      else if (owner !== parent.id) continue;
      rows.push({ row, owner: parent });
    }
  }
  return rows;
}

function getInvoiceDate(termStartDate: InvoiceTermStartDate): Date | undefined {
  let dateStr: string | null | undefined;

  if (Array.isArray(termStartDate)) {
    if (termStartDate.length === 0) return undefined;
    const sorted = [...termStartDate].sort((a, b) =>
      (b?.date ?? '').localeCompare(a?.date ?? ''),
    );
    dateStr = sorted[0]?.date;
  } else if (termStartDate && typeof termStartDate === 'object') {
    dateStr = termStartDate.start;
  }

  if (!dateStr) return undefined;
  const parsed = parseISO(dateStr);
  return isValid(parsed) ? parsed : undefined;
}

function parentRowYear(row: ParentProductRow): number {
  return Number(row.year) || 1;
}

/**
 * The parent's original term start (earliest entry). Product `year` values are
 * indexed from the original term, so a renewed contract — whose term_start_date
 * array accumulates each renewal period newest-first — must anchor its year math
 * here, not to the most recent (renewal) start.
 */
function getOriginalTermStart(
  termStartDate: Array<{ date?: string | null }> | null | undefined,
): string | undefined {
  // Delegates to the resolver's validating pick: a malformed entry that sorts
  // first must not shadow a valid later one (it would poison the span and the
  // year anchor alike).
  return earliestIsoDate(termStartDate as Array<{ date: string }>) ?? undefined;
}

/**
 * Pick the parent product row that covers the given contract year: exact match,
 * else the nearest earlier year, else the earliest available row.
 */
function selectParentRowForYear(
  rows: ParentProductRow[],
  targetYear: number,
): ParentProductRow {
  const exact = rows.find((row) => parentRowYear(row) === targetYear);
  if (exact) return exact;

  const earlier = rows
    .filter((row) => parentRowYear(row) < targetYear)
    .sort((a, b) => parentRowYear(b) - parentRowYear(a));
  if (earlier.length > 0) return earlier[0];

  return rows.reduce((lowest, row) =>
    parentRowYear(row) < parentRowYear(lowest) ? row : lowest,
  );
}

/**
 * Compounded product fee in the parent's native currency. Mirrors the guard used
 * across budget calculations: only compound when the contract has an annual
 * increase and is not one-time.
 */
function compoundedNativeFee(
  product: ParentProductRow,
  parentContract: BudgetContract,
): number {
  if (
    parentContract.annual_increase &&
    parentContract.renewal_type !== 'One-Time'
  ) {
    return calculateCompoundedProductFee(
      { year: parentRowYear(product), fees: String(product.fees ?? 0) },
      parentContract,
    ).compoundedFee;
  }
  return Number(product.fees) || 0;
}

/**
 * Days of history a daily-rate read must cover so `dailyCrossMultiplier` can
 * step back over unquoted days (weekends, holidays) to the nearest stored rate.
 */
const RATE_LOOKBACK_DAYS = 7;

/**
 * FX multipliers for one invoice, both taken at the invoice's date — the
 * ticket's rule for this report (PSK-1796: "convert discrepancies based on the
 * fx rate on the invoice date"). Same-currency legs are exactly 1 with no
 * fetch, so the common case (invoice, parent, and org all in one currency)
 * never touches the rate store. Days with no stored quote — future-dated
 * invoices land here by construction — fall back to today's rates.
 */
async function invoiceFxMultipliers(
  parentCurrency: string,
  invoiceCurrency: string,
  baseCurrency: string,
  invoiceDate: Date | undefined,
): Promise<{ parentToInvoice: number; invoiceToBase: number }> {
  if (parentCurrency === invoiceCurrency && invoiceCurrency === baseCurrency) {
    return { parentToInvoice: 1, invoiceToBase: 1 };
  }

  const quotes = [parentCurrency, invoiceCurrency, baseCurrency];
  const today = format(new Date(), 'yyyy-MM-dd');
  let rateDate = invoiceDate ? format(invoiceDate, 'yyyy-MM-dd') : today;
  if (rateDate > today) rateDate = today;

  const daily = await getDailyUsdRates(
    quotes,
    format(subDays(parseISO(rateDate), RATE_LOOKBACK_DAYS), 'yyyy-MM-dd'),
    rateDate,
  );

  let parentToInvoice = dailyCrossMultiplier(
    parentCurrency,
    invoiceCurrency,
    rateDate,
    daily,
  );
  let invoiceToBase = dailyCrossMultiplier(
    invoiceCurrency,
    baseCurrency,
    rateDate,
    daily,
  );

  if (parentToInvoice === undefined || invoiceToBase === undefined) {
    const latest = await getLatestUsdRates(quotes);
    parentToInvoice ??= crossMultiplier(
      parentCurrency,
      invoiceCurrency,
      latest,
    );
    invoiceToBase ??= crossMultiplier(invoiceCurrency, baseCurrency, latest);
  }

  return { parentToInvoice, invoiceToBase };
}

/**
 * Process invoice data for a contract, calculating discrepancies between
 * invoice amounts and parent contract amounts.
 *
 * All comparison fields are denominated in the invoice's own currency —
 * source-document amounts stay native per PSK-1796, and only a parent priced
 * in a different currency crosses over, at the invoice-date rate. The one
 * base-currency figure is the stamped `discrepancyBase`, which the report and
 * dashboard totals sum.
 */
/**
 * Months the expected fee prices — calculateInvoiceDiscrepancy's divisor, so
 * every branch stays auditable in one place.
 *
 * Segment-sourced fees carry their own span. The legacy fallback applies
 * decision #9 by hand (PSK-1928): per-year rows price 12 months; a MIXED
 * parent's lone single-row product keeps the report's full-term reading (the
 * divergence awaiting a product call); a pure single-row parent reads annual
 * on a clean multi-year span and whole-span otherwise.
 */
function resolveFeeSpanMonths({
  segmentFee,
  hasPerYearRows,
  parentHasPerYearRows,
  parentSpanMonths,
  parentContract,
}: {
  segmentFee: { spanMonths: number } | null;
  hasPerYearRows: boolean;
  parentHasPerYearRows: boolean;
  parentSpanMonths: number | null;
  parentContract: { subscription_term?: number | null };
}): number {
  if (segmentFee) return segmentFee.spanMonths;
  if (hasPerYearRows) return 12;
  if (parentHasPerYearRows || parentSpanMonths === null) {
    return parentContract.subscription_term || 12;
  }
  return annualFeeRepeats(parentSpanMonths, parentContract.subscription_term)
    ? 12
    : parentSpanMonths;
}

/**
 * The segment context is injected by the caller (the report pipeline's enrich
 * step) rather than reached for here, which keeps this module free of
 * server-only imports. A ctx-less call prices via the legacy fee walk.
 */
export async function processInvoiceData(
  contract: any,
  segmentCtx?: SegmentFeeContext,
): Promise<Partial<ProcessedContract>> {
  const isInvoice = isInvoiceType(contract.type_id);
  let invoiceData = {};

  if (
    isInvoice &&
    contract.contract_relationships &&
    contract.contract_relationships.length > 0
  ) {
    const qualifyingEdges = (
      contract.contract_relationships as ParentEdge[]
    ).filter(isQualifyingParentEdge);

    // The hierarchy parent anchors the reconciliation; billing parents only
    // contribute expected products below. With no hierarchy edge at all the
    // anchor falls to a billing parent — picked by lowest id, because the
    // fetch has no ORDER BY and `[0]` would let row order decide the invoice's
    // currency, term and frequency. An edge with no parent embed cannot anchor
    // and must not displace one that can (`id <= undefined` is false, so a
    // trailing parentless edge used to win the reduce and null the anchor).
    const parentBearingEdges = qualifyingEdges.filter(
      (edge) => edge.parent?.id != null,
    );
    const lowestIdParent = parentBearingEdges.reduce<ParentEdge | undefined>(
      (lowest, edge) =>
        lowest != null && lowest.parent.id <= edge.parent.id ? lowest : edge,
      undefined,
    )?.parent;
    const parentContract =
      qualifyingEdges.find((r) => isHierarchyEdge(r))?.parent ?? lowestIdParent;

    if (parentContract) {
      const invoiceCurrency = (contract.currency || 'USD').toUpperCase();
      const parentCurrency = (parentContract.currency || 'USD').toUpperCase();
      const baseCurrency = (await getEffectiveBaseCurrency()).toUpperCase();

      const invoiceDate = getInvoiceDate(contract.term_start_date);
      const { parentToInvoice, invoiceToBase } = await invoiceFxMultipliers(
        parentCurrency,
        invoiceCurrency,
        baseCurrency,
        invoiceDate,
      );

      // A segment on a supersession chain is denominated in its OWNING
      // contract's currency — an amendment can re-price in a different one —
      // so the crossover multiplier follows the fee's currency, never assumed
      // from the parent. Memoized per currency: rows of one invoice share
      // rate fetches.
      const feeToInvoiceByCurrency = new Map<string, number>([
        [parentCurrency, parentToInvoice],
      ]);
      const feeToInvoice = async (feeCurrency: string): Promise<number> => {
        const cached = feeToInvoiceByCurrency.get(feeCurrency);
        if (cached !== undefined) return cached;
        const { parentToInvoice: multiplier } = await invoiceFxMultipliers(
          feeCurrency,
          invoiceCurrency,
          baseCurrency,
          invoiceDate,
        );
        feeToInvoiceByCurrency.set(feeCurrency, multiplier);
        return multiplier;
      };

      const invoiceProducts = contract.vendor_products_details || [];
      const hierarchyProducts = parentContract.vendor_products_details || [];

      // Union the expected products across the other qualifying parents, but
      // only for products the hierarchy parent does not itself price. Rows for
      // one product are pooled and picked by contract year
      // (selectParentRowForYear), so mixing two parents' rows for the SAME
      // product could let a billing parent's year row supply the expected fee.
      // A product only the billing parent lists has no such contest.
      //
      // The INVOICE stays anchored to the hierarchy parent — it supplies the
      // reported parent, the displayed billing frequency and the base-currency
      // stamp, so this remains one reconciliation per invoice rather than one
      // per parent. But each PRODUCT is priced against the contract that
      // actually sells it: term length, term start, currency, billing frequency
      // and annual increase all come from that owner. Pricing a billing
      // parent's product off the hierarchy parent's terms was only exact when
      // the two agreed, and silently wrong when they did not — a 12-month
      // $5,000 product read against a 36-month parent expected $416.67 against
      // $1,250 billed.
      const hierarchyProductIds = new Set<number>(
        hierarchyProducts
          .map((p: ParentProductRow) => p.product_id)
          .filter((id: number | null | undefined) => id != null),
      );
      const parentProducts: OwnedProductRow[] = [
        ...hierarchyProducts.map((row: ParentProductRow) => ({
          row,
          owner: parentContract,
        })),
        ...billingParentRows(qualifyingEdges, hierarchyProductIds),
      ];

      // A product may appear once per contract year; keep every row so the
      // classification below sees all years, and pick the right row per invoice.
      // Each entry carries the contract that priced it — a billing parent has
      // its own term, currency, frequency and annual increase, and its products
      // must be priced against those, not the hierarchy parent's.
      const parentRowsByProduct = new Map<number, ProductPricing>();
      parentProducts.forEach(({ row, owner }: OwnedProductRow) => {
        if (row.product_id == null) return;
        const entry = parentRowsByProduct.get(row.product_id);
        if (entry) entry.rows.push(row);
        else parentRowsByProduct.set(row.product_id, { owner, rows: [row] });
      });

      // Each of the three values below is a statement about ONE contract's term
      // shape, so each is derived per owning parent rather than once from the
      // hierarchy parent. A billing parent names a different service order,
      // which can run a different term length, start on a different date and
      // carry its own per-year rows; reading these off the hierarchy parent
      // spreads its fee over the wrong number of months. Memoized by contract
      // id — an invoice has a handful of parents but many product rows.
      const targetYearByOwner = new Map<number, number>();
      const ownerHasPerYearRowsById = new Map<number, boolean>();
      const spanMonthsByOwner = new Map<number, number | null>();

      // Anchor to the owner's original term start so an invoice in a renewal
      // period maps past the original term; selectParentRowForYear then clamps
      // to the latest year, whose fee is the carried-forward current fee.
      const targetYearFor = (owner: ProductOwner): number => {
        const cached = targetYearByOwner.get(owner.id);
        if (cached !== undefined) return cached;
        const year = calculateContractYear(
          getOriginalTermStart(owner.term_start_date),
          invoiceDate,
        );
        targetYearByOwner.set(owner.id, year);
        return year;
      };

      // A parent with ANY per-year rows keeps the report's existing mixed-
      // shape reading (a lone single-row product beside per-year rows spreads
      // over the full term — a deliberate decision, pinned by the mixed-shape
      // test; note the engine reads that shape differently again, as a year-1
      // fee, so mixed parents remain a known three-way divergence for product
      // to settle). Decision #9 below applies only to the PURE single-row
      // parent, PSK-1928's case.
      //
      // Judged on the OWNER's own rows: another parent's per-year row for a
      // product of its own says nothing about this contract's term shape, and
      // letting it in would silently re-price the owner's products.
      const ownerHasPerYearRows = (owner: ProductOwner): boolean => {
        const cached = ownerHasPerYearRowsById.get(owner.id);
        if (cached !== undefined) return cached;
        const has = (owner.vendor_products_details || []).some(
          (row: ParentProductRow) => parentRowYear(row) > 1,
        );
        ownerHasPerYearRowsById.set(owner.id, has);
        return has;
      };

      // Months of the owner's initial recorded term — decision #9's input,
      // derived exactly as the resolver derives it (earliest recorded dates,
      // subscription-term fallback) so both sides of the comparison read the
      // same span (PSK-1928).
      const spanMonthsFor = (owner: ProductOwner): number | null => {
        const cached = spanMonthsByOwner.get(owner.id);
        if (cached !== undefined) return cached;
        const span = (() => {
          const startIso = getOriginalTermStart(owner.term_start_date);
          if (!startIso) return null;
          const start = parseISO(startIso);
          if (!isValid(start)) return null;
          const endIso = earliestIsoDate(owner.term_end_date);
          const inclusiveEnd = endIso
            ? parseISO(endIso)
            : addDays(addMonths(start, owner.subscription_term || 12), -1);
          if (!isValid(inclusiveEnd)) return null;
          const months = differenceInMonths(addDays(inclusiveEnd, 1), start);
          return months > 0 ? months : null;
        })();
        spanMonthsByOwner.set(owner.id, span);
        return span;
      };

      const matchedProducts: Array<{
        id: string;
        product_id: number | string;
        product_name: string;
        product_code: string | null;
        parent_fee: number;
        invoice_fee: number;
        parent_fee_converted: number;
        expectedInvoiceAmount: number;
        adjustedParentAmount: number;
        adjustedInvoiceAmount: number;
        parentBillingFrequency: string;
        invoiceBillingFrequency: string;
        difference: number;
        discrepancy: number;
        frequencyAligned: boolean;
        frequencyMultiplier: number;
        invoiceFreqMultiplier: number;
        parentProduct: any;
        invoiceProduct: any;
      }> = [];
      let totalExpectedInvoiceAmount = 0;
      let totalInvoiceAmount = 0;

      for (const invoiceProduct of invoiceProducts) {
        const pricing =
          invoiceProduct.product_id != null
            ? parentRowsByProduct.get(invoiceProduct.product_id)
            : undefined;
        const parentRows = pricing?.rows;

        if (parentRows && parentRows.length > 0) {
          // The contract that actually prices this product: the hierarchy
          // parent for its own rows, the contributing billing parent
          // otherwise. Falls back to the hierarchy parent so a product with no
          // recorded owner keeps today's behavior rather than throwing.
          const owner = pricing?.owner ?? parentContract;

          // An Exchange Agreement Invoice priced against an Exchange
          // Agreement Service Order reads its SO-side fee from the fee
          // schedule, not from the SO's own product row: the fee schedule is
          // the source of truth for what the SO should have billed. No row
          // means the fee schedule was never populated for this product, so
          // the product is left out of the reconciliation entirely rather
          // than falling back to the (out of scope) SO row.
          const isEafsInvoicePair =
            contract.type_id === contractTypes.EAINV &&
            owner.type_id === contractTypes.EASO;
          let eafsFeeOverride: { fee: number; periodMonths: number } | null =
            null;
          if (isEafsInvoicePair) {
            const eafsRaw = (invoiceProduct as InvoiceProductRow)
              .vendor_products_eafs_fees;
            const eafsRow = Array.isArray(eafsRaw) ? eafsRaw[0] : eafsRaw;
            if (!eafsRow) continue;
            eafsFeeOverride = {
              fee: Number(eafsRow.product_fee) || 0,
              periodMonths: Number(eafsRow.period_months),
            };
          }

          const hasPerYearRows = parentRows.some(
            (row) => parentRowYear(row) > 1,
          );
          const targetYear = targetYearFor(owner);

          // Expected fee source of truth: the spend resolver's segment
          // covering the invoice date — year selection, annual-increase
          // compounding, decision #9 term shapes, amendment supersession and
          // PSK-1830 cutoffs all resolved the way every spend surface
          // resolves them. The comparison below is unchanged: the segment
          // hands back the period fee and the months it prices, exactly the
          // pair the legacy walk derived.
          //
          // A MIXED parent's lone single-row product stays on the legacy
          // reading (full-term spread) — the engine reads that shape as a
          // year-1 fee, a divergence awaiting a product call — as does any
          // row the context cannot price (no context, no invoice date, no
          // segments).
          // An invoice without a recorded date prices at asOf — the same
          // "current period" the legacy year-anchor defaulted to.
          const invoiceDateIso =
            invoiceDate && isValid(invoiceDate)
              ? format(invoiceDate, 'yyyy-MM-dd')
              : segmentCtx
                ? format(segmentCtx.asOf, 'yyyy-MM-dd')
                : undefined;
          const segmentFee =
            segmentCtx &&
            invoiceDateIso &&
            owner.id != null &&
            (hasPerYearRows || !ownerHasPerYearRows(owner))
              ? expectedPeriodFee(
                  segmentCtx,
                  owner.id,
                  invoiceProduct.product_id,
                  invoiceDateIso,
                  // Seed only: `expectedPeriodFee` reads the term dates and
                  // product rows ProductOwner declares. The parameter is typed
                  // for the resolver's fuller contract shape, which the
                  // untyped `parent` embed satisfies at runtime.
                  owner as unknown as SpendContractInput,
                )
              : null;

          const feeSubscriptionTerm = resolveFeeSpanMonths({
            segmentFee,
            hasPerYearRows,
            parentHasPerYearRows: ownerHasPerYearRows(owner),
            parentSpanMonths: spanMonthsFor(owner),
            parentContract: owner,
          });

          const parentProduct = selectParentRowForYear(parentRows, targetYear);

          // A one-time row books once, in its recorded year (psk-1492): when
          // the year walker reaches it from a later year, the fee was already
          // paid and nothing is expected.
          const oneTimeRowExpired =
            parentProduct.one_time_only === true &&
            parentRowYear(parentProduct) < targetYear;

          // Per-year rows already carry that year's fee; compounding it would
          // double-count the annual increase. Only single-row terms derive a
          // later year's fee by compounding from the base row. The fee
          // schedule, when it applies, wins over both the segment and the raw
          // SO row, and brings its own span: exchanges quote over different
          // periods, so the row's period_months replaces feeSubscriptionTerm
          // for the proration below.
          const productFee = oneTimeRowExpired
            ? 0
            : hasPerYearRows
              ? Number(parentProduct.fees) || 0
              : compoundedNativeFee(
                  parentProduct,
                  owner as unknown as BudgetContract,
                );

          const parentFee =
            eafsFeeOverride?.fee ?? segmentFee?.fee ?? productFee;
          const invoiceFee = Number(invoiceProduct.fees) || 0;

          // Compare in the invoice's currency: the invoice fee is already
          // native, and the expected fee crosses over at the invoice-date
          // rate in ITS OWN denomination — the owning segment's on a
          // supersession chain, the OWNING CONTRACT's otherwise. A fee
          // schedule prices the EASO, so its fee is in the EASO's currency
          // even when a superseding segment re-priced in another. A
          // same-currency pair multiplies by exactly 1.
          const feeCurrency = eafsFeeOverride
            ? owner.currency || parentCurrency
            : segmentFee?.currency || owner.currency || parentCurrency;
          const parentFeeConverted =
            parentFee * (await feeToInvoice(feeCurrency.toUpperCase()));

          const feeSpanMonths =
            eafsFeeOverride?.periodMonths ?? feeSubscriptionTerm;
          const productDiscrepancy = calculateInvoiceDiscrepancy(
            parentFeeConverted,
            invoiceFee,
            owner.billing_frequency,
            contract.billing_frequency,
            true,
            feeSpanMonths,
          );

          matchedProducts.push({
            id: `report-${contract.id}-product-${invoiceProduct.product_id}`,
            product_id: invoiceProduct.product_id,
            product_name: invoiceProduct.vendor_products?.name || 'Unknown',
            product_code: invoiceProduct.vendor_products?.product_code ?? null,
            parent_fee: parentFee,
            invoice_fee: invoiceFee,
            parent_fee_converted: parentFeeConverted,
            ...productDiscrepancy,
            parentProduct,
            invoiceProduct,
          });

          totalExpectedInvoiceAmount +=
            productDiscrepancy.expectedInvoiceAmount;
          totalInvoiceAmount += productDiscrepancy.adjustedInvoiceAmount;
        }
      }

      const normalizedParentFreq = normalizeBillingFrequency(
        parentContract.billing_frequency,
      );
      const normalizedInvoiceFreq = normalizeBillingFrequency(
        contract.billing_frequency,
      );
      const invoiceFreqMultiplier = getAnnualFactorForFrequency(
        normalizedInvoiceFreq,
      );
      const { multiplier: frequencyMultiplier } = calculateFrequencyMultiplier(
        normalizedParentFreq,
        normalizedInvoiceFreq,
      );
      const frequencyAligned =
        normalizedParentFreq.toLowerCase() ===
        normalizedInvoiceFreq.toLowerCase();

      // Capture invoice products that don't exist on the parent contract
      const unmatchedProducts = invoiceProducts
        .filter(
          (p: InvoiceProductRow) =>
            p.product_id != null && !parentRowsByProduct.has(p.product_id),
        )
        .map((p: InvoiceProductRow) => ({
          id: `report-${contract.id}-unmatched-${p.product_id}`,
          product_id: p.product_id,
          product_name: p.vendor_products?.name || 'Unknown',
          product_code: p.vendor_products?.product_code ?? null,
          invoice_fee: Number(p.fees) || 0,
        }));

      // Include unmatched product fees in totals. They are native invoice
      // amounts already, so no conversion. Expected stays 0 for these (no
      // parent product), but they add to billed and discrepancy.
      const unmatchedTotalFee = unmatchedProducts.reduce(
        (sum: number, p: { invoice_fee: number }) => sum + p.invoice_fee,
        0,
      );
      totalInvoiceAmount += unmatchedTotalFee;

      const totalDifferenceWithUnmatched =
        totalExpectedInvoiceAmount > 0
          ? ((totalInvoiceAmount - totalExpectedInvoiceAmount) /
              totalExpectedInvoiceAmount) *
            100
          : 0;

      // Compare the totals unrounded. Rounding them to whole dollars absorbed
      // genuine sub-dollar gaps and, when the two totals straddled a .50
      // boundary, reported $1 for a cent-level difference. Rounding for display
      // stays in the column formatter.
      invoiceData = {
        rawParentAmount: 0,
        rawInvoiceAmount: 0,
        invoiceFreqMultiplier,
        frequencyMultiplier,
        frequencyAligned,
        expectedInvoiceAmount: totalExpectedInvoiceAmount,
        invoiceAmount: totalInvoiceAmount,
        adjustedParentAmount: totalExpectedInvoiceAmount,
        adjustedInvoiceAmount: totalInvoiceAmount,
        discrepancy: totalInvoiceAmount - totalExpectedInvoiceAmount,
        // The one base-currency figure: the totals paths sum this stamp so
        // the aggregate converts at the invoice-date rate (PSK-1796) while
        // the row keeps its source currency.
        discrepancyBase:
          (totalInvoiceAmount - totalExpectedInvoiceAmount) * invoiceToBase,
        difference: totalDifferenceWithUnmatched,
        parentBillingFrequency: parentContract.billing_frequency || 'Unknown',
        invoiceBillingFrequency: contract.billing_frequency || 'Unknown',
        frequencyMismatch: !frequencyAligned,
        matchedProducts,
        hasUnmatchedProducts: unmatchedProducts.length > 0,
        unmatchedProducts,
        parentContract,
      };
    }
  }

  return isInvoice ? invoiceData : {};
}
