import { z } from 'zod';
import { isInvoiceType } from '@/app/lib/constants';
import {
  requireMcpContext,
  type McpRequestContext,
} from '@/app/lib/mcp/context';
import {
  FeatureDisabledToolError,
  NotFoundToolError,
  ValidationToolError,
} from '@/app/lib/mcp/errors';
import { assertSameOrg } from '@/app/lib/mcp/guards';
import type { McpToolDef } from '@/app/lib/mcp/tools/types';
import { NotFoundError } from '@/lib/errors';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import { getContractsList } from '@/lib/v2/contracts/service';
import { sanitizeOrderNumber } from '@/lib/v2/contracts/orderNumber';
import {
  inheritScopeValues,
  scopeValuesOf,
} from '@/lib/v2/cost-allocation/amounts';
import { loadAllocationContextForContract } from '@/lib/v2/cost-allocation/context';
import { isCostAllocationEnabled } from '@/lib/v2/cost-allocation/flag';
import {
  allocationProvenance,
  applicableScopes,
  percentToAmount,
  scopeValueFor,
} from '@/lib/v2/cost-allocation/editor';
import { targetTypeLabel } from '@/lib/v2/cost-allocation/picker';
import { resolveAllocations } from '@/lib/v2/cost-allocation/resolver';
import { loadContractHeader } from '@/lib/v2/cost-allocation/tab-data';
import { targetPath } from '@/lib/v2/cost-allocation/target-path';
import {
  REPORT_PERIODS,
  DEFAULT_ROLLUP_REPORT_PERIOD,
  REPORT_PERIOD_LABELS,
  isValidIsoDate,
} from '@/lib/v2/cost-allocation/report-window';
import { loadAllocationRollupReport } from '@/lib/v2/cost-allocation/rollup-report';
import {
  OUTSIDE_HIERARCHY_LABEL,
  UNASSIGNED_LABEL,
  flattenRollupView,
} from '@/lib/v2/cost-allocation/rollup-report-rows';
import { costMethodLabels } from '@/components/budget/costMethod';
import {
  ORG_UNIT_TREE_LEVELS,
  type OrgUnitLevel,
} from '@/lib/v2/org-units/levels';

const input = z.object({
  id: z
    .number()
    .int()
    .describe(
      'Contract or invoice id (from list_contracts, query_contracts, or get_contract). To start from a document number, resolve it with get_contract(order_number) first.',
    ),
});

const LIST_OPTIONS = { status: 'all' as const, productValues: true };

/** The same per-org gate as the tab and the reports: an org without the feature gets no tool either. */
async function assertToolEnabled(
  userMetadata: McpRequestContext['userMetadata'],
): Promise<void> {
  if (!(await isCostAllocationEnabled(userMetadata))) {
    throw new FeatureDisabledToolError('Cost allocation');
  }
}

export async function getCostAllocation(payload: z.infer<typeof input>) {
  const ctx = requireMcpContext();
  await assertToolEnabled(ctx.userMetadata);
  const organizationId = ctx.userMetadata.organizationId;

  let header: Awaited<ReturnType<typeof loadContractHeader>>;
  try {
    header = await loadContractHeader(organizationId, payload.id);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new NotFoundToolError('Contract', payload.id);
    }
    throw error;
  }
  const isInvoice = isInvoiceType(header.type_id);

  const [allocationCtx, { contracts }] = await Promise.all([
    loadAllocationContextForContract(organizationId, payload.id),
    ctx.cache.getOrFetch(
      ChatToolCache.buildKey('getContractsList', LIST_OPTIONS),
      () => getContractsList(LIST_OPTIONS),
    ),
  ]);
  const resolved = resolveAllocations([{ id: payload.id }], allocationCtx).get(
    payload.id,
  ) ?? { contractId: payload.id, scopes: [] };
  const provenance = allocationProvenance(resolved);

  const enriched = contracts.find((c) => c.id === payload.id);
  const source =
    provenance.kind === 'inherited'
      ? contracts.find((c) => c.id === provenance.sourceContractId)
      : undefined;
  const inSet = [enriched, source].filter(
    (c): c is NonNullable<typeof c> => c !== undefined,
  );
  if (inSet.length > 0) {
    assertSameOrg(
      inSet,
      'get_cost_allocation',
      (c) => c.contract?.organization_id,
    );
  }
  const { values, valuesFromSource } = inheritScopeValues(
    scopeValuesOf(enriched, isInvoice),
    source && scopeValuesOf(source, isInvoiceType(source.contract?.type_id)),
  );
  // Product names come from whichever record priced the scopes.
  const products = (valuesFromSource ? source : enriched)?.products ?? [];
  // A record absent from the set has unknown products, so every scope stays.
  const scopes = applicableScopes(
    resolved.scopes,
    enriched ? new Set(enriched.products.map((p) => p.product_id)) : null,
  );
  const levelByUnitId: Record<number, OrgUnitLevel> = {};
  for (const unit of allocationCtx.unitsById.values()) {
    levelByUnitId[unit.id] = unit.level;
  }

  const notes: string[] = [];
  if (resolved.scopes.length === 0) {
    notes.push(
      'No allocation — this record\'s spend reports under "Unassigned".',
    );
  } else if (scopes.length === 0) {
    notes.push(
      'The inherited allocation is by product, and this record carries none of the products it allocates.',
    );
  }
  if (valuesFromSource && provenance.kind === 'inherited') {
    notes.push(
      `Amounts are the allocation source's (contract #${provenance.sourceContractId}): this record has no value of its own in the engine contract set.`,
    );
  } else if (!enriched) {
    notes.push(
      'Amounts are unavailable: the record is not in the engine contract set (archived or filtered out), so only percents are returned.',
    );
  }

  return {
    found: true as const,
    contract: {
      id: payload.id,
      isInvoice,
      contractType: header.typeName,
      vendor: enriched
        ? { name: enriched.vendor_name, domain: enriched.vendor_domain ?? null }
        : null,
      orderNumber: enriched
        ? sanitizeOrderNumber(
            enriched.contract?.metadata?.lineage?.order_number,
          )
        : null,
    },
    baseCurrency: ctx.userMetadata.baseCurrency,
    provenance:
      provenance.kind === 'inherited'
        ? {
            kind: 'inherited' as const,
            sourceContractId: provenance.sourceContractId,
          }
        : provenance.kind === 'own'
          ? { kind: 'own' as const, sourceContractId: payload.id }
          : { kind: 'unassigned' as const, sourceContractId: null },
    scopes: scopes.map((scope) => {
      const valueBase = scopeValueFor(values, scope.productId);
      return {
        productId: scope.productId,
        productName:
          scope.productId === null
            ? null
            : (products.find((p) => p.product_id === scope.productId)?.name ??
              null),
        mode: scope.mode,
        valueBase,
        lines: scope.lines.map((line) => ({
          target: {
            kind: line.target.kind,
            id: line.target.id,
            name: line.target.name,
            type: targetTypeLabel(line.target, levelByUnitId),
          },
          path: targetPath(line.target, allocationCtx.unitsById),
          percent: line.percent,
          amountBase:
            valueBase === null
              ? null
              : percentToAmount(line.percent, valueBase),
        })),
        ...(scope.unlinkedUserCount > 0
          ? { unlinkedUserCount: scope.unlinkedUserCount }
          : {}),
      };
    }),
    ...(notes.length > 0 ? { notes } : {}),
  };
}

const ROLLUP_LEVELS = [...ORG_UNIT_TREE_LEVELS, 'cost_center', 'user'] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const rollupInput = z
  .object({
    level: z
      .enum(ROLLUP_LEVELS)
      .describe(
        'The level to roll spend up to: a tree level (entity, business_group, division, business_unit, department, team), cost_center (the flat cost-center view), or user (the flat list of employees with their own explicit lines; any org with employees). Must be a level the org actually uses — the error lists the levels in use.',
      ),
    period: z
      .enum(REPORT_PERIODS)
      .default(DEFAULT_ROLLUP_REPORT_PERIOD)
      .describe(
        "Spend window. Presets: current-fy (the org's whole current fiscal year — the dashboard's Current Estimated Spend window; the default), projected-fy (the fiscal year after it — the dashboard's Projected Spend window), all (every year on record), ytd (Jan 1 through today), this-quarter, last-quarter, this-month, last-month; custom needs from/to.",
      ),
    from: z
      .string()
      .regex(ISO_DATE)
      .optional()
      .describe('Required when period="custom". First day, YYYY-MM-DD.'),
    to: z
      .string()
      .regex(ISO_DATE)
      .optional()
      .describe(
        'Required when period="custom". Last day (inclusive), YYYY-MM-DD.',
      ),
  })
  .superRefine((value, ctx) => {
    if (value.period !== 'custom') return;
    for (const field of ['from', 'to'] as const) {
      if (!isValidIsoDate(value[field])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} must be a real calendar date (YYYY-MM-DD) when period is "custom"`,
        });
      }
    }
    if (value.from && value.to && value.to < value.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'to must not be before from',
      });
    }
  });

async function getAllocationRollup(payload: z.infer<typeof rollupInput>) {
  const ctx = requireMcpContext();
  await assertToolEnabled(ctx.userMetadata);
  const data = await loadAllocationRollupReport(ctx.userMetadata, {
    period: payload.period,
    from: payload.from,
    to: payload.to,
  });
  const view = data.views.find((v) => v.key === payload.level);
  if (!view) {
    const inUse = data.views.map((v) => v.key);
    throw new ValidationToolError(
      inUse.length === 0
        ? 'This organization has no org structure to roll up to yet.'
        : `Level "${payload.level}" is not in use for this organization. Levels in use: ${inUse.join(', ')}.`,
    );
  }

  // People sit under their units in the report's tree, but a level roll-up
  // is per node: listing every employee under every team would put a row per
  // head of staff into each tree-level answer. The user level is where the
  // people are.
  const rows = flattenRollupView(data.rows, view.rootKeys)
    .filter(({ row }) => view.key === 'user' || row.level !== 'user')
    .map(({ row, depth }) => ({
      key: row.key,
      name: row.name,
      level: row.level,
      path: row.path,
      depth,
      budget: row.budget,
      rolledUpBudget: row.rolledUpBudget,
      direct: row.direct,
      rollup: row.rollup,
      total: row.total,
      difference: row.difference,
      stale: row.stale,
    }));

  return {
    level: view.key,
    levelLabel: view.label,
    levelsInUse: data.views.map((v) => ({ key: v.key, label: v.label })),
    period: data.period,
    periodLabel: REPORT_PERIOD_LABELS[data.period],
    // Half-open: `end` is the first day NOT included.
    window: { start: data.window.start, end: data.window.end },
    fiscalYears: data.fiscalYears,
    costMethod: data.costMethod,
    costMethodLabel: costMethodLabels[data.costMethod],
    baseCurrency: ctx.userMetadata.baseCurrency,
    rows,
    outsideHierarchy: {
      name: OUTSIDE_HIERARCHY_LABEL,
      total: view.outsideHierarchy,
    },
    unassigned: { name: UNASSIGNED_LABEL, total: view.unassigned },
    totals: {
      budget: view.budgetTotal,
      spend: view.spendTotal,
      difference: Math.round((view.budgetTotal - view.spendTotal) * 100) / 100,
    },
  };
}

export const costAllocationTools: McpToolDef[] = [
  {
    name: 'get_cost_allocation',
    description:
      "Who pays for a contract or invoice: its resolved cost allocation as lines of percent and amount against org units (entities, business groups, divisions, business units, departments, teams, cost centers) or individual employees. Use when the user asks how a contract's or invoice's cost is split, which department/team/cost center carries it, or who is charged for it. " +
      'Amounts are in `baseCurrency`: for a contract the current-fiscal-year commitment, for an invoice its recorded amount — the same figures the Cost Allocation tab and the Invoice Cost Allocation report show. `provenance.kind` is "own" (set on the record itself), "inherited" (from `sourceContractId`, the nearest allocated ancestor — invoices and amendments inherit unless overridden), or "unassigned" (no allocation; spend reports under "Unassigned"). ' +
      'One scope per allocated unit: `productId: null` is the whole record, otherwise one scope per product. A scope with `mode: "active_users"` splits equally over the source contract\'s current linked seats and stays in sync with them; `unlinkedUserCount`, when present, is the number of seats excluded because they are not linked to an employee. ' +
      "Each line's `path` is the org-tree breadcrumb root-first (for an employee, the unit they sit under; empty when outside the tree). Percents on a scope sum to 100.",
    inputSchema: input,
    annotations: {
      title: 'Cost allocation',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getCostAllocation as McpToolDef['handler'],
  },
  {
    name: 'get_allocation_rollup',
    description:
      'The Cost Allocation Summary report: spend in a window rolled up the org tree to one level, per node, against budgets. Use when the user asks how much a department/entity/business group/team/cost center spends, which units are over or under budget, or for a spend-vs-budget breakdown by org unit. ' +
      "Rows are the nodes at `level` and every descendant below them (`depth` nests them; `path` is the root-first breadcrumb). Per row: `direct` = spend allocated to the node itself, `rollup` = spend allocated below it (employees included; in the cost_center view, employee lines attributed via each employee's cost-center value), `total` = direct + rollup, `budget` = the node's own budget for the fiscal years the window touches (null when none is set), `rolledUpBudget` = the sum of its descendants' budgets, `difference` = budget − total. `stale` marks a unit no active employee resolves to. " +
      "Two catch-all rows make every level reconcile to the same `totals.spend`: `outsideHierarchy` (spend that cannot be placed on this view: targets with no ancestor at the level, cost centers in tree views, org units and users without a cost center in the cost_center view) and `unassigned` (contracts with no allocation). Amounts are in `baseCurrency` under the org's default cost method (`costMethodLabel`) — the same engine figures as the Spend Overview and get_spend. Budgets are per fiscal year with no proration: a sub-year window reads the containing FY's whole budget; a window spanning FYs sums them.",
    inputSchema: rollupInput,
    annotations: {
      title: 'Cost allocation summary',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getAllocationRollup as McpToolDef['handler'],
  },
];
