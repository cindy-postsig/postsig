import { runSpendQuery } from '@/app/api/v2/handlers/spend/query';
import { filterExcludeInvoices } from '@/lib/v2';
import { costMethodInput } from '@/components/budget/costMethod';
import type { UserMetadata } from '@/constants/types';
import { readAssignmentEmployees } from '@/data/superuser/assignments';
import type { AssignmentEmployeeRow } from '@/data/superuser/assignments';
import { getDefaultCostMethod } from '@/lib/settings/default-cost-method';
import { loadAllocationContextForRequest } from '@/lib/v2/cost-allocation/context';
import { TARGET_TYPE_LABELS } from '@/lib/v2/cost-allocation/picker';
import { resolveAllocations } from '@/lib/v2/cost-allocation/resolver';
import { isValidIsoDate } from '@/lib/v2/cost-allocation/report-window';
import { sharedNameBreadcrumbs } from '@/lib/v2/cost-allocation/target-path';
import { sanitizeOrderNumber } from '@/lib/v2/contracts/orderNumber';
import type { EnrichedContract } from '@/lib/v2/contracts/service';
import { formatUTCDate } from '@/lib/v2/spend';
import { earliestIsoDate } from '@/lib/v2/spend/resolver/resolveFeeSegments';
import type {
  ResolvedContractAllocation,
  ResolvedScope,
} from '@/lib/v2/cost-allocation/types';
import type { OrgUnitNode } from '@/lib/v2/org-units/tree';
import { loadSeatPopulation } from '@/lib/v2/seats/service';
import type { ContractSeatInputs } from '@/lib/v2/seats/service';
import type { Seat, SeatHolder, SeatVendor } from '@/lib/v2/seats/types';
import {
  monthBuckets,
  scopeForSeat,
  seatBucketTotal,
  seatEntitlementsCost,
  splitEntitlementsCost,
  seatMonthlyCost,
} from './cost';
import { assignmentSeatFrom } from './seats';
import type {
  AssignmentNode,
  AssignmentSeat,
  AssignmentUser,
  AssignmentsPayload,
  ProductContractDetail,
} from './types';
import { productDetailKey } from './types';
import {
  assignmentsWindow,
  defaultAssignmentsMonth,
  isAssignmentsMonth,
  monthRange,
} from './window';

function buildNodes(units: readonly OrgUnitNode[]): {
  nodes: Record<number, AssignmentNode>;
  rootIds: number[];
} {
  const tree = units.filter((unit) => unit.level !== 'cost_center');
  const byId = new Map(tree.map((unit) => [unit.id, unit]));
  const breadcrumbs = sharedNameBreadcrumbs(tree, byId);
  const nodes: Record<number, AssignmentNode> = {};

  for (const unit of tree) {
    nodes[unit.id] = {
      id: unit.id,
      name: unit.name,
      level: unit.level,
      levelLabel: TARGET_TYPE_LABELS[unit.level],
      parentId: unit.parent_id,
      breadcrumb: breadcrumbs.get(unit.id),
      childIds: [],
      memberIds: [],
      headcount: 0,
    };
  }
  const rootIds: number[] = [];
  for (const unit of tree) {
    if (unit.parent_id === null || !nodes[unit.parent_id])
      rootIds.push(unit.id);
    else nodes[unit.parent_id].childIds.push(unit.id);
  }
  const byName = (a: number, b: number) =>
    nodes[a].name.localeCompare(nodes[b].name);
  for (const node of Object.values(nodes)) node.childIds.sort(byName);
  rootIds.sort(byName);
  return { nodes, rootIds };
}

function fillHeadcounts(
  nodes: Record<number, AssignmentNode>,
  rootIds: readonly number[],
): void {
  const visit = (id: number, seen: Set<number>): number => {
    const node = nodes[id];
    if (!node || seen.has(id)) return 0;
    seen.add(id);
    let total = node.memberIds.length;
    for (const childId of node.childIds) total += visit(childId, seen);
    node.headcount = total;
    return total;
  };
  const seen = new Set<number>();
  for (const rootId of rootIds) visit(rootId, seen);
  // A node orphaned by a corrupt parent chain still deserves its own count.
  for (const id of Object.keys(nodes).map(Number)) visit(id, seen);
}

interface TermEntry {
  date?: unknown;
}

function latestIsoDate(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  let latest: string | null = null;
  for (const entry of value as TermEntry[]) {
    const iso =
      typeof entry?.date === 'string' ? entry.date.slice(0, 10) : null;
    if (!isValidIsoDate(iso)) continue;
    if (latest === null || iso > latest) latest = iso;
  }
  return latest;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildProductDetails(
  contracts: readonly {
    id: number;
    contract?: Record<string, unknown> | null;
  }[],
): Record<string, ProductContractDetail> {
  const details: Record<string, ProductContractDetail> = {};
  for (const enriched of contracts) {
    const record = enriched.contract;
    if (!record) continue;

    const metadata = record.metadata as
      | { lineage?: { order_number?: unknown } | null }
      | null
      | undefined;
    const contractType = record.contract_types as
      | { name?: string | null }
      | null
      | undefined;
    const base = {
      contractId: enriched.id,
      orderNumber: sanitizeOrderNumber(metadata?.lineage?.order_number),
      contractType: contractType?.name ?? null,
      startDate: earliestIsoDate(
        record.term_start_date as Array<{ date: string }> | null,
      ),
      endDate: latestIsoDate(record.term_end_date),
      annualIncrease: numberOrNull(record.annual_increase),
    };

    const rows = (record.vendor_products_details ?? []) as {
      product_id?: number | null;
      year?: number | null;
      rate?: unknown;
      fees?: unknown;
      n_users?: unknown;
    }[];
    const latestYearByProduct = new Map<number, number>();
    for (const row of rows) {
      if (row.product_id === null || row.product_id === undefined) continue;
      const year = row.year ?? 0;
      const seen = latestYearByProduct.get(row.product_id);
      if (seen === undefined || year > seen) {
        latestYearByProduct.set(row.product_id, year);
      }
    }
    for (const row of rows) {
      const productId = row.product_id;
      if (productId === null || productId === undefined) continue;
      if ((row.year ?? 0) !== latestYearByProduct.get(productId)) continue;
      const licences = numberOrNull(row.n_users);
      const rate = numberOrNull(row.rate);
      const fees = numberOrNull(row.fees);
      details[productDetailKey(enriched.id, productId)] = {
        ...base,
        ratePerLicence:
          rate ?? (fees !== null && licences ? fees / licences : null),
        licences,
      };
    }
    details[productDetailKey(enriched.id, null)] = {
      ...base,
      ratePerLicence: null,
      licences: null,
    };
  }
  return details;
}

/**
 * The Details tab for a Bloomberg product, one entry per billing account and
 * product code. It is not a contract record: the licences are the terminals
 * themselves, over the span their contract and renewal dates cover, with no
 * order number, type or uplift. No rate either — terminals of one product sit
 * on their own terms at their own prices, so no single per-licence figure
 * would be true; the panel's "in scope" cost carries the money.
 */
function terminalDetails(
  seats: readonly Seat[],
): Record<string, ProductContractDetail> {
  const details: Record<string, ProductContractDetail> = {};
  for (const seat of seats) {
    if (seat.source !== 'bloomberg_sid') continue;
    const key = productDetailKey(seat.contractId, seat.catalogProductId);
    const seen = details[key];
    if (!seen) {
      details[key] = {
        contractId: seat.contractId,
        orderNumber: null,
        contractType: null,
        startDate: seat.startDate,
        endDate: seat.endDate,
        annualIncrease: null,
        ratePerLicence: null,
        licences: 1,
      };
      continue;
    }
    seen.licences = (seen.licences ?? 0) + 1;
    if (
      seat.startDate !== null &&
      (seen.startDate === null || seat.startDate < seen.startDate)
    ) {
      seen.startDate = seat.startDate;
    }
    if (
      seat.endDate !== null &&
      (seen.endDate === null || seat.endDate > seen.endDate)
    ) {
      seen.endDate = seat.endDate;
    }
  }
  return details;
}

/** The roster and vendor identities the contract half of the seat population reads. */
function contractSeatInputs(
  employeeRows: readonly AssignmentEmployeeRow[],
  contracts: EnrichedContract[],
): ContractSeatInputs {
  const holdersById = new Map<number, SeatHolder>();
  for (const row of employeeRows) {
    holdersById.set(row.id, {
      id: row.id,
      name: `${row.first_name} ${row.last_name}`.trim(),
      status: row.status,
      deleted_at: row.deleted_at,
    });
  }
  const vendorByContractId = new Map<number, SeatVendor>(
    filterExcludeInvoices(contracts).map((contract) => [
      contract.id,
      {
        id: contract.vendor_id,
        name: contract.vendor_name || 'Unknown vendor',
      },
    ]),
  );
  return { holdersById, vendorByContractId };
}

export interface AssignmentsPageOptions {
  /** `YYYY-MM` off the URL; anything else falls back to the default month. */
  month?: string;
}

export async function loadAssignmentsPage(
  userMetadata: UserMetadata,
  options: AssignmentsPageOptions = {},
  today: Date = new Date(),
): Promise<AssignmentsPayload> {
  const { organizationId } = userMetadata;
  const { getEnrichedContracts } = await import('@/lib/v2/contracts/service');

  const month = isAssignmentsMonth(options.month)
    ? options.month
    : defaultAssignmentsMonth(today);
  const window = monthRange(month);

  // The un-stamped contract set: the page prices every seat through its own
  // engine query below, so the engine-spend stamps getContractsList adds (two
  // commitment passes plus an FX prefetch back to the earliest term start)
  // would be paid for nothing. Same positional args as runSpendQuery's read,
  // so a current-FY month shares the request-scoped fetch with it.
  const core = Promise.all([
    loadAllocationContextForRequest(organizationId),
    readAssignmentEmployees(organizationId),
    getDefaultCostMethod(organizationId),
    getEnrichedContracts('active', false, false, 0, false),
  ]);

  // The population needs nothing the batch reads until its own seat rows are
  // in, so it starts alongside the batch. Its inputs promise is derived here,
  // where the population awaits it: a rejected batch must not surface as an
  // unhandled rejection.
  const populated = loadSeatPopulation(organizationId, window, {
    matchEmployees: true,
    contractSeats: core.then(([, employeeRows, , { contracts }]) =>
      contractSeatInputs(employeeRows, contracts),
    ),
  });

  const [[ctx, employeeRows, costMethod, { contracts }], population] =
    await Promise.all([core, populated]);

  const { nodes, rootIds } = buildNodes([...ctx.unitsById.values()]);

  const eligible = filterExcludeInvoices(contracts);

  // One engine query prices the whole page: the month's spend per contract ×
  // product, over contracts and Bloomberg terminals alike, on the org's own
  // cost method — the same runner and population the Cost Allocation Summary
  // reports from, so a month here is that report's month.
  const spend = await runSpendQuery(
    userMetadata,
    costMethodInput(
      costMethod,
      { from: formatUTCDate(window.start), to: formatUTCDate(window.end) },
      'month',
      'product',
    ),
    { bloombergSid: population.engine },
  );
  const buckets = monthBuckets(spend.items);

  const seats: Record<number, AssignmentSeat> = {};
  const heldByEmployeeId = new Map<
    number,
    { seat: Seat; display: AssignmentSeat }[]
  >();
  for (const seat of population.seats) {
    const display = assignmentSeatFrom(seat);
    seats[display.id] = display;
    const holderId = seat.holder.orgEmployeeId;
    if (holderId === null) continue;
    const held = heldByEmployeeId.get(holderId);
    if (held) held.push({ seat, display });
    else heldByEmployeeId.set(holderId, [{ seat, display }]);
  }

  // Resolved allocations weigh the apportionment; both they and the month's
  // buckets come from the same enriched contract set the contracts and budget
  // tables print, so a seat's share matches what the Cost Allocation tab shows
  // for the same contract.
  const resolved: ReadonlyMap<number, ResolvedContractAllocation> =
    resolveAllocations(
      contracts.map((contract) => ({ id: contract.id })),
      ctx,
    );
  const users: Record<number, AssignmentUser> = {};
  for (const row of employeeRows) {
    const node = row.org_unit_id === null ? undefined : nodes[row.org_unit_id];
    const held = heldByEmployeeId.get(row.id) ?? [];
    const byScope = new Map<
      string,
      { scope: ResolvedScope; contractId: number; seats: AssignmentSeat[] }
    >();
    let seatTotal = 0;
    for (const { seat, display } of held) {
      if (seat.source === 'bloomberg_sid') {
        display.monthlyCost = seatBucketTotal(seat, buckets);
        if (display.entitlements && seat.entitlements) {
          const total = seatEntitlementsCost(seat, buckets);
          const shares = splitEntitlementsCost(
            seat.entitlements.exchanges,
            total,
          );
          display.entitlements = {
            monthlyCost: total,
            exchanges: display.entitlements.exchanges.map(
              (exchange, index) => ({
                ...exchange,
                monthlyCost: shares[index],
              }),
            ),
          };
        }
        seatTotal += display.monthlyCost;
        continue;
      }
      const scope = scopeForSeat(resolved.get(seat.contractId), seat.productId);
      if (!scope) continue;
      const key = `${seat.contractId}:${scope.productId ?? 'contract'}`;
      const group = byScope.get(key);
      if (group) group.seats.push(display);
      else
        byScope.set(key, {
          scope,
          contractId: seat.contractId,
          seats: [display],
        });
    }
    for (const group of byScope.values()) {
      const scopeCost = seatMonthlyCost(
        group.scope,
        group.contractId,
        buckets,
        row.id,
      );
      const each = Math.round((scopeCost / group.seats.length) * 100) / 100;
      for (const seat of group.seats) {
        seat.monthlyCost = each;
        seatTotal += each;
      }
    }
    const monthlyCost = Math.round(seatTotal * 100) / 100;
    if (node) node.memberIds.push(row.id);
    users[row.id] = {
      id: row.id,
      name: `${row.first_name} ${row.last_name}`.trim(),
      email: row.email,
      employeeId: row.employee_id,
      orgUnitId: row.org_unit_id,
      status: row.status,
      costCenter: row.cost_center,
      region: row.region,
      country: row.country,
      seatIds: held.map(({ display }) => display.id),
      monthlyCost,
    };
  }
  for (const node of Object.values(nodes)) {
    node.memberIds.sort((a, b) => users[a].name.localeCompare(users[b].name));
  }
  fillHeadcounts(nodes, rootIds);

  // A product's Details tab is only ever read for a contract that holds seats,
  // and the org's active set is far larger than the set that does.
  const seatContractIds = new Set(
    population.seats.map((seat) => seat.contractId),
  );

  return {
    window: assignmentsWindow(month),
    nodes,
    rootIds,
    users,
    seats,
    productDetails: {
      ...buildProductDetails(
        eligible.filter((contract) => seatContractIds.has(contract.id)),
      ),
      ...terminalDetails(population.seats),
    },
    empty: employeeRows.length === 0,
  };
}
