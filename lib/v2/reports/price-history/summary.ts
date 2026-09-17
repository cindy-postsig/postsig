import { parseISO } from 'date-fns';
import { isInvoiceType } from '@/app/lib/constants';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import {
  querySpend,
  queryCommitments,
  memoizedSegmentResolver,
  buildSpendLineageFromEnriched,
  bucketKey,
  lineageFor,
  resolveWindow,
  type CurrencyPolicy,
  type FeeSegment,
  type FiscalConfig,
  type RelationshipEdge,
  type SpendContractInput,
  type SpendLineage,
} from '@/lib/v2/spend';

// psk-1844's cost calculation methods, in the same vocabulary the budget
// overview uses. 'committed' is the engine's name for Contract Term.
export type PriceHistoryCostMethod = 'amortized' | 'actual' | 'committed';

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

type YearStatus = PeriodSummary['status'];

// 'FY2026' → '2026'. Fiscal-year numbering is the FY that STARTS in that year
// (locked decision #7), so for January orgs the labels are identical to the
// calendar years the page always showed.
function yearLabel(period: string): string {
  return period.slice(2);
}

function segmentStatus(segment: FeeSegment, asOf: Date): YearStatus {
  if (parseISO(segment.to) <= asOf) return 'historical';
  if (parseISO(segment.from) > asOf) return 'projected';
  return 'current';
}

// Legacy merge order: a year with any active-cycle money is 'current';
// projected upgrades historical, never downgrades current.
function mergeStatus(existing: YearStatus | undefined, next: YearStatus) {
  if (existing === 'current' || next === 'current') return 'current';
  if (existing === 'projected' || next === 'projected') return 'projected';
  return next;
}

interface ContractRenewal {
  current: number;
  next: number;
  hasNext: boolean;
}

/**
 * Legacy renewal %: the cycle containing asOf vs the one after it. Segments
 * are the engine's cycles, so per product this is the active segment against
 * its successor in that product's own series; contract level sums the
 * products.
 */
function renewalOf(
  segmentsByProduct: Map<number, FeeSegment[]>,
  asOf: Date,
): { contract: ContractRenewal; byProduct: Map<number, ContractRenewal> } {
  const byProduct = new Map<number, ContractRenewal>();
  const contract: ContractRenewal = { current: 0, next: 0, hasNext: false };
  for (const [productId, segments] of segmentsByProduct) {
    const activeIdx = segments.findIndex(
      (s) => parseISO(s.from) <= asOf && asOf < parseISO(s.to),
    );
    if (activeIdx < 0) continue;
    const entry: ContractRenewal = {
      current: segments[activeIdx].fee,
      next: segments[activeIdx + 1]?.fee ?? 0,
      hasNext: activeIdx + 1 < segments.length,
    };
    byProduct.set(productId, entry);
    contract.current += entry.current;
    if (entry.hasNext) {
      contract.next += entry.next;
      contract.hasNext = true;
    }
  }
  return { contract, byProduct };
}

function percent(current: number, next: number): number | null {
  return current > 0 ? ((next - current) / current) * 100 : null;
}

interface VendorAccumulator {
  vendorId?: number;
  vendorName: string;
  vendorDomain?: string;
  contractIds: Set<number>;
  yearMap: Map<string, { fees: number; status: YearStatus }>;
  // Per-product per-contract; keyed `${contractId}__${productId}` so two
  // distinct products sharing a display label never merge.
  productsByContract: Map<
    string,
    {
      contractId: number;
      productId: number;
      productName: string;
      yearMap: Map<string, number>;
    }
  >;
  currentTotal: number;
  nextTotal: number;
  hasRenewalData: boolean;
  productRenewals: Map<string, { current: number; next: number }>;
  currentACV: number;
}

/**
 * End-to-end price-history rollup shared by the price-history page and the
 * get_price_history MCP tool, computed by the spend engine: one per-product
 * query at fiscal-year granularity with real lineage replaces the page's
 * private max-mode generation, cutoff truncation, and calendar-year fee
 * distribution. Pass the FULL active+archived enriched set — invoices and
 * linked child invoices are dropped here, but lineage is built over
 * everything so an archived parent superseded by an active child still
 * truncates correctly.
 *
 * `method` is psk-1844's calculation-method selector. Amortized and actual
 * are the plain engine bases; Contract Term is annual-valued commitments
 * START-dated (the ticket's literal wording) — deliberately NOT the
 * overview's provisional cancel-by dating; see the inline note below.
 * Renewal % and year statuses derive from the resolved segments and are
 * method-independent by design.
 */
export function buildVendorPriceSummaries(
  enrichedContracts: ContractWithPricing[],
  fiscalYearStartMonth: number,
  targetYear: number,
  relationships: RelationshipEdge[] = [],
  asOf: Date = new Date(),
  method: PriceHistoryCostMethod = 'committed',
  // Confirmed lineage-event cancellation cutoffs (PSK-1830), resolved by the
  // async caller; merged into the supersession cutoffs earliest-wins.
  eventCutoffs: Map<number, Map<number, Date>> | undefined,
  // How every fee below is denominated, and what `VendorPriceSummary.currency`
  // reports. Stated by the caller because only it can reach the org's base
  // currency and prefetch the rates this pure function looks up.
  currency: CurrencyPolicy,
): { vendors: VendorPriceSummary[]; periodLabels: string[] } {
  const aggregatable = enrichedContracts.filter(
    (c) => !isInvoiceType(c.contract.type_id) && !c.isLinkedChildInvoice,
  );

  const fiscalConfig: FiscalConfig = { startMonth: fiscalYearStartMonth };
  const lineage: SpendLineage = buildSpendLineageFromEnriched(
    enrichedContracts,
    relationships,
    eventCutoffs,
  );
  const contracts: SpendContractInput[] = aggregatable.map((ec) => ec.contract);

  // Window floor predates any recordable contract; the ceiling is the start
  // of the FY after targetYear, which also caps the projection horizon at
  // "current + next renewal" exactly like the page's calendar cap did.
  const window = {
    from: '1970-01-01',
    to: `${targetYear + 1}-${String(fiscalYearStartMonth).padStart(2, '0')}-01`,
  };

  const resolveSegments = memoizedSegmentResolver();
  // The horizon every query below resolves at: one window, and `recognition:
  // 'term-start'` keeps queryCommitments from padding it per contract.
  const resolvedWindow = resolveWindow(window, asOf, fiscalConfig);

  const shared = {
    window,
    granularity: 'year' as const,
    groupBy: 'product' as const,
    currency,
    fiscalConfig,
    asOf,
  };
  // Contract Term here is START-dated (psk-1844's literal wording; pinned
  // equivalent to commitments at recognition:'term-start'), NOT the
  // overview's provisional cancel-by dating: at year granularity a December
  // deadline would double the boundary year and phase-shift every annual
  // cycle — history reads wrong. OPEN with Phil on the psk-1844 comment
  // thread; converging either way is a recognition-mode switch here.
  const { items } =
    method === 'committed'
      ? queryCommitments(
          contracts,
          { ...shared, valuation: 'annual', recognition: 'term-start' },
          lineage,
          { resolveSegments },
        )
      : querySpend(
          contracts,
          { ...shared, basis: method, source: 'expected' },
          lineage,
          { resolveSegments },
        );

  // (contractId, productId) → year → fees, from the engine line items.
  const yearFeesByContractProduct = new Map<string, Map<string, number>>();
  for (const item of items) {
    if (item.value === 0) continue;
    const label = yearLabel(item.period);
    if (Number(label) > targetYear) continue;
    let years = yearFeesByContractProduct.get(item.groupKey);
    if (!years) {
      years = new Map();
      yearFeesByContractProduct.set(item.groupKey, years);
    }
    years.set(label, (years.get(label) ?? 0) + item.value);
  }

  const originalStartByContractId = new Map<number, Date>();
  for (const ec of enrichedContracts) {
    const dates = ec.contract.term_start_date;
    if (!dates?.length) continue;
    const earliest = [...dates].sort(
      (a: { date: string }, b: { date: string }) =>
        new Date(a.date).getTime() - new Date(b.date).getTime(),
    )[0]?.date;
    if (earliest) originalStartByContractId.set(ec.id, parseISO(earliest));
  }

  const amendsByContractProduct = new Map<string, number>();
  const contractTypesById = new Map<number, string>();
  const archivedById = new Map<number, boolean>();
  const productNamesById = new Map<number, string>();
  for (const ec of enrichedContracts) {
    const typeName = ec.contract.contract_types?.name ?? '';
    if (typeName) contractTypesById.set(ec.id, typeName);
    archivedById.set(ec.id, ec.contract.status === 'inactive');
    for (const p of ec.products) {
      productNamesById.set(p.product_id, p.name);
      if (p.supersedesProductInContractId != null) {
        amendsByContractProduct.set(
          `${ec.id}__${p.product_id}`,
          p.supersedesProductInContractId,
        );
      }
    }
  }

  // Vendor accumulation, keyed by vendor_id with a name fallback so distinct
  // vendors sharing a display name stay separate.
  const vendorAccumulators = new Map<string, VendorAccumulator>();
  for (const ec of aggregatable) {
    // Resolved explicitly at the same options the query used, rather than read
    // back out of the memo: the engine skips some contracts before resolution
    // (stale invoices), and a memo lookup would report those as having no
    // segments at all. The memo makes this free for everything else.
    const segments = resolveSegments(ec.contract, lineageFor(lineage, ec.id), {
      asOf,
      horizonStart: resolvedWindow.start,
      horizonEnd: resolvedWindow.end,
      currency,
    });
    if (segments.length === 0) continue;

    const vendorKey =
      ec.vendor_id != null ? `id:${ec.vendor_id}` : `name:${ec.vendor_name}`;
    let acc = vendorAccumulators.get(vendorKey);
    if (!acc) {
      acc = {
        vendorId: ec.vendor_id ?? undefined,
        vendorName: ec.vendor_name,
        vendorDomain: ec.vendor_domain,
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

    acc.contractIds.add(ec.id);
    acc.currentACV +=
      ec.priceHistory?.annualContractValueUSD ??
      ec.priceHistory?.annualContractValue ??
      0;

    const segmentsByProduct = new Map<number, FeeSegment[]>();
    for (const segment of segments) {
      const list = segmentsByProduct.get(segment.productId) ?? [];
      list.push(segment);
      segmentsByProduct.set(segment.productId, list);
    }
    for (const list of segmentsByProduct.values()) {
      list.sort((a, b) => a.from.localeCompare(b.from));
    }

    // Vendor-year statuses from the segments that funded each year bucket.
    for (const segment of segments) {
      if (segment.fee === 0) continue;
      const label = yearLabel(
        bucketKey(parseUTC(segment.from), 'year', fiscalConfig),
      );
      if (Number(label) > targetYear) continue;
      const existing = acc.yearMap.get(label);
      acc.yearMap.set(label, {
        fees: existing?.fees ?? 0,
        status: mergeStatus(existing?.status, segmentStatus(segment, asOf)),
      });
    }

    // Per-(contract, product) year fees from the engine items.
    for (const [productId] of segmentsByProduct) {
      const groupKey = `${ec.id}:${productId}`;
      const years = yearFeesByContractProduct.get(groupKey);
      if (!years) continue;
      const productKey = `${ec.id}__${productId}`;
      acc.productsByContract.set(productKey, {
        contractId: ec.id,
        productId,
        productName: productNamesById.get(productId) ?? String(productId),
        yearMap: years,
      });
      for (const [label, fees] of years) {
        const existing = acc.yearMap.get(label);
        acc.yearMap.set(label, {
          fees: (existing?.fees ?? 0) + fees,
          status: existing?.status ?? 'historical',
        });
      }
    }

    const renewal = renewalOf(segmentsByProduct, asOf);
    if (renewal.contract.hasNext) {
      acc.currentTotal += renewal.contract.current;
      acc.nextTotal += renewal.contract.next;
      acc.hasRenewalData = true;
    }
    for (const [productId, entry] of renewal.byProduct) {
      const key = `${ec.id}__${productId}`;
      acc.productRenewals.set(key, {
        current: entry.current,
        next: entry.next,
      });
    }
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

    const renewalPercent = acc.hasRenewalData
      ? percent(acc.currentTotal, acc.nextTotal)
      : null;

    const productGroups = new Map<
      string,
      {
        productId: number;
        productName: string;
        contracts: ProductContractDetail[];
        prodCurrent: number;
        prodNext: number;
        hasProdRenewal: boolean;
      }
    >();

    for (const [productKey, entry] of acc.productsByContract) {
      const renewal = acc.productRenewals.get(productKey);
      const contractRenewalPercent =
        renewal && renewal.current > 0
          ? percent(renewal.current, renewal.next)
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
        const aggregated = new Map<string, number>();
        for (const c of group.contracts) {
          for (const p of c.periods) {
            aggregated.set(p.label, (aggregated.get(p.label) ?? 0) + p.fees);
          }
        }
        return {
          productId: group.productId,
          productName: group.productName,
          renewalPercent:
            group.hasProdRenewal && group.prodCurrent > 0
              ? percent(group.prodCurrent, group.prodNext)
              : null,
          periods: Array.from(aggregated.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([label, fees]) => ({ label, fees })),
          // Chronological by original term_start_date so amendment chains
          // read top-to-bottom in the order each took over.
          contracts: group.contracts.sort((a, b) => {
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
      // Every fee above is denominated in the query's currency policy: the
      // org's base display currency under 'base', USD under the legacy
      // preconverted policy.
      currency: currency.mode === 'base' ? currency.target : 'USD',
      currentACV: acc.currentACV,
      renewalPercent,
      periods,
      products,
    });
  }

  vendors.sort((a, b) => b.currentACV - a.currentACV);

  const periodLabels = Array.from(allYears).sort();
  return { vendors, periodLabels };
}

function parseUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
