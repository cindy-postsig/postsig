import { isInvoiceType } from '@/app/lib/constants';
import type {
  AllocationEmployee,
  ResolvedContractAllocation,
  ResolvedScope,
} from '@/lib/v2/cost-allocation/types';
import type {
  FeeSegment,
  SegmentResolver,
  SpendContractInput,
  SpendLineItem,
} from '@/lib/v2/spend';
import {
  mergeLineItems,
  segmentMemoKey,
  segmentSpanMonths,
  toCents,
} from '@/lib/v2/spend';
import {
  addUTCDays,
  addUTCMonths,
  formatUTCDate,
  parseUTCDate,
} from '@/lib/v2/spend/dates';
import {
  SID_ENTITLEMENTS_PRODUCT_NAME,
  SID_ROLLUP_PRODUCT_NAME,
  sidRollupKey,
} from './keys';
import { sidKey, type SidExchangeFeeLine, type SidSeatSource } from './report';
import {
  SID_RENEWAL_TERM_MONTHS,
  currencyLabel,
  nextSidRenewalDate,
} from './transforms';

/** One observed subscription period: its end date and the price it ran at. */
export interface SidSeatTerm {
  /** `yyyy-MM-dd`; the period ends here and the next one begins. */
  renewalDate: string;
  monthlyPrice: number;
}

/** One imported month's exchange-entitlement charges for a seat. */
export interface SidSeatExchange {
  /** `yyyy-MM-dd`, first of the report's activity month. */
  reportMonth: string;
  monthlyExchangeCost: number;
}

/** One exchange the seat is entitled to, with its share of that month's fee. */
export interface SidSeatEntitlement {
  exchangeCode: string;
  exchangeName: string;
  monthlyCost: number;
}

/**
 * One terminal seat as the spend engine reads it, assembled across every
 * imported report the query window can see. A seat's price belongs to its
 * TERM and changes only at renewal, so the reports are observations of terms
 * rather than of months; the exchange charges are the one figure that really
 * does move month to month. Seats are the engine's line items; the account
 * (cust_num) they bill under plays the contract.
 */
export interface SidSeat {
  vendorId: number;
  custNum: number;
  accountName: string;
  /** Uppercase ISO code of the billing account. */
  currency: string;
  sid: number;
  sidInstNum: number;
  gptt: number;
  gpttDescription: string;
  /** From the latest report the seat appears in. */
  lastUser: string;
  /** The vendor's own flag: nobody used the terminal in the last 90 days. */
  ninetyDay: boolean;
  /** `yyyy-MM-dd`, from the latest report the seat appears in. */
  contractDate: string;
  /** One per distinct observed renewal date, ascending; never empty. */
  terms: SidSeatTerm[];
  /** One per report the seat appears in, ascending. */
  exchange: SidSeatExchange[];
  /** From the latest report the seat appears in; sorted by exchange code. */
  entitlements: SidSeatEntitlement[];
  /**
   * The month of the last report the seat appears in, when that is not the
   * latest report loaded — the terminal is gone and books nothing after it.
   * null while the seat is still live.
   */
  lastReportMonth: string | null;
}

// Mirrors the handler's SpendRef: seat refs merge into the same map.
export interface SidSpendRef {
  label: string;
  vendorDomain?: string;
  productName?: string;
  vendorId?: number;
  productId?: number;
}

const SEAT_INSTANCE_RADIX = 1000;
const MONTHS_PER_SLICE = 12;
// A seat projects exactly one renewal term past its renewal date and nothing
// beyond it.
const RENEWAL_TERM_MONTHS = SID_RENEWAL_TERM_MONTHS;
/**
 * Product's estimate for the seat price step at renewal, read off the sample
 * (2215 → 2360 on the March renewals). An estimate, not a contract term, so
 * every surface that shows a projected figure says so. Held in percent so the
 * figure prints as typed; the multiplier is derived. Exchange charges are
 * passed through at cost and do not step.
 */
export const SID_RENEWAL_INCREASE_PERCENT = 6.5;
const RENEWED_PRICE_MULTIPLIER = 1 + SID_RENEWAL_INCREASE_PERCENT / 100;

/**
 * Negative ids keep SID keys out of the contract id space: the engine groups
 * and memoizes by `contract.id`, and a real contract row can never be
 * negative. An account's id is its Bloomberg customer number; a seat's is its
 * (sid, instance) pair folded into one number.
 *
 * A seat carries TWO engine products — the terminal and its exchange
 * entitlements — so the ids form two blocks: seat products fill
 * `-[0, SEAT_ID_SPACE)` and each seat's exchange product sits one whole block
 * below its own seat id. Bloomberg SIDs are nine digits at most, so the seat
 * block cannot overflow into the exchange block, and neither can meet the
 * account ids (`-cust_num`, eight digits) the contract keys use.
 */
export const sidContractId = (custNum: number): number => -custNum;

const SEAT_ID_SPACE = 1e13;

export function sidSeatProductId(seat: {
  sid: number;
  sidInstNum: number;
}): number {
  const { sid, sidInstNum } = seat;
  if (
    !Number.isInteger(sidInstNum) ||
    sidInstNum < 0 ||
    sidInstNum >= SEAT_INSTANCE_RADIX
  ) {
    throw new RangeError(
      `SID ${sid} instance ${sidInstNum} is outside the seat id space (0-${SEAT_INSTANCE_RADIX - 1})`,
    );
  }
  const id = sid * SEAT_INSTANCE_RADIX + sidInstNum;
  if (!Number.isInteger(sid) || sid < 0 || id >= SEAT_ID_SPACE) {
    throw new RangeError(
      `SID ${sid} is outside the seat id space (0-${SEAT_ID_SPACE / SEAT_INSTANCE_RADIX - 1})`,
    );
  }
  return -id;
}

/** The exchange product paired with a seat's price product. */
export const sidExchangeProductIdFor = (seatProductId: number): number =>
  seatProductId - SEAT_ID_SPACE;

export function sidSeatExchangeProductId(seat: {
  sid: number;
  sidInstNum: number;
}): number {
  return sidExchangeProductIdFor(sidSeatProductId(seat));
}

function entitlementsBySeat(
  fees: SidSeatSource['fees'],
  feeLines: SidExchangeFeeLine[],
): Map<string, SidSeatEntitlement[]> {
  const exchangeFees = new Map(
    fees
      .filter((fee) => fee.feeKind === 'exchange')
      .map((fee) => [fee.id, fee]),
  );
  const bySeat = new Map<string, SidSeatEntitlement[]>();
  for (const line of feeLines) {
    const fee = exchangeFees.get(line.feeId);
    if (!fee || line.proRate === null) continue;
    const key = sidKey(line.sid, line.sidInstNum);
    const entitlement = {
      exchangeCode: fee.exchangeCode,
      exchangeName: fee.exchangeName,
      monthlyCost: line.proRate,
    };
    const list = bySeat.get(key);
    if (list) list.push(entitlement);
    else bySeat.set(key, [entitlement]);
  }
  for (const list of bySeat.values()) {
    list.sort((a, b) => a.exchangeCode.localeCompare(b.exchangeCode));
  }
  return bySeat;
}

const entitlementsCost = (entitlements: SidSeatEntitlement[]): number =>
  toCents(entitlements.reduce((sum, e) => sum + e.monthlyCost, 0));

/**
 * One seat per (sid, instance) across the given reports, oldest first. Each
 * report contributes an observation of the term in force that month and its
 * own exchange charges; the latest report a seat appears in supplies the
 * identity fields, and a seat missing from the newest report is stamped with
 * the last month it was seen in.
 */
export function buildSidSeats(
  vendorId: number,
  sources: SidSeatSource[],
): SidSeat[] {
  const seats = new Map<string, SidSeat>();
  const priceByTerm = new Map<string, Map<string, number>>();
  const latestReportMonth = sources[sources.length - 1]?.reportMonth;

  for (const source of sources) {
    const accountsByCustNum = new Map(
      source.accounts.map((account) => [account.custNum, account]),
    );
    const exchangeBySeat = entitlementsBySeat(source.fees, source.feeLines);

    for (const sub of source.subscriptions) {
      const key = sidKey(sub.sid, sub.sidInstNum);
      const account = accountsByCustNum.get(sub.custNum);
      const existing = seats.get(key);
      const seat: SidSeat = {
        vendorId,
        custNum: sub.custNum,
        accountName: account?.name ?? String(sub.custNum),
        currency: currencyLabel(account?.currencyCode ?? 'D').toUpperCase(),
        sid: sub.sid,
        sidInstNum: sub.sidInstNum,
        gptt: sub.gptt,
        gpttDescription: sub.gpttDescription,
        lastUser: sub.lastUser,
        ninetyDay: sub.ninetyDay,
        contractDate: sub.contractDate,
        terms: [],
        exchange: existing?.exchange ?? [],
        entitlements: exchangeBySeat.get(key) ?? [],
        lastReportMonth:
          source.reportMonth === latestReportMonth ? null : source.reportMonth,
      };
      seat.exchange.push({
        reportMonth: source.reportMonth,
        monthlyExchangeCost: entitlementsCost(seat.entitlements),
      });
      seats.set(key, seat);

      // A term's price is fixed for its whole period, so the latest report
      // that observed a renewal date is the one whose price stands.
      const terms = priceByTerm.get(key) ?? new Map<string, number>();
      terms.set(sub.renewalDate, sub.price);
      priceByTerm.set(key, terms);
    }
  }

  return [...seats].map(([key, seat]) => ({
    ...seat,
    terms: [...(priceByTerm.get(key) ?? new Map())]
      .map(([renewalDate, monthlyPrice]) => ({ renewalDate, monthlyPrice }))
      .sort((a, b) => a.renewalDate.localeCompare(b.renewalDate)),
  }));
}

const latestTerm = (seat: SidSeat): SidSeatTerm =>
  seat.terms[seat.terms.length - 1];

/** The seat's price once it renews; exchange charges pass through at cost. */
const renewedMonthlyPrice = (monthlyPrice: number): number =>
  toCents(monthlyPrice * RENEWED_PRICE_MULTIPLIER);

const monthStart = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const earlier = (a: Date, b: Date): Date => (a < b ? a : b);
const later = (a: Date, b: Date): Date => (a > b ? a : b);

/**
 * Where the seat stops booking: the end of the month it was last seen in when
 * it has dropped out of the reports, otherwise the end of the one projected
 * renewal term.
 */
function seatEnd(seat: SidSeat): Date {
  if (seat.lastReportMonth !== null) {
    return addUTCMonths(parseUTCDate(seat.lastReportMonth), 1);
  }
  return addUTCMonths(
    parseUTCDate(latestTerm(seat).renewalDate),
    RENEWAL_TERM_MONTHS,
  );
}

function feeSegment(input: {
  seat: SidSeat;
  productId: number;
  from: Date;
  to: Date;
  monthlyRate: number;
  source: FeeSegment['source'];
  termStart: Date;
}): FeeSegment {
  const fromIso = formatUTCDate(input.from);
  const inclusiveEnd = formatUTCDate(addUTCDays(input.to, -1));
  const projected = input.source === 'renewal-projection';
  const segment: FeeSegment = {
    productId: input.productId,
    from: fromIso,
    to: formatUTCDate(input.to),
    fee: toCents(input.monthlyRate * segmentSpanMonths(fromIso, inclusiveEnd)),
    currency: input.seat.currency,
    source: input.source,
    confidence: projected ? 'inferred' : 'explicit',
    termStart: formatUTCDate(input.termStart),
  };
  if (projected) {
    segment.reason = `one two-year renewal term projected past the renewal date at an estimated ${SID_RENEWAL_INCREASE_PERCENT}% seat price increase`;
  }
  return segment;
}

/**
 * A term cut into 12-month slices walked BACK from its own renewal date, so
 * the recorded and projected boundaries stay on one cadence and the first
 * slice absorbs any remainder. Steps are taken from the anchor rather than
 * from the previous boundary so a month-end date cannot drift (the engine's
 * own addUTCMonths caveat). Only slices overlapping the window are built: a
 * terminal contracted in 2000 has twenty-six years no query window can see.
 */
function termSlices(
  renewal: Date,
  termStart: Date,
  horizonStart: Date,
  horizonEnd: Date,
): Array<{ from: Date; to: Date }> {
  const slices: Array<{ from: Date; to: Date }> = [];
  let end = renewal;
  for (let step = 1; end > termStart && end > horizonStart; step += 1) {
    const stepBack = addUTCMonths(renewal, -MONTHS_PER_SLICE * step);
    const from = stepBack > termStart ? stepBack : termStart;
    if (from < horizonEnd) slices.unshift({ from, to: end });
    end = from;
  }
  return slices;
}

/**
 * The seat price product: one 12-month cadence per OBSERVED term, each walked
 * back from its own renewal date to the previous term's (the earliest term
 * reaches back to the contract date), then one two-year renewal term at the
 * estimated stepped price. Every figure assumes the seat renews — product
 * ruling: a terminal is cut only when its holder leaves — so current spend
 * does not fall off at a renewal date. Each slice's fee is its price times its
 * own span, so amortized and actual read the monthly price back out and the
 * committed basis books one year per fiscal year.
 */
function seatPriceSegments(
  seat: SidSeat,
  horizonStart: Date,
  horizonEnd: Date,
): FeeSegment[] {
  const productId = sidSeatProductId(seat);
  const end = seatEnd(seat);
  const segments: FeeSegment[] = [];

  const emit = (
    from: Date,
    to: Date,
    monthlyRate: number,
    source: FeeSegment['source'],
    termStart: Date,
  ) => {
    const clipped = earlier(to, end);
    if (monthlyRate === 0 || clipped <= from) return;
    if (clipped <= horizonStart || from >= horizonEnd) return;
    segments.push(
      feeSegment({
        seat,
        productId,
        from,
        to: clipped,
        monthlyRate,
        source,
        termStart,
      }),
    );
  };

  let termStart = parseUTCDate(seat.contractDate);
  for (const term of seat.terms) {
    const renewal = parseUTCDate(term.renewalDate);
    for (const slice of termSlices(
      renewal,
      termStart,
      horizonStart,
      horizonEnd,
    )) {
      emit(slice.from, slice.to, term.monthlyPrice, 'year-entry', termStart);
    }
    termStart = later(termStart, renewal);
  }

  if (seat.lastReportMonth !== null) return segments;

  const renewal = parseUTCDate(latestTerm(seat).renewalDate);
  const monthlyRate = renewedMonthlyPrice(latestTerm(seat).monthlyPrice);
  const projectionEnd = earlier(end, horizonEnd);
  let from = renewal;
  for (let step = 1; from < projectionEnd; step += 1) {
    const to = addUTCMonths(renewal, MONTHS_PER_SLICE * step);
    emit(from, to, monthlyRate, 'renewal-projection', renewal);
    from = to;
  }
  return segments;
}

/**
 * The exchange product: entitlements are a monthly pass-through, never a
 * commitment, so they are one one-month segment per calendar month the seat is
 * live. A month with a report takes that report's pro-rates, a month without
 * one takes the previous report's, and a month before the first import takes
 * the earliest report's — which is also why months after the latest import
 * carry the latest report's charges. Nothing renews: the pass-through never
 * steps.
 */
function seatExchangeSegments(
  seat: SidSeat,
  horizonStart: Date,
  horizonEnd: Date,
): FeeSegment[] {
  if (seat.exchange.length === 0) return [];
  const productId = sidSeatExchangeProductId(seat);
  const end = earlier(seatEnd(seat), horizonEnd);
  const segments: FeeSegment[] = [];

  let month = later(
    monthStart(parseUTCDate(seat.contractDate)),
    monthStart(horizonStart),
  );
  for (; month < end; month = addUTCMonths(month, 1)) {
    const monthlyRate = exchangeCostAt(seat, formatUTCDate(month));
    if (monthlyRate === 0) continue;
    segments.push(
      feeSegment({
        seat,
        productId,
        from: month,
        to: addUTCMonths(month, 1),
        monthlyRate,
        source: 'year-entry',
        termStart: month,
      }),
    );
  }
  return segments;
}

function exchangeCostAt(seat: SidSeat, month: string): number {
  let cost = seat.exchange[0].monthlyExchangeCost;
  for (const entry of seat.exchange) {
    if (entry.reportMonth > month) break;
    cost = entry.monthlyExchangeCost;
  }
  return cost;
}

/**
 * A seat's fee segments in the engine's own vocabulary, so every basis buckets
 * a seat the way it buckets a contract: the terminal's price as dated terms,
 * its exchange entitlements as dated months, both bounded to
 * `[horizonStart, horizonEnd)`. Each emitted slice keeps its TRUE start —
 * clipping it to the window would move the fiscal year the committed basis
 * books it in.
 */
export function sidSeatSegments(
  seat: SidSeat,
  horizonStart: Date,
  horizonEnd: Date,
): FeeSegment[] {
  return [
    ...seatPriceSegments(seat, horizonStart, horizonEnd),
    ...seatExchangeSegments(seat, horizonStart, horizonEnd),
  ];
}

function seatsByContract(seats: SidSeat[]): Map<number, SidSeat[]> {
  const byContract = new Map<number, SidSeat[]>();
  for (const seat of seats) {
    const id = sidContractId(seat.custNum);
    const group = byContract.get(id);
    if (group) group.push(seat);
    else byContract.set(id, [seat]);
  }
  return byContract;
}

/**
 * One engine input per billing account. The fee rows exist so the shape is
 * honest (two products per seat, priced at their latest annual run-rate); the
 * segments the engine actually places come from `sidSegmentResolver`, which
 * reads the seats directly rather than re-deriving them from these rows.
 */
export function sidSpendContracts(seats: SidSeat[]): SpendContractInput[] {
  return [...seatsByContract(seats).entries()].map(([id, accountSeats]) => ({
    id,
    vendor_id: accountSeats[0].vendorId,
    status: 'active',
    currency: accountSeats[0].currency,
    billing_frequency: 'monthly',
    term_start_date: [
      {
        date: accountSeats
          .map((seat) => seat.contractDate)
          .reduce((earliest, date) => (date < earliest ? date : earliest)),
      },
    ],
    vendor_products_details: accountSeats.flatMap((seat) => [
      {
        product_id: sidSeatProductId(seat),
        year: 1,
        fees: toCents(latestTerm(seat).monthlyPrice * MONTHS_PER_SLICE),
      },
      {
        product_id: sidSeatExchangeProductId(seat),
        year: 1,
        fees: toCents(
          (seat.exchange[seat.exchange.length - 1]?.monthlyExchangeCost ?? 0) *
            MONTHS_PER_SLICE,
        ),
      },
    ]),
  }));
}

/**
 * The resolver for SID inputs: explicit seat periods need none of the
 * contract resolver's term inference, so the engine's `resolveSegments` seam
 * takes this instead. Lineage is ignored — seats have no supersession.
 */
export function sidSegmentResolver(seats: SidSeat[]): SegmentResolver {
  const byContract = seatsByContract(seats);
  // Seat segments are bounded to the window, so the engine's shared memo key
  // — which deliberately leaves `horizonStart` out — is not enough on its own.
  const memo = new Map<string, FeeSegment[]>();
  return (contract, _lineage, options) => {
    const key = `${segmentMemoKey(contract, options)}|${options.horizonStart.getTime()}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const segments = (byContract.get(contract.id) ?? []).flatMap((seat) =>
      sidSeatSegments(seat, options.horizonStart, options.horizonEnd),
    );
    memo.set(key, segments);
    return segments;
  };
}

/**
 * Every seat is its own product-scoped allocation — one scope for the terminal
 * and one for its exchange entitlements: 100% to the employee its `last_user`
 * matched, or no lines at all — the engine's `unassigned` bucket — for
 * leavers, proxies and shared accounts the roster cannot place. A departed
 * employee still receives the seat: the charge is real, and the report marks
 * the person stale rather than hiding the money.
 */
export function sidAllocations(
  seats: SidSeat[],
  employeeOf: (lastUser: string) => AllocationEmployee | undefined,
): Map<number, ResolvedContractAllocation> {
  const resolved = new Map<number, ResolvedContractAllocation>();
  for (const [contractId, accountSeats] of seatsByContract(seats)) {
    const scopes: ResolvedScope[] = accountSeats.flatMap((seat) => {
      const employee = employeeOf(seat.lastUser);
      const lines = employee
        ? [
            {
              target: {
                kind: 'employee' as const,
                id: employee.id,
                name: employee.name,
                orgUnitId: employee.org_unit_id,
                costCenterUnitId: employee.cost_center_unit_id,
              },
              percent: 100,
            },
          ]
        : [];
      return [sidSeatProductId(seat), sidSeatExchangeProductId(seat)].map(
        (productId) => ({
          productId,
          mode: 'manual' as const,
          sourceContractId: contractId,
          lines,
          unlinkedUserCount: 0,
        }),
      );
    });
    resolved.set(contractId, { contractId, scopes });
  }
  return resolved;
}

/** Display metadata for the engine's vendor, contract and product keys. */
export function sidSpendRefs(
  seats: SidSeat[],
  vendor: { id: number; name: string; domain?: string | null },
): Record<string, SidSpendRef> {
  const vendorDomain = vendor.domain ?? undefined;
  const refs: Record<string, SidSpendRef> = {
    [String(vendor.id)]: { label: vendor.name, vendorDomain },
  };
  for (const seat of seats) {
    const contractKey = String(sidContractId(seat.custNum));
    refs[contractKey] ??= {
      label: vendor.name,
      vendorDomain,
      productName: `Bloomberg SID · ${seat.accountName}`,
      vendorId: vendor.id,
    };
    // A seat is a terminal of a Bloomberg product (its gptt), so the product
    // identity a rollup merges on is the gptt, not the per-seat engine id.
    // Its exchange entitlements stay their own engine line — priced on their
    // own rules — but carry the terminal's product identity, so a vendor
    // list or a rollup folds them into the product they ride on.
    refs[`${contractKey}:${sidSeatProductId(seat)}`] = {
      label: `${seat.gpttDescription} · ${seat.lastUser}`,
      vendorDomain,
      productName: seat.gpttDescription,
      vendorId: vendor.id,
      productId: seat.gptt,
    };
    refs[`${contractKey}:${sidSeatExchangeProductId(seat)}`] = {
      label: `${SID_ENTITLEMENTS_PRODUCT_NAME} · ${seat.lastUser}`,
      vendorDomain,
      productName: seat.gpttDescription,
      vendorId: vendor.id,
      productId: seat.gptt,
    };
  }
  return refs;
}

/**
 * Contract-grouped items re-keyed so every billing account of a vendor lands
 * in one `bloomberg:<vendorId>` bucket per period: the surfaces that group by
 * contract (the spend chart's bar popover) asked for one Bloomberg line, not
 * one per account. Seat account keys are the negative ids the refs carry a
 * vendor for; every other item passes through untouched, and the merge keeps
 * the accumulator's own rules for sums and native denominations.
 */
export function collapseSidLineItems<T extends SpendLineItem>(
  items: T[],
  refs: Record<string, SidSpendRef>,
): { items: T[]; refs: Record<string, SidSpendRef> } {
  const rollupRefs: Record<string, SidSpendRef> = {};
  const rekeyed = items.map((item) => {
    const ref = refs[item.groupKey];
    const vendorId = ref?.vendorId;
    if (vendorId === undefined || !(Number(item.groupKey) < 0)) return item;
    const key = sidRollupKey(vendorId);
    rollupRefs[key] ??= {
      label: ref.label,
      vendorDomain: ref.vendorDomain,
      productName: SID_ROLLUP_PRODUCT_NAME,
      vendorId,
    };
    return { ...item, groupKey: key };
  });
  if (Object.keys(rollupRefs).length === 0) return { items, refs };
  return {
    items: mergeLineItems([rekeyed]) as T[],
    refs: { ...refs, ...rollupRefs },
  };
}

/**
 * A SID-covered vendor's invoices are the bills for the seats, so a surface
 * that shows the seats leaves them out rather than counting the money twice
 * (product ruling 2026-09-04).
 */
export function isSidVendorInvoice(
  contract: {
    vendor_id?: number | null;
    contract: { type_id?: number | null };
  },
  sidVendorIds: ReadonlySet<number>,
): boolean {
  return (
    isInvoiceType(contract.contract.type_id) &&
    contract.vendor_id != null &&
    sidVendorIds.has(contract.vendor_id)
  );
}

/** The seat's price once it renews, for surfaces that quote the next term. */
export const sidRenewedMonthlyPrice = renewedMonthlyPrice;

/** The next date the seat renews on or after `today`, off its latest observed term. */
export function sidNextRenewalDate(seat: SidSeat, today: Date): string {
  return nextSidRenewalDate(latestTerm(seat).renewalDate, today);
}

/**
 * A seat that dropped out of the reports before `date`: the loader reads
 * the last report before a window to know the term in force, and a seat only
 * that older report knows books nothing inside the window.
 */
export function sidSeatGoneBefore(seat: SidSeat, date: Date): boolean {
  return (
    seat.lastReportMonth !== null &&
    addUTCMonths(parseUTCDate(seat.lastReportMonth), 1) <= date
  );
}
