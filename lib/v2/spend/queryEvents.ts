import type { SpendContractInput } from './contractInput';
import type {
  CurrencyPolicy,
  FeeSegment,
  SpendEventQuery,
  SpendEventResult,
  SpendLineItem,
} from './types';
import { EMPTY_LINEAGE, type SpendLineage } from './resolver';
import {
  assertGroupableCurrency,
  runPipeline,
  type HorizonOf,
  type Placed,
  type PlaceFn,
  type Placer,
  type SpendQueryOptions,
} from './pipeline';
import { bucketKey } from './buckets';
import { parseUTCDate, addUTCDays } from './dates';
import { withTermStartConversion } from './baseCurrency';

// A dated point derived from one contract's segments: a renewal-term start
// (queryRenewals) or a committed-term end (queryTCV).
interface SegmentEvent {
  date: Date;
  total: number;
  byProduct: Map<number, number>;
  // False for the 2nd/3rd year-slice of a multi-year term under 'annual'
  // valuation: those are continuations, not the moment the org became bound,
  // so cancel-by recognition must not shift them.
  isTermStart: boolean;
}

type EventsOf = (
  segments: FeeSegment[],
  contract: SpendContractInput,
) => SegmentEvent[];

function eventFromSegments(
  date: Date,
  segments: FeeSegment[],
  isTermStart: boolean,
): SegmentEvent {
  const byProduct = new Map<number, number>();
  let total = 0;
  for (const segment of segments) {
    total += segment.fee;
    byProduct.set(
      segment.productId,
      (byProduct.get(segment.productId) ?? 0) + segment.fee,
    );
  }
  return { date, total, byProduct, isTermStart };
}

// One event per term: slices sharing a termStart stamp merge into a single
// event at that start, valued at the full term.
function eventsByTermStart(segments: FeeSegment[]): SegmentEvent[] {
  const byTerm = new Map<string, FeeSegment[]>();
  for (const segment of segments) {
    if (!segment.termStart) continue;
    const term = byTerm.get(segment.termStart);
    if (term) term.push(segment);
    else byTerm.set(segment.termStart, [segment]);
  }
  return [...byTerm.entries()].map(([termStart, termSegments]) =>
    eventFromSegments(parseUTCDate(termStart), termSegments, true),
  );
}

// One event per 12-month slice, each at its OWN start. A 36-month term lands a
// year's value in each of three fiscal years instead of its whole value in the
// signing year — so a Commitments bar stays comparable in magnitude to the
// Amortized and Actual views rather than reading as TCV.
function eventsBySegmentStart(segments: FeeSegment[]): SegmentEvent[] {
  const bySliceStart = new Map<string, FeeSegment[]>();
  for (const segment of segments) {
    if (!segment.termStart) continue;
    const slice = bySliceStart.get(segment.from);
    if (slice) slice.push(segment);
    else bySliceStart.set(segment.from, [segment]);
  }
  return [...bySliceStart.entries()].map(([from, sliceSegments]) =>
    eventFromSegments(
      parseUTCDate(from),
      sliceSegments,
      sliceSegments.some((s) => s.termStart === from),
    ),
  );
}

// An event view's placement: a contract's events, dropped unless the event
// DATE lands in the window (the point IS the line item; there is no span to
// clip), then bucketed. A product's share is its share of that same point —
// the date is never re-derived per product.
function eventPlacer(eventsOf: EventsOf, query: SpendEventQuery): Placer {
  const dated: PlaceFn<Placed & { event: SegmentEvent }> = (
    segments,
    contract,
    window,
  ) =>
    eventsOf(segments, contract)
      .filter((event) => event.date >= window.start && event.date < window.end)
      .map((event) => ({
        event,
        period: bucketKey(event.date, query.granularity, query.fiscalConfig),
        value: event.total,
      }));

  return {
    total: dated,
    byProduct: (segments, contract, window) =>
      dated(segments, contract, window).flatMap(({ event, period }) =>
        [...event.byProduct].map(([productId, value]) => ({
          period,
          productId,
          value,
        })),
      ),
  };
}

// Beyond the shared axes an event view supplies nothing but its own event
// derivation — and, for commitments, a per-contract horizon.
//
// Every event is term-valued, so under the 'base' policy all three views take
// the aggregate rule: convert at the term's START date. Conversion decorates
// the placer, i.e. it happens to the SEGMENTS before any event is built, so
// term totals, per-product shares and the cancel-by deadline paths all inherit
// converted fees without restating the rule.
function eventResult(
  contracts: SpendContractInput[],
  query: SpendEventQuery,
  lineage: SpendLineage,
  options: SpendQueryOptions,
  eventsOf: EventsOf,
  horizonOf?: HorizonOf,
): SpendEventResult {
  const placer = eventPlacer(eventsOf, query);
  const { currency } = query;
  return {
    currency,
    items: runPipeline(
      contracts,
      query,
      lineage,
      options,
      currency.mode === 'base'
        ? withTermStartConversion(placer, currency)
        : placer,
      horizonOf,
    ),
  };
}

/**
 * Event view: one event per renewal-term start inside the window, valued at
 * the FULL incoming term (a 24-month renewal term is one event worth 2× the
 * annual fee, not two events). Terms are read from the resolver's `termStart`
 * stamps, so every projection rule — One-Time / will-not-renew emit nothing,
 * inactive contracts stop at their recorded end, superseded contracts project
 * nothing past their cutoff, #1594 hint years project per cycle — is
 * inherited, never re-derived. Replaces extractRenewalsData; the legacy
 * cancel-by-date event positioning is a surface overlay decided at the chart
 * port, not engine semantics.
 */
export function queryRenewals(
  contracts: SpendContractInput[],
  query: SpendEventQuery,
  lineage: SpendLineage = EMPTY_LINEAGE,
  options: SpendQueryOptions = {},
): SpendEventResult {
  assertGroupableCurrency(query, 'queryRenewals');
  return eventResult(contracts, query, lineage, options, (segments) =>
    eventsByTermStart(
      segments.filter((s) => s.source === 'renewal-projection'),
    ),
  );
}

// 'new' is strictly the slice that BEGINS a recorded term; under 'annual'
// valuation the later year-slices of a signed multi-year term are
// 'multi-year' — recurring, pre-committed years, not new signings (product
// decision 2026-08-04: S&P #3024's year-2 slice showed a "New" badge). The
// chart stacks multi-year with renewals — both are recurring — and the
// popover badge tells them apart.
export type CommitmentKind = 'new' | 'multi-year' | 'renewal';

export interface SpendCommitmentItem extends SpendLineItem {
  kind: CommitmentKind;
}

export interface SpendCommitmentResult {
  currency: CurrencyPolicy;
  items: SpendCommitmentItem[];
}

// The contract's own notice period, else one inherited from a linked MSA
// (psk-1855) — 84% of service orders with an MSA parent record none of their
// own, so without the fallback their renewals recognize at term start and the
// deadline the contracts table shows is not the one spend math uses.
export function cancelByOffsetDays(
  contract: SpendContractInput,
  lineage: SpendLineage = EMPTY_LINEAGE,
): number {
  const offsetDays = contract.cancel_by_date;
  if (typeof offsetDays === 'number' && offsetDays > 0) return offsetDays;
  const inherited = lineage.parentNoticeDays.get(contract.id);
  return typeof inherited === 'number' && inherited > 0 ? inherited : 0;
}

// A renewal is RECOGNIZED on its ACTION date — the day the decision had to be
// made, which is when the org became bound. Where a cancel-by offset exists
// that is the deadline (outgoing term end minus the offset); where none does,
// there is no decision window to speak of, so the event sits on the first day
// of the NEW term. NEW commitments are always dated at their own term start —
// an initial signing has no preceding cancel window to act within.
function recognitionDate(
  termStart: Date,
  contract: SpendContractInput,
  lineage: SpendLineage,
): Date {
  const offsetDays = cancelByOffsetDays(contract, lineage);
  return offsetDays > 0 ? addUTCDays(termStart, -1 - offsetDays) : termStart;
}

// Recognition shifts a renewal's event EARLIER than its term start, so a term
// starting just past the window end can still recognize inside the window —
// the projection horizon needs that contract's cancel-by offset as headroom
// or the event silently vanishes at the window boundary (ICE #3047's Oct
// recognition of a Jan term). Callers keying a derivation cache for
// queryCommitments must use this same horizon.
export function commitmentHorizonEnd(
  contract: SpendContractInput,
  windowEnd: Date,
  lineage: SpendLineage = EMPTY_LINEAGE,
): Date {
  const offsetDays = cancelByOffsetDays(contract, lineage);
  return offsetDays > 0 ? addUTCDays(windowEnd, offsetDays + 1) : windowEnd;
}

/**
 * Commitment view: one event per commitment the org became bound to. Kind
 * derives from segment source plus term position — non-projection segments ARE
 * the recorded commitment ('new' for the slice that begins the term,
 * 'multi-year' for later slices of it; see CommitmentKind), projections are
 * 'renewal'. Projected renewals bucket at their
 * RECOGNITION date (see recognitionDate). Recorded renewal entries beyond the
 * first term are re-derived as projections today; the snap-to-recorded
 * refinement is a recorded follow-up, not this query's job.
 *
 * `valuation` decides what a multi-year term is worth in the year it is signed:
 * - 'term'   — the FULL committed total lands at the term start (total
 *              obligation; a 36-month deal shows all three years at once)
 * - 'annual' — each 12-month slice lands in its own year (run-rate; keeps a
 *              Commitments bar comparable to Amortized and Actual)
 * Both conserve the same money across enough windows; they differ only in WHEN
 * a multi-year term is recognised. A lineage-truncated span yields a
 * correspondingly scaled value either way.
 *
 * `recognition` decides what a renewal event is DATED at:
 * - 'cancel-by'  (default) — the deadline the decision had to be made by,
 *                where an offset exists (see recognitionDate)
 * - 'term-start' — every event sits on its own cycle start. Under 'annual'
 *                valuation this is psk-1844's Contract Term placement,
 *                identical to basis:'committed' (equivalence is test-pinned) —
 *                the same numbers as the committed table columns, with the
 *                new/renewal split kept for display.
 */
export type CommitmentValuation = 'term' | 'annual';
export type CommitmentRecognition = 'cancel-by' | 'term-start';

export function queryCommitments(
  contracts: SpendContractInput[],
  query: SpendEventQuery & {
    valuation?: CommitmentValuation;
    recognition?: CommitmentRecognition;
  },
  lineage: SpendLineage = EMPTY_LINEAGE,
  options: SpendQueryOptions = {},
): SpendCommitmentResult {
  assertGroupableCurrency(query, 'queryCommitments');
  const eventsOf =
    query.valuation === 'annual' ? eventsBySegmentStart : eventsByTermStart;
  const shiftsToDeadline = query.recognition !== 'term-start';
  // Horizon padding exists only so deadline-shifted events cannot vanish at
  // the window boundary; term-start dating never shifts, so it keeps the
  // plain window end (and shares derivation-cache entries with the spend
  // kinds). Every pass uses the SAME horizon so a shared caching resolver
  // sees ONE consistent derivation per contract.
  const horizonOf = shiftsToDeadline ? commitmentHorizonEnd : undefined;
  const recordedEvents = (segments: FeeSegment[]) =>
    eventsOf(segments.filter((s) => s.source !== 'renewal-projection'));

  // The three kinds are three passes over the same pipeline: same window, same
  // horizon, different slices of the same events.
  const pass = (kind: CommitmentKind, events: EventsOf) =>
    eventResult(
      contracts,
      query,
      lineage,
      options,
      events,
      horizonOf,
    ).items.map((item) => ({ ...item, kind }));

  return {
    currency: query.currency,
    items: [
      ...pass('new', (segments) =>
        recordedEvents(segments).filter((e) => e.isTermStart),
      ),
      ...pass('multi-year', (segments) =>
        recordedEvents(segments).filter((e) => !e.isTermStart),
      ),
      ...pass('renewal', (segments, contract) => {
        const events = eventsOf(
          segments.filter((s) => s.source === 'renewal-projection'),
        );
        if (!shiftsToDeadline) return events;
        // Only the slice that BEGINS a term recognises at the cancel-by
        // deadline; later slices of a multi-year term are continuations and
        // stay on their own dates.
        return events.map((event) =>
          event.isTermStart
            ? { ...event, date: recognitionDate(event.date, contract, lineage) }
            : event,
        );
      }),
    ],
  };
}

/**
 * Stock view: a contract's total committed obligation (every non-projected
 * segment — year entries, amendments), bucketed at its committed end date
 * (the day before the last segment's exclusive `to`). Renewal projections
 * never count toward TCV; a superseded contract's truncated segments yield a
 * correspondingly scaled TCV at its cutoff. Replaces extractTCVData.
 */
export function queryTCV(
  contracts: SpendContractInput[],
  query: SpendEventQuery,
  lineage: SpendLineage = EMPTY_LINEAGE,
  options: SpendQueryOptions = {},
): SpendEventResult {
  assertGroupableCurrency(query, 'queryTCV');
  return eventResult(contracts, query, lineage, options, (segments) => {
    const committed = segments.filter((s) => s.source !== 'renewal-projection');
    if (committed.length === 0) return [];
    const lastTo = committed.reduce(
      (max, s) => (s.to > max ? s.to : max),
      committed[0].to,
    );
    return [
      eventFromSegments(addUTCDays(parseUTCDate(lastTo), -1), committed, true),
    ];
  });
}
