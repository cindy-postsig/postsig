/**
 * Leavers Report Transform
 *
 * Builds a row per contract that has seats allocated to org_employees
 * whose status is 'inactive' or whose deleted_at is set. Emits a single
 * subrow per contract listing all departed employee names.
 */

import {
  buildContractTableRow,
  buildProductSubRows,
} from '@/lib/v2/contracts/transforms';
import { EnrichedContract } from '@/lib/v2/contracts/service';
import type {
  ContractTableRow,
  LeaverSubRow,
  ProductSubRow,
} from '@/lib/v2/core/types';
import { calculateProductUsage } from '@/app/lib/budget/productUsage';
import type { LeaverEmployee } from '../definitions/leavers';

export type LeaversReportRow = Omit<ContractTableRow, 'subRows'> & {
  departedLicensesCount: number;
  seatUsage: {
    assigned: number;
    licensed: number;
  };
  seatUsageDisplay: string;
  isEnterprise?: boolean;
  subRows?: (ProductSubRow | LeaverSubRow)[];
};

interface ContractUserShape {
  id: number;
  org_employee_id: number | null;
  product_id?: number | null;
}

export function buildLeaversRow(
  contract: EnrichedContract,
  leaverEmployees: Map<number, LeaverEmployee>,
): LeaversReportRow {
  const base = buildContractTableRow(contract);

  const contractUsers = (contract.contract.contract_users ??
    []) as ContractUserShape[];

  const departedEmployeeNamesSet = new Map<number, string>();
  let departedLicensesCount = 0;

  for (const cu of contractUsers) {
    if (cu.org_employee_id == null) continue;
    const emp = leaverEmployees.get(cu.org_employee_id);
    if (!emp) continue;
    departedLicensesCount += 1;
    if (!departedEmployeeNamesSet.has(emp.id)) {
      departedEmployeeNamesSet.set(
        emp.id,
        `${emp.first_name} ${emp.last_name}`.trim(),
      );
    }
  }

  const departedEmployeeNames = [...departedEmployeeNamesSet.values()].sort(
    (a, b) => a.localeCompare(b),
  );

  const reportSubRows: LeaverSubRow[] =
    departedEmployeeNames.length > 0
      ? [
          {
            id: `report-leavers-${contract.id}`,
            contract_id: String(contract.id),
            isReportRow: true,
            isLeaverSubRow: true,
            reportType: 'leavers',
            departedEmployeeNames,
          },
        ]
      : [];

  // Build product subRows for multi-product contracts
  const productSubRows = buildProductSubRows(contract, base);
  const subRows: (ProductSubRow | LeaverSubRow)[] = [
    ...productSubRows,
    ...reportSubRows,
  ];

  const isEnterprise =
    contract.contract.vendor_products_users?.some(
      (vpu: { enterprise?: boolean }) => vpu.enterprise === true,
    ) ?? false;

  const currentBudget = base.currentBudget || 0;
  const currentProducts = contract.products.map((p) => ({
    vendor_products: { id: p.product_id, name: p.name },
    fees: p.currentFee,
    compoundedFees: p.currentFee,
    isSuperseded: p.isSuperseded,
  }));
  const productUsage = calculateProductUsage(
    contract.contract,
    currentProducts,
    currentBudget,
  );
  const assignedSeats = productUsage.totalSeats.assigned;
  const licensedSeats = productUsage.totalSeats.licensed;
  const seatUsageDisplay = isEnterprise
    ? 'Enterprise'
    : `${assignedSeats}/${licensedSeats}`;

  return {
    ...base,
    departedLicensesCount,
    seatUsage: { assigned: assignedSeats, licensed: licensedSeats },
    seatUsageDisplay,
    isEnterprise,
    subRows: subRows.length > 0 ? subRows : undefined,
  };
}
