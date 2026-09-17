import { Context } from 'hono';
import { checkAbility } from '@/data/user-permissions';
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import { isCostAllocationEnabled } from '@/lib/v2/cost-allocation/flag';
import {
  normalizeScopes,
  saveContractAllocation,
  type AllocationScopeInput,
} from '@/lib/v2/cost-allocation/service';
import {
  loadAllocationCatalog,
  loadContractHeader,
  loadCostAllocationTabData,
  type AllocationCatalogData,
  type CostAllocationTabPayload,
} from '@/lib/v2/cost-allocation/tab-data';
import { getContractScopeValues } from '@/lib/v2/cost-allocation/amounts';
import {
  assertBudgetTargetInOrg,
  saveBudget,
  type BudgetTarget,
} from '@/lib/v2/cost-allocation/budgets';

export type { AllocationCatalogData, CostAllocationTabPayload };

/**
 * User-caused failures map to their status; anything else is logged and
 * answered as a plain 500 — same split the server actions carried, now done
 * once instead of per action.
 */
function errorResponse(c: Context, error: unknown, message: string) {
  if (error instanceof ValidationError) {
    return c.json({ error: error.message }, 400);
  }
  if (error instanceof AuthorizationError) {
    return c.json({ error: error.message }, 403);
  }
  if (error instanceof NotFoundError) {
    return c.json({ error: error.message }, 404);
  }
  logger.error({ error: sanitizeForLogging(error) }, message);
  return c.json({ error: message }, 500);
}

/** The tab is hidden where the flag is off for the org; the endpoints share the gate. */
async function assertCostAllocationEnabled(userMetadata: {
  organizationId: string;
  userId: string;
}): Promise<void> {
  if (!(await isCostAllocationEnabled(userMetadata))) {
    throw new NotFoundError('Cost allocation');
  }
}

function contractIdParam(c: Context): number {
  const raw = c.req.param('id') ?? '';
  // parseInt would accept "12junk"; the whole parameter must be the id.
  if (!/^\d+$/.test(raw)) {
    throw new ValidationError('Invalid contract id');
  }
  const contractId = Number(raw);
  if (!Number.isSafeInteger(contractId) || contractId < 1) {
    throw new ValidationError('Invalid contract id');
  }
  return contractId;
}

/** Malformed or non-object JSON is the caller's error, not a 500. */
async function jsonBody(c: Context): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ValidationError('Invalid JSON body');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Invalid JSON body');
  }
  return body as Record<string, unknown>;
}

async function assertCanManageOrganization(subject: string): Promise<void> {
  if (!(await checkAbility('manage', 'Organization'))) {
    throw new AuthorizationError(
      `Only organization admins can edit ${subject}`,
    );
  }
}

export async function getCostAllocationTab(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    await assertCostAllocationEnabled(userMetadata);
    const { organizationId } = userMetadata;
    const contractId = contractIdParam(c);
    const tab = await loadCostAllocationTabData(organizationId, contractId);
    const amounts = await getContractScopeValues(
      contractId,
      tab.isInvoice,
      tab.sourceContract?.id ?? null,
    );
    const payload: CostAllocationTabPayload = { ...tab, ...amounts };
    return c.json(payload);
  } catch (error) {
    return errorResponse(c, error, 'Failed to load the cost allocation');
  }
}

export async function getCostAllocationCatalog(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    await assertCostAllocationEnabled(userMetadata);
    const { organizationId } = userMetadata;
    const catalog = await loadAllocationCatalog(organizationId);
    return c.json(catalog);
  } catch (error) {
    return errorResponse(c, error, 'Failed to load the allocation catalog');
  }
}

export async function putContractAllocation(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    await assertCostAllocationEnabled(userMetadata);
    const contractId = contractIdParam(c);
    await assertCanManageOrganization('cost allocations');
    const body = (await jsonBody(c)) as { scopes?: AllocationScopeInput[] };
    if (!Array.isArray(body.scopes)) {
      throw new ValidationError('scopes must be an array');
    }
    try {
      normalizeScopes(body.scopes);
    } catch (error) {
      throw new ValidationError(
        error instanceof Error ? error.message : 'Invalid allocation',
      );
    }

    // Tenancy: a contract outside the caller's org 404s before the
    // service-client write can touch it.
    await loadContractHeader(userMetadata.organizationId, contractId);

    await saveContractAllocation({
      organizationId: userMetadata.organizationId,
      contractId,
      scopes: body.scopes,
      userId: userMetadata.userId,
      changedBy:
        userMetadata.userProfile?.name ??
        userMetadata.userProfile?.email ??
        undefined,
    });
    return c.json({ success: true });
  } catch (error) {
    return errorResponse(c, error, 'Failed to save the cost allocation');
  }
}

const BUDGET_FISCAL_YEAR_MIN = 1900;
const BUDGET_FISCAL_YEAR_MAX = 2200;

export interface SaveAllocationBudgetInput {
  target: BudgetTarget;
  fiscalYear: number;
  /** null clears the budget for that fiscal year. */
  amount: number | null;
}

/**
 * The summary report's inline budget edit: one (target, fiscal year) amount in
 * the org base currency, behind the same `manage Organization` gate as an
 * allocation save (decision Q4).
 */
export async function putAllocationBudget(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    await assertCostAllocationEnabled(userMetadata);
    await assertCanManageOrganization('budgets');
    const { target, fiscalYear, amount } = (await jsonBody(
      c,
    )) as unknown as SaveAllocationBudgetInput;
    if (
      !target ||
      (target.kind !== 'org_unit' && target.kind !== 'employee') ||
      !Number.isInteger(target.id) ||
      target.id < 1
    ) {
      throw new ValidationError('Invalid budget target');
    }
    if (
      !Number.isInteger(fiscalYear) ||
      fiscalYear < BUDGET_FISCAL_YEAR_MIN ||
      fiscalYear > BUDGET_FISCAL_YEAR_MAX
    ) {
      throw new ValidationError('Invalid fiscal year');
    }
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      throw new ValidationError('A budget must be zero or more');
    }
    // A finite amount can still overflow the *100 in cent rounding (1e307).
    const roundedAmount =
      amount === null ? null : Math.round(amount * 100) / 100;
    if (roundedAmount !== null && !Number.isFinite(roundedAmount)) {
      throw new ValidationError('Budget amount is too large');
    }

    await assertBudgetTargetInOrg(userMetadata.organizationId, target);
    await saveBudget({
      organizationId: userMetadata.organizationId,
      target,
      fiscalYear,
      amount: roundedAmount,
      userId: userMetadata.userId,
    });
    return c.json({ success: true });
  } catch (error) {
    return errorResponse(c, error, 'Failed to save the budget');
  }
}
