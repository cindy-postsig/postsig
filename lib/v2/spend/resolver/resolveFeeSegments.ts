import { parseISO, isValid, format } from 'date-fns';
import { isInvoiceType } from '@/app/lib/constants';
import type { SpendContractInput } from '../contractInput';
import { hasFeeOverrides } from '@/lib/v2/products/transforms';
import type { CurrencyPolicy, FeeSegment } from '../types';
import { parseUTCDate, diffUTCDays } from '../dates';
import { reconcileTermLength } from './termLength';
import { generateInitialTerm } from './initialTerm';
import { generateRenewalSegments } from './renewals';
import { inferred, INFERENCE_REASONS } from './shapes';
import type { ContractLineage } from './lineage';

// The per-contract slice of the supersession graph (see resolver/lineage.ts).
// undefined means "no lineage" — the resolver emits every segment untouched,
// the shadow/phase-1-3 behavior every consumer without lineage still relies on.
export type LineageGraph = ContractLineage | undefined;

function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

// Zero-at-cutoff: a superseded product's segments stop at the cutoff (the next
// family member's original start). A segment entirely at/after the cutoff is
// dropped — including renewal projections, so a superseded contract projects
// nothing past the amendment. A segment straddling the cutoff is truncated to
// [from, cutoff) and its fee scaled by the retained fraction of its span, so
// the per-day rate is preserved (amortized/actual conserve; committed keeps
// only the prorated pre-cutoff obligation). Boundary-aligned amendments — a
// child starting exactly at the parent's cycle end, the common case — leave the
// parent's segments untouched (retained === original) and only drop renewals.
//
// A superseding contract's own 'year-entry' segments are retagged
// source:'amendment' (metadata only; no slicer reads source).
function applyLineage(
  segments: FeeSegment[],
  lineage: LineageGraph,
): FeeSegment[] {
  if (!lineage) return segments;
  const { cutoffByProduct, amendsByProduct } = lineage;
  if (cutoffByProduct.size === 0 && amendsByProduct.size === 0) return segments;

  const out: FeeSegment[] = [];
  for (const segment of segments) {
    let seg = segment;
    const cutoff = cutoffByProduct.get(seg.productId);
    if (cutoff) {
      if (seg.from >= cutoff) continue;
      if (seg.to > cutoff) {
        const originalDays = diffUTCDays(
          parseUTCDate(seg.to),
          parseUTCDate(seg.from),
        );
        const retainedDays = diffUTCDays(
          parseUTCDate(cutoff),
          parseUTCDate(seg.from),
        );
        const scaledFee =
          originalDays > 0 ? (seg.fee * retainedDays) / originalDays : seg.fee;
        seg = { ...seg, to: cutoff, fee: toCents(scaledFee) };
      }
    }
    if (seg.source === 'year-entry' && amendsByProduct.has(seg.productId)) {
      seg = { ...seg, source: 'amendment' };
    }
    out.push(seg);
  }
  return out;
}

export interface ResolveOptions {
  asOf: Date;
  // The query window start. This resolver ignores it — a contract's segments
  // are derived (and cached) per component, not per window — but a resolver
  // whose segments are rebuilt per request can bound its own construction to
  // the window. A consumer with no window of its own passes the earliest date
  // its inputs can reach.
  horizonStart: Date;
  // The projection horizon, derived from the query window end — never from asOf.
  horizonEnd: Date;
  currency: CurrencyPolicy;
}

// parseISO is strict, so a manually-entered "01/31/2022" yields an Invalid
// Date that only blows up at format() ("Invalid time value") — and would fail
// the whole querySpend call for every contract in the set. Recover via the
// lenient native parser (mirrors legacy toIsoDateString); unparseable entries
// are dropped so a contract with no usable start resolves to no segments
// instead of crashing.
export function toIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (isValid(parseISO(raw))) return raw;
  const lenient = new Date(raw);
  return isValid(lenient) ? format(lenient, 'yyyy-MM-dd') : null;
}

export function earliestIsoDate(
  dates?: Array<{ date: string }> | null,
): string | null {
  if (!Array.isArray(dates)) return null;
  const parsed = dates
    .map((d) => toIsoDate(d.date))
    .filter((d): d is string => d !== null);
  if (parsed.length === 0) return null;
  return parsed.sort(
    (a, b) => parseISO(a).getTime() - parseISO(b).getTime(),
  )[0];
}

export function resolveFeeSegments(
  contractInput: SpendContractInput,
  lineage: LineageGraph,
  options: ResolveOptions,
): FeeSegment[] {
  // 'native' reads each product's original recorded fee instead of the
  // pre-converted USD stamp — exact native cents for per-contract surfaces
  // (table rows). Only per-contract consumers may use it: summing native
  // segments across contracts in different currencies is meaningless.
  //
  // 'base' resolves IDENTICALLY to 'native': the recorded fees, stamped with
  // the contract's own currency. Conversion into the org's base currency is a
  // placement-time concern (lib/v2/spend/baseCurrency.ts), because the rate to
  // apply depends on the basis — which the resolver knows nothing about.
  const feeMode =
    options.currency.mode === 'preconverted-usd' ? 'usd' : 'native';

  if (
    !contractInput.vendor_products_details?.length ||
    !contractInput.term_start_date?.length
  ) {
    return [];
  }

  const initialStartDate = earliestIsoDate(contractInput.term_start_date);
  const initialEndDate = earliestIsoDate(contractInput.term_end_date);
  if (!initialStartDate) return [];

  // Addendum term inheritance: a child recording neither an end date nor its
  // own subscription_term adopts the parent's term (parent-agnostic — MSA,
  // Service Order, …) instead of the silent 12-month default, keeping its own
  // fees. Explicit data on the child always wins.
  const inheritedTermMonths =
    !initialEndDate && !contractInput.subscription_term
      ? lineage?.parentSubscriptionTerm
      : undefined;

  // An INVOICE with no end date, no term, and nothing to inherit books its
  // full amount in its start month (product decision 2026-08-05, contract
  // 3120): an invoice is a billing event, not a year of service, so the
  // silent 12-month default must not spread it. Deliberately invoice-only —
  // open-ended CONTRACTS (evergreen Service Orders/MSAs) rely on the
  // 12-month default plus assumed renewal for their annual run-rate.
  const invoiceMonthTerm =
    !initialEndDate &&
    !contractInput.subscription_term &&
    !inheritedTermMonths &&
    isInvoiceType(contractInput.type_id)
      ? 1
      : undefined;
  const termOverride = inheritedTermMonths ?? invoiceMonthTerm;

  // Fees hand-edited: suppress annual_increase compounding, mirroring
  // generatePriceHistory. Derived here rather than passed in — every caller
  // computed the identical value from the same contract, so a caller that
  // forgot it silently compounded an increase over overridden fees.
  const feeOverrides = hasFeeOverrides(contractInput);

  const contract: SpendContractInput =
    feeOverrides || termOverride
      ? {
          ...contractInput,
          ...(feeOverrides ? { annual_increase: null } : {}),
          ...(termOverride ? { subscription_term: termOverride } : {}),
        }
      : contractInput;

  const currency = contract.currency || 'usd';
  const maxProductYear = Math.max(
    ...contract.vendor_products_details.map((p) => p.year || 1),
  );

  const { months: initialTermMonths, usedTieBreaker } = reconcileTermLength(
    initialStartDate,
    initialEndDate,
    contract.subscription_term,
    maxProductYear,
  );
  const isNonStandard =
    !contract.renewal_period &&
    !contract.subscription_term &&
    initialTermMonths % 12 !== 0;

  const initial = generateInitialTerm(
    contract,
    initialStartDate,
    initialEndDate,
    currency,
    feeMode,
  );

  const inferredReason =
    usedTieBreaker && !initial.virtualExtensionFired
      ? INFERENCE_REASONS.tieBreaker
      : inheritedTermMonths
        ? INFERENCE_REASONS.parentTermInherited
        : invoiceMonthTerm
          ? INFERENCE_REASONS.invoiceSingleMonth
          : undefined;

  const initialSegments = inferredReason
    ? initial.segments.map((s) =>
        s.confidence === 'explicit'
          ? inferred(
              {
                productId: s.productId,
                from: s.from,
                to: s.to,
                fee: s.fee,
                currency: s.currency,
                source: s.source,
                termStart: s.termStart,
              },
              inferredReason,
            )
          : s,
      )
    : initial.segments;

  const renewals = generateRenewalSegments(
    contract,
    initial.lastEndDate,
    initialTermMonths,
    isNonStandard,
    initial.maxYear,
    currency,
    options.horizonEnd,
    options.asOf,
    initial.virtualExtensionFired
      ? { committedYears: initial.committedYears }
      : undefined,
    feeMode,
  );

  return applyLineage([...initialSegments, ...renewals.segments], lineage);
}
