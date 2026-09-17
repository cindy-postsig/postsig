import { createClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import { logAllocationChanged } from '@/data/superuser/activities';
import type {
  AllocationActivityLine,
  AllocationActivityScope,
} from '@/constants/types';
import { isAllocationMode, type AllocationMode } from './types';
import { PERCENT_SUM_TOLERANCE, PERCENT_UNIT } from './percent';

export { PERCENT_SUM_TOLERANCE, PERCENT_UNIT } from './percent';

const FULL_PERCENT_UNITS = 100 * PERCENT_UNIT;

type ServiceClient = ReturnType<typeof createClient>;

export interface AllocationLineInput {
  orgUnitId?: number | null;
  orgEmployeeId?: number | null;
  percent: number;
}

export interface AllocationScopeInput {
  /** null = whole-contract scope */
  productId: number | null;
  mode: AllocationMode;
  lines?: AllocationLineInput[];
}

export interface SaveContractAllocationParams {
  organizationId: string;
  contractId: number;
  /** The contract's full desired allocation state; empty clears it. */
  scopes: AllocationScopeInput[];
  userId?: string;
  changedBy?: string;
}

function normalizeLine(line: AllocationLineInput): AllocationActivityLine {
  const orgUnitId = line.orgUnitId ?? null;
  const orgEmployeeId = line.orgEmployeeId ?? null;
  if ((orgUnitId === null) === (orgEmployeeId === null)) {
    throw new Error(
      'Allocation line must target exactly one of an org unit or an employee',
    );
  }
  const units = Math.round(line.percent * PERCENT_UNIT);
  if (!Number.isFinite(units) || units <= 0 || units > FULL_PERCENT_UNITS) {
    throw new Error(
      `Allocation line percent must be > 0 and <= 100, got ${line.percent}`,
    );
  }
  return { orgUnitId, orgEmployeeId, percent: units / PERCENT_UNIT };
}

/**
 * Validates and canonicalizes the submitted state. A scope submitted with
 * lines is stored as `manual` regardless of the submitted mode — editing any
 * percentage materializes lines and flips the mode; `active_users` never
 * stores lines.
 */
export function normalizeScopes(
  scopes: AllocationScopeInput[],
): AllocationActivityScope[] {
  const seenProducts = new Set<number | null>();
  for (const scope of scopes) {
    if (seenProducts.has(scope.productId)) {
      throw new Error(
        `Duplicate allocation scope for product ${scope.productId}`,
      );
    }
    seenProducts.add(scope.productId);
  }
  if (seenProducts.has(null) && scopes.length > 1) {
    throw new Error(
      'Contract-scoped and product-scoped allocations are mutually exclusive',
    );
  }

  const normalized = scopes.map((scope): AllocationActivityScope => {
    const rawLines = scope.lines ?? [];
    if (scope.mode === 'manual' && rawLines.length === 0) {
      throw new Error('A manual allocation requires at least one line');
    }
    if (rawLines.length === 0) {
      return { productId: scope.productId, mode: 'active_users', lines: [] };
    }

    const lines = rawLines.map(normalizeLine);
    const targets = new Set(
      lines.map((line) =>
        line.orgUnitId !== null
          ? `u:${line.orgUnitId}`
          : `e:${line.orgEmployeeId}`,
      ),
    );
    if (targets.size !== lines.length) {
      throw new Error('Allocation lines must not repeat a target');
    }

    const sumUnits = lines.reduce(
      (sum, line) => sum + Math.round(line.percent * PERCENT_UNIT),
      0,
    );
    if (
      Math.abs(sumUnits - FULL_PERCENT_UNITS) >
      PERCENT_SUM_TOLERANCE * PERCENT_UNIT
    ) {
      throw new Error(
        `Allocation must total 100%, got ${sumUnits / PERCENT_UNIT}%`,
      );
    }
    return { productId: scope.productId, mode: 'manual', lines };
  });

  return normalized.sort((a, b) => (a.productId ?? -1) - (b.productId ?? -1));
}

interface StoredAllocation {
  id: number;
  productId: number | null;
  mode: AllocationMode;
  lines: AllocationActivityLine[];
}

async function fetchContractAllocationState(
  client: ServiceClient,
  organizationId: string,
  contractId: number,
): Promise<StoredAllocation[]> {
  const { data: rows, error } = await client
    .from('contract_cost_allocations')
    .select('id, product_id, mode')
    .eq('organization_id', organizationId)
    .eq('contract_id', contractId)
    .order('product_id', { nullsFirst: true });

  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), organizationId, contractId },
      'Failed to load allocation state',
    );
    throw error;
  }
  if (!rows || rows.length === 0) return [];

  const { data: lineRows, error: linesError } = await client
    .from('contract_cost_allocation_lines')
    .select('allocation_id, org_unit_id, org_employee_id, percent')
    .eq('organization_id', organizationId)
    .in(
      'allocation_id',
      rows.map((row) => row.id),
    )
    .order('id');

  if (linesError) {
    logger.error(
      { error: sanitizeForLogging(linesError), organizationId, contractId },
      'Failed to load allocation lines',
    );
    throw linesError;
  }

  return rows.map((row) => {
    if (!isAllocationMode(row.mode)) {
      throw new Error(
        `Unknown allocation mode "${row.mode}" on allocation ${row.id}`,
      );
    }
    return {
      id: row.id,
      productId: row.product_id,
      mode: row.mode,
      lines: (lineRows ?? [])
        .filter((line) => line.allocation_id === row.id)
        .map((line) => ({
          orgUnitId: line.org_unit_id,
          orgEmployeeId: line.org_employee_id,
          percent: line.percent,
        })),
    };
  });
}

function canonical(scopes: AllocationActivityScope[]): string {
  const sorted = scopes
    .map((scope) => ({
      ...scope,
      lines: [...scope.lines].sort(
        (a, b) =>
          (a.orgUnitId ?? 0) - (b.orgUnitId ?? 0) ||
          (a.orgEmployeeId ?? 0) - (b.orgEmployeeId ?? 0),
      ),
    }))
    .sort((a, b) => (a.productId ?? -1) - (b.productId ?? -1));
  return JSON.stringify(sorted);
}

/**
 * The only writer of contract_cost_allocations and its lines. Replaces the
 * contract's allocation state with `scopes`, then records the before/after in
 * the contract History tab via ALLOCATION_CHANGED. A save that changes nothing
 * writes nothing and logs nothing.
 */
export async function saveContractAllocation(
  params: SaveContractAllocationParams,
  client: ServiceClient = createClient(),
): Promise<void> {
  const { organizationId, contractId } = params;
  const after = normalizeScopes(params.scopes);
  const stored = await fetchContractAllocationState(
    client,
    organizationId,
    contractId,
  );
  const before = stored.map(
    ({ productId, mode, lines }): AllocationActivityScope => ({
      productId,
      mode,
      lines,
    }),
  );
  if (canonical(before) === canonical(after)) return;

  const now = new Date().toISOString();
  const storedByProduct = new Map(stored.map((row) => [row.productId, row]));
  const keptProducts = new Set(after.map((scope) => scope.productId));

  const removedIds = stored
    .filter((row) => !keptProducts.has(row.productId))
    .map((row) => row.id);
  if (removedIds.length > 0) {
    // Line rows go with their allocation via the ON DELETE CASCADE FK.
    const { error } = await client
      .from('contract_cost_allocations')
      .delete()
      .eq('organization_id', organizationId)
      .in('id', removedIds);
    if (error) {
      logger.error(
        { error: sanitizeForLogging(error), organizationId, contractId },
        'Failed to delete allocations',
      );
      throw error;
    }
  }

  for (const scope of after) {
    const existing = storedByProduct.get(scope.productId);
    let allocationId: number;
    if (existing) {
      allocationId = existing.id;
      const { error } = await client
        .from('contract_cost_allocations')
        .update({
          mode: scope.mode,
          updated_by: params.userId ?? null,
          updated_at: now,
        })
        .eq('organization_id', organizationId)
        .eq('id', allocationId);
      if (error) {
        logger.error(
          { error: sanitizeForLogging(error), organizationId, contractId },
          'Failed to update allocation',
        );
        throw error;
      }
      const { error: deleteError } = await client
        .from('contract_cost_allocation_lines')
        .delete()
        .eq('organization_id', organizationId)
        .eq('allocation_id', allocationId);
      if (deleteError) {
        logger.error(
          {
            error: sanitizeForLogging(deleteError),
            organizationId,
            contractId,
          },
          'Failed to clear allocation lines',
        );
        throw deleteError;
      }
    } else {
      const { data, error } = await client
        .from('contract_cost_allocations')
        .insert({
          organization_id: organizationId,
          contract_id: contractId,
          product_id: scope.productId,
          mode: scope.mode,
          created_by: params.userId ?? null,
          updated_by: params.userId ?? null,
        })
        .select('id')
        .single();
      if (error || !data) {
        logger.error(
          { error: sanitizeForLogging(error), organizationId, contractId },
          'Failed to insert allocation',
        );
        throw error ?? new Error('Allocation insert returned no row');
      }
      allocationId = data.id;
    }

    if (scope.lines.length > 0) {
      const { error } = await client
        .from('contract_cost_allocation_lines')
        .insert(
          scope.lines.map((line) => ({
            organization_id: organizationId,
            allocation_id: allocationId,
            org_unit_id: line.orgUnitId,
            org_employee_id: line.orgEmployeeId,
            percent: line.percent,
          })),
        );
      if (error) {
        logger.error(
          { error: sanitizeForLogging(error), organizationId, contractId },
          'Failed to insert allocation lines',
        );
        throw error;
      }
    }
  }

  await logAllocationChanged({
    contractId,
    before,
    after,
    changedBy: params.changedBy,
    userId: params.userId,
  });
}
