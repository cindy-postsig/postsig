/**
 * Leavers Report Pipeline Definition
 *
 * Surfaces contracts that have seats allocated to employees who have left
 * (org_employees with status='inactive' or deleted_at IS NOT NULL) so the
 * user can re-allocate those seats.
 */

import { ReportPipeline, FilterResult } from '../pipeline/types';
import { buildLeaversRow, LeaversReportRow } from '../transforms/leavers';
import { createClient } from '@/utils/supabase/server';
import { getUserMetadata } from '@/data/users';
import { DatabaseError } from '@/lib/errors';
import logger from '@/utils/pino';

export interface LeaverEmployee {
  id: number;
  first_name: string;
  last_name: string;
}

export interface LeaversContext {
  leaverEmployees: Map<number, LeaverEmployee>;
}

export interface LeaversReportMetadata {
  productCount: number;
}

interface ContractUserShape {
  org_employee_id: number | null;
  product_id?: number | null;
}

async function fetchLeaverEmployees(): Promise<Map<number, LeaverEmployee>> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('org_employees')
    .select('id, first_name, last_name')
    .eq('organization_id', userMetadata.organizationId)
    .or('status.eq.inactive,deleted_at.not.is.null');

  if (error) {
    logger.error(
      { error, organizationId: userMetadata.organizationId },
      'Failed to fetch leaver org_employees',
    );
    throw new DatabaseError('Failed to fetch leaver employees');
  }

  const map = new Map<number, LeaverEmployee>();
  for (const row of data ?? []) {
    map.set(row.id, row as LeaverEmployee);
  }
  return map;
}

export const leaversReport: ReportPipeline<
  Record<string, unknown>,
  LeaversContext,
  LeaversReportRow
> = {
  filter: async (contracts): Promise<FilterResult<LeaversContext>> => {
    const leaverEmployees = await fetchLeaverEmployees();
    if (leaverEmployees.size === 0) {
      return {
        contracts: [],
        context: { leaverEmployees },
        metadata: { productCount: 0 },
      };
    }

    const filtered: typeof contracts = [];
    const productIds = new Set<number>();

    for (const c of contracts) {
      const users = (c.contract.contract_users ?? []) as ContractUserShape[];
      let hasLeaver = false;
      for (const u of users) {
        if (u.org_employee_id == null) continue;
        if (!leaverEmployees.has(u.org_employee_id)) continue;
        hasLeaver = true;
        if (u.product_id != null) productIds.add(u.product_id);
      }
      if (hasLeaver) filtered.push(c);
    }

    return {
      contracts: filtered,
      context: { leaverEmployees },
      metadata: { productCount: productIds.size },
    };
  },

  transform: (contracts, context) => {
    const employees =
      context?.leaverEmployees ?? new Map<number, LeaverEmployee>();
    return contracts.map((c) => buildLeaversRow(c, employees));
  },

  calculateTotal: (rows) => {
    return rows.reduce((sum, row) => sum + (row.departedLicensesCount || 0), 0);
  },

  metadata: {
    defaultSortColumn: 'departedLicensesCount',
    defaultSortDirection: 'desc',
  },
};
