/**
 * FROZEN SNAPSHOT — do not edit, do not import outside the shadow harness.
 *
 * The legacy price-history rollup exactly as it was deleted at the 5.2.5
 * engine port (see docs/spend-engine-progress.md), kept as the comparison
 * oracle for scripts/price-history-shadow-diff.ts — including its known
 * invoice-cutoff bug (linked invoice children truncate their parents),
 * which the diff exists to demonstrate. Regenerate from git history if it
 * ever drifts:
 *   git show <pre-port-sha>:app/lib/budget/priceHistorySummary.ts
 *   (then relativize the '@/' imports as below)
 */
import { parseISO } from 'date-fns';
import { generatePriceHistory } from '../app/lib/budget/priceHistoryCalculator';
import { hasFeeOverrides } from '../lib/v2/products/transforms';
import type {
  Contract,
  PriceHistory,
  PricePeriod,
} from '../app/lib/budget/types';
import type { ContractWithPricing } from '../lib/v2/core/types';

export interface PeriodSummary {
  label: string;
  fees: number;
  status: 'historical' | 'current' | 'projected';
}

export interface ProductContractDetail {
  contractId: number;
  contractType: string;
  isArchived: boolean;
  renewalPercent: number | null;
  periods: { label: string; fees: number }[];
  amendsContractId?: number;
  amendsContractType?: string;
}

export interface ProductPriceSummary {
  productId: string | number;
  productName: string;
  renewalPercent: number | null;
  periods: { label: string; fees: number }[];
  contracts: ProductContractDetail[];
}

export interface VendorPriceSummary {
  vendorId?: number;
  vendorName: string;
  vendorDomain?: string;
  contractCount: number;
  currency: string;
  currentACV: number;
  renewalPercent: number | null;
  periods: PeriodSummary[];
  products: ProductPriceSummary[];
}

/** Invoices are excluded from price-history aggregation. */
export const CONTRACT_TYPE_INVOICE = 6;

/**
 * Build per-(contract, product) cutoff dates by walking the family chain.
 *
 * A "family" is `(product_id, sourceContractId)` — every contract that
 * carries the same product traced back to the same source. Within each
 * family, members are sorted by their original term_start_date and each
 * non-tail member's cutoff is the next member's original start. This
 * correctly handles chained amendments (parent → amendment → amendment),
 * unlike `product.supersededByContractId` which always points at the
 * *deepest* descendant and would skip intermediate links.
 *
 * The original start (term_start_date[length-1]) is used so a child that
 * has itself been renewed still cuts its predecessor at its true start.
 */
function buildCutoffsByContract(
  enrichedContracts: ContractWithPricing[],
  originalStartByContractId: Map<number, Date>,
): Map<number, Map<string | number, Date>> {
  type Member = {
    contractId: number;
    productId: string | number;
    originalStart: Date;
    // Tie-breaker when family members share the same start date — source
    // contracts (isSuperseding=false) come before their amendments so the
    // source is the one that gets cut. We deliberately don't carry
    // `isSuperseded`: that flag is also set by lineage's
    // `deduplicateSiblingProducts` to pick an arbitrary winner among
    // concurrent siblings, which doesn't reflect a real timeline
    // transition and would wrongly zero out parallel SOWs.
    isSuperseding: boolean;
  };
  const families = new Map<string, Member[]>();

  for (const ec of enrichedContracts) {
    const start = originalStartByContractId.get(ec.id);
    if (!start) continue;
    for (const product of ec.products) {
      const key = `${product.product_id}__${product.sourceContractId}`;
      const list = families.get(key) ?? [];
      list.push({
        contractId: ec.id,
        productId: product.product_id,
        originalStart: start,
        isSuperseding: !!product.isSuperseding,
      });
      families.set(key, list);
    }
  }

  const cutoffs = new Map<number, Map<string | number, Date>>();
  for (const members of families.values()) {
    if (members.length <= 1) continue;
    members.sort((a, b) => {
      const dateDiff = a.originalStart.getTime() - b.originalStart.getTime();
      if (dateDiff !== 0) return dateDiff;
      // Source first (isSuperseding=false before true).
      if (a.isSuperseding !== b.isSuperseding) {
        return a.isSuperseding ? 1 : -1;
      }
      return 0;
    });
    // For each member, the cutoff is the next member that's strictly
    // later by start date OR a real role change (source → amendment).
    // Members tied on both are concurrent siblings — e.g. multiple SOWs
    // under the same MSA signed the same day — and shouldn't cut each
    // other; they each project their own fees in parallel.
    for (let i = 0; i < members.length - 1; i++) {
      const member = members[i];
      const next = members
        .slice(i + 1)
        .find(
          (c) =>
            c.originalStart.getTime() !== member.originalStart.getTime() ||
            c.isSuperseding !== member.isSuperseding,
        );
      if (!next) continue;
      let perContract = cutoffs.get(member.contractId);
      if (!perContract) {
        perContract = new Map();
        cutoffs.set(member.contractId, perContract);
      }
      perContract.set(member.productId, next.originalStart);
    }
  }

  return cutoffs;
}

function truncateSupersededAtChildStart(
  priceHistory: PriceHistory,
  cutoffByProductId: Map<string | number, Date>,
): PriceHistory {
  if (cutoffByProductId.size === 0) return priceHistory;

  const newPeriods = priceHistory.periods.map((period) => {
    const periodStart = parseISO(period.startDate);
    let changed = false;

    const newProductFees = period.productFees.map((pf) => {
      const cutoff = cutoffByProductId.get(pf.productId);
      if (cutoff && periodStart >= cutoff) {
        changed = true;
        return { ...pf, fees: 0, feesUSD: 0 };
      }
      return pf;
    });

    if (!changed) return period;

    const newFees = newProductFees.reduce((s, pf) => s + (pf.fees ?? 0), 0);
    const newFeesUSD = newProductFees.reduce(
      (s, pf) => s + (pf.feesUSD ?? 0),
      0,
    );

    return {
      ...period,
      productFees: newProductFees,
      fees: newFees,
      feesUSD: newFeesUSD,
      ...(period.effectiveFeesUSD != null
        ? { effectiveFeesUSD: newFeesUSD, effectiveFees: newFees }
        : {}),
    };
  });

  return { ...priceHistory, periods: newPeriods };
}

/**
 * Bucket a period's full fee in the calendar year it starts. No proration,
 * no billing-walk. Calendar years where no period starts stay blank — this
 * mirrors the existing actual-cost chart's "one bill on renewal date, empty
 * rest" pattern, just at year granularity. Super-annual periods (e.g. a
 * 17.5mo initial term) also bucket entirely in their start year; the gap
 * year before the next renewal is intentional.
 */
export function distributeFeeAcrossYears(
  fee: number,
  period: PricePeriod,
): Map<string, number> {
  const result = new Map<string, number>();
  if (fee === 0) return result;
  const periodStart = parseISO(period.startDate);
  result.set(String(periodStart.getFullYear()), fee);
  return result;
}

interface VendorAccumulator {
  vendorId?: number;
  vendorName: string;
  vendorDomain?: string;
  currency: string;
  contractIds: Set<number>;
  yearMap: Map<
    string,
    { fees: number; status: 'historical' | 'current' | 'projected' }
  >;
  // Per-product per-contract: key = `${contractId}__${productId}`.
  // Keying by productId (not productName) prevents two distinct products with
  // the same display label on one contract from merging into one series.
  productsByContract: Map<
    string,
    {
      contractId: number;
      productId: string | number;
      productName: string;
      yearMap: Map<string, number>;
    }
  >;
  // For renewal % calculations
  currentTotal: number;
  nextTotal: number;
  hasRenewalData: boolean;
  productRenewals: Map<string, { current: number; next: number }>;
  currentACV: number;
}

function aggregatePriceHistory(
  acc: VendorAccumulator,
  priceHistory: PriceHistory,
): void {
  acc.contractIds.add(priceHistory.id);
  acc.currentACV +=
    priceHistory.annualContractValueUSD ??
    priceHistory.annualContractValue ??
    0;

  for (const period of priceHistory.periods) {
    const periodFee =
      (period as PricePeriod & { effectiveFeesUSD?: number })
        .effectiveFeesUSD ??
      period.feesUSD ??
      period.fees;
    const yearContributions = distributeFeeAcrossYears(periodFee, period);

    for (const [year, fee] of yearContributions) {
      const existing = acc.yearMap.get(year) ?? {
        fees: 0,
        status: period.status,
      };
      existing.fees += fee;
      if (period.isActivePeriod || period.status === 'current') {
        existing.status = 'current';
      } else if (
        period.status === 'projected' &&
        existing.status === 'historical'
      ) {
        existing.status = 'projected';
      }
      acc.yearMap.set(year, existing);
    }

    // Per-product: distribute each product's effective fee across years.
    // Superseded products were already zeroed past their cutoff by
    // truncateSupersededAtChildStart, so they contribute 0 from the child's
    // original start year onward and real values before it.
    for (const pf of period.productFees) {
      const productKey = `${priceHistory.id}__${String(pf.productId)}`;
      let entry = acc.productsByContract.get(productKey);
      if (!entry) {
        entry = {
          contractId: priceHistory.id,
          productId: pf.productId,
          productName: pf.productName,
          yearMap: new Map(),
        };
        acc.productsByContract.set(productKey, entry);
      }
      const productYearContrib = distributeFeeAcrossYears(
        pf.feesUSD ?? pf.fees,
        period,
      );
      for (const [year, fee] of productYearContrib) {
        entry.yearMap.set(year, (entry.yearMap.get(year) ?? 0) + fee);
      }
    }
  }

  // Renewal % from active period to next period
  const activeIdx = priceHistory.periods.findIndex((p) => p.isActivePeriod);
  if (activeIdx >= 0 && activeIdx < priceHistory.periods.length - 1) {
    const activePeriod = priceHistory.periods[activeIdx];
    const nextPeriod = priceHistory.periods[activeIdx + 1];
    const activeFee =
      (activePeriod as PricePeriod & { effectiveFeesUSD?: number })
        .effectiveFeesUSD ??
      activePeriod.feesUSD ??
      activePeriod.fees;
    const nextFee =
      (nextPeriod as PricePeriod & { effectiveFeesUSD?: number })
        .effectiveFeesUSD ??
      nextPeriod.feesUSD ??
      nextPeriod.fees;
    acc.currentTotal += activeFee;
    acc.nextTotal += nextFee;
    acc.hasRenewalData = true;

    for (const pf of activePeriod.productFees) {
      const key = `${priceHistory.id}__${String(pf.productId)}`;
      const entry = acc.productRenewals.get(key) ?? { current: 0, next: 0 };
      entry.current += pf.feesUSD ?? pf.fees;
      acc.productRenewals.set(key, entry);
    }
    for (const pf of nextPeriod.productFees) {
      const key = `${priceHistory.id}__${String(pf.productId)}`;
      const entry = acc.productRenewals.get(key) ?? { current: 0, next: 0 };
      entry.next += pf.feesUSD ?? pf.fees;
      acc.productRenewals.set(key, entry);
    }
  }
}

function buildVendorSummaries(
  enrichedContracts: ContractWithPricing[],
  fiscalYearStartMonth: number,
  contractTypesById: Map<number, string>,
  archivedById: Map<number, boolean>,
  targetYear: number,
  cutoffsByContract: Map<number, Map<string | number, Date>>,
  originalStartByContractId: Map<number, Date>,
): { vendors: VendorPriceSummary[]; periodLabels: string[] } {
  type EnrichedWithMax = {
    contract: Contract;
    priceHistory: PriceHistory;
    vendorName: string;
    vendorDomain?: string;
    currency: string;
  };

  // (contractId, productId) → source contract this row is amending, if any.
  // Sourced from lineage's supersedesProductInContractId, which is the
  // topmost ancestor that carries the same product. Lets us label each
  // amendment row with what it's amending.
  const amendsByContractProduct = new Map<string, number>();
  for (const ec of enrichedContracts) {
    for (const p of ec.products) {
      if (p.supersedesProductInContractId != null) {
        amendsByContractProduct.set(
          `${ec.id}__${p.product_id}`,
          p.supersedesProductInContractId,
        );
      }
    }
  }

  const enriched: EnrichedWithMax[] = enrichedContracts.map((ec) => {
    const contract = ec.contract;
    const feeOverrides = hasFeeOverrides(contract);
    const rawPriceHistory = generatePriceHistory(
      contract,
      fiscalYearStartMonth,
      'max',
      { hasFeeOverrides: feeOverrides, targetYear },
    );
    const cutoffs = cutoffsByContract.get(ec.id) ?? new Map();
    const priceHistory = truncateSupersededAtChildStart(
      rawPriceHistory,
      cutoffs,
    );

    const typeName = contract.contract_types?.name ?? '';
    if (typeName) contractTypesById.set(contract.id, typeName);
    archivedById.set(contract.id, contract.status === 'inactive');

    return {
      contract,
      priceHistory,
      vendorName: priceHistory.vendor,
      vendorDomain: priceHistory.vendorDomain,
      currency: priceHistory.currency ?? 'USD',
    };
  });

  // Key by vendor_id (with vendorName fallback) so distinct vendors sharing
  // a display name—or one vendor renamed across contracts—stay separate.
  const vendorAccumulators = new Map<string, VendorAccumulator>();
  for (const item of enriched) {
    if (item.priceHistory.periods.length === 0) continue;
    const vendorKey =
      item.priceHistory.vendor_id != null
        ? `id:${item.priceHistory.vendor_id}`
        : `name:${item.vendorName}`;
    let acc = vendorAccumulators.get(vendorKey);
    if (!acc) {
      acc = {
        vendorId: item.priceHistory.vendor_id,
        vendorName: item.vendorName,
        vendorDomain: item.vendorDomain,
        currency: item.currency,
        contractIds: new Set(),
        yearMap: new Map(),
        productsByContract: new Map(),
        currentTotal: 0,
        nextTotal: 0,
        hasRenewalData: false,
        productRenewals: new Map(),
        currentACV: 0,
      };
      vendorAccumulators.set(vendorKey, acc);
    }
    aggregatePriceHistory(acc, item.priceHistory);
  }

  const allYears = new Set<string>();
  const vendors: VendorPriceSummary[] = [];

  for (const acc of vendorAccumulators.values()) {
    for (const year of acc.yearMap.keys()) allYears.add(year);

    const periods = Array.from(acc.yearMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, data]) => ({
        label,
        fees: data.fees,
        status: data.status,
      }));

    const renewalPercent =
      acc.hasRenewalData && acc.currentTotal > 0
        ? ((acc.nextTotal - acc.currentTotal) / acc.currentTotal) * 100
        : null;

    // Group per-contract product data by productId for stable cross-contract
    // rollup; productName is preserved for display. Renewal totals are
    // accumulated here so the downstream contracts array doesn't need to
    // carry productId.
    const productGroups = new Map<
      string,
      {
        productId: string | number;
        productName: string;
        contracts: {
          contractId: number;
          contractType: string;
          isArchived: boolean;
          renewalPercent: number | null;
          periods: { label: string; fees: number }[];
          amendsContractId?: number;
          amendsContractType?: string;
        }[];
        prodCurrent: number;
        prodNext: number;
        hasProdRenewal: boolean;
      }
    >();

    for (const [productKey, entry] of acc.productsByContract) {
      const renewal = acc.productRenewals.get(productKey);
      const contractRenewalPercent =
        renewal && renewal.current > 0
          ? ((renewal.next - renewal.current) / renewal.current) * 100
          : null;

      const groupKey = String(entry.productId);
      let group = productGroups.get(groupKey);
      if (!group) {
        group = {
          productId: entry.productId,
          productName: entry.productName,
          contracts: [],
          prodCurrent: 0,
          prodNext: 0,
          hasProdRenewal: false,
        };
        productGroups.set(groupKey, group);
      }
      const amendsContractId = amendsByContractProduct.get(
        `${entry.contractId}__${entry.productId}`,
      );
      group.contracts.push({
        contractId: entry.contractId,
        contractType: contractTypesById.get(entry.contractId) ?? '',
        isArchived: archivedById.get(entry.contractId) ?? false,
        renewalPercent: contractRenewalPercent,
        periods: Array.from(entry.yearMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([label, fees]) => ({ label, fees })),
        amendsContractId,
        amendsContractType:
          amendsContractId != null
            ? contractTypesById.get(amendsContractId)
            : undefined,
      });
      if (renewal && renewal.current > 0) {
        group.prodCurrent += renewal.current;
        group.prodNext += renewal.next;
        group.hasProdRenewal = true;
      }
    }

    const products = Array.from(productGroups.values())
      .map((group) => {
        const {
          productId,
          productName,
          contracts,
          prodCurrent,
          prodNext,
          hasProdRenewal,
        } = group;
        const aggregated = new Map<string, number>();

        for (const c of contracts) {
          for (const p of c.periods) {
            aggregated.set(p.label, (aggregated.get(p.label) ?? 0) + p.fees);
          }
        }

        return {
          productId,
          productName,
          renewalPercent:
            hasProdRenewal && prodCurrent > 0
              ? ((prodNext - prodCurrent) / prodCurrent) * 100
              : null,
          periods: Array.from(aggregated.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([label, fees]) => ({ label, fees })),
          // Chronological by original term_start_date so amendment chains
          // (parent → amendment → amendment) read top-to-bottom in the
          // order each took over. Falls back to contractId for stability
          // if a start date is missing.
          contracts: contracts.sort((a, b) => {
            const aStart = originalStartByContractId.get(a.contractId);
            const bStart = originalStartByContractId.get(b.contractId);
            if (aStart && bStart) {
              const diff = aStart.getTime() - bStart.getTime();
              if (diff !== 0) return diff;
            } else if (aStart) {
              return -1;
            } else if (bStart) {
              return 1;
            }
            return a.contractId - b.contractId;
          }),
        };
      })
      .sort((a, b) => {
        const aLast = a.periods.at(-1)?.fees ?? 0;
        const bLast = b.periods.at(-1)?.fees ?? 0;
        return bLast - aLast;
      });

    vendors.push({
      vendorId: acc.vendorId,
      vendorName: acc.vendorName,
      vendorDomain: acc.vendorDomain,
      contractCount: acc.contractIds.size,
      // Fees are normalized to USD via effectiveFeesUSD/feesUSD before
      // accumulation, so the table always displays USD regardless of the
      // contract's original currency.
      currency: 'USD',
      currentACV: acc.currentACV,
      renewalPercent,
      periods,
      products,
    });
  }

  vendors.sort((a, b) => b.currentACV - a.currentACV);

  let periodLabels = Array.from(allYears).sort();
  const maxYearStr = String(targetYear);
  periodLabels = periodLabels.filter((y) => y <= maxYearStr);
  for (const vendor of vendors) {
    vendor.periods = vendor.periods.filter((p) => p.label <= maxYearStr);
    for (const product of vendor.products) {
      product.periods = product.periods.filter((p) => p.label <= maxYearStr);
      for (const c of product.contracts) {
        c.periods = c.periods.filter((p) => p.label <= maxYearStr);
      }
    }
  }

  return { vendors, periodLabels };
}

/**
 * End-to-end price-history rollup shared by the price-history page and the
 * get_price_history MCP tool. Pass the FULL active+archived enriched contract
 * set: invoices and linked child invoices are dropped here, but the supersession
 * cutoffs and original-start map are computed over everything so an archived
 * parent superseded by an active child still truncates correctly.
 */
/**
 * Union two per-(contract, product) cutoff maps, earliest date winning. Used
 * to fold confirmed cancellation cutoffs (PSK-1830) into the supersession
 * cutoffs — both mean "this product stops accruing here", so the earlier of
 * the two is the truthful stop.
 */
export type CutoffsByContract = Map<number, Map<number | string, Date>>;

export function mergeCutoffs(
  base: CutoffsByContract,
  extra: CutoffsByContract | undefined,
): CutoffsByContract {
  if (!extra?.size) return base;

  const merged = new Map(base);
  extra.forEach((byProduct, contractId) => {
    const target = new Map(merged.get(contractId) ?? []);
    byProduct.forEach((date, productId) => {
      const current = target.get(productId);
      if (!current || date < current) target.set(productId, date);
    });
    merged.set(contractId, target);
  });
  return merged;
}

export function buildVendorPriceSummaries(
  enrichedContracts: ContractWithPricing[],
  fiscalYearStartMonth: number,
  targetYear: number,
  cancellationCutoffs?: CutoffsByContract,
): { vendors: VendorPriceSummary[]; periodLabels: string[] } {
  // Drop invoices and linked child invoices. Other contracts pass through —
  // superseded ones still appear, but their per-product fees are truncated
  // at the original start date of the child that supersedes them.
  const aggregatable = enrichedContracts.filter(
    (c) =>
      c.contract.type_id !== CONTRACT_TYPE_INVOICE && !c.isLinkedChildInvoice,
  );

  // Sort ASC and take [0] rather than relying on raw DESC ordering — same
  // defensive pattern as extractContractDates in priceHistoryCalculator.ts.
  const originalStartByContractId = new Map<number, Date>();
  for (const ec of enrichedContracts) {
    const dates = ec.contract.term_start_date;
    if (!dates?.length) continue;
    const earliest = [...dates].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )[0]?.date;
    if (earliest) {
      originalStartByContractId.set(ec.id, parseISO(earliest));
    }
  }
  const cutoffsByContract = mergeCutoffs(
    buildCutoffsByContract(enrichedContracts, originalStartByContractId),
    cancellationCutoffs,
  );

  const contractTypesById = new Map<number, string>();
  const archivedById = new Map<number, boolean>();
  return buildVendorSummaries(
    aggregatable,
    fiscalYearStartMonth,
    contractTypesById,
    archivedById,
    targetYear,
    cutoffsByContract,
    originalStartByContractId,
  );
}
