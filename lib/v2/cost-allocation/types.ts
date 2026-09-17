import type { OrgUnitNode } from '@/lib/v2/org-units';
import type { HierarchyMap } from '@/lib/inventory/hierarchyUtils';

export type AllocationMode = 'active_users' | 'manual';

export function isAllocationMode(value: unknown): value is AllocationMode {
  return value === 'active_users' || value === 'manual';
}

export interface AllocationRow {
  id: number;
  contract_id: number;
  product_id: number | null;
  mode: AllocationMode;
}

export interface AllocationLineRow {
  id: number;
  allocation_id: number;
  org_unit_id: number | null;
  org_employee_id: number | null;
  percent: number;
}

export interface AllocationEmployee {
  id: number;
  name: string;
  org_unit_id: number | null;
  /** The flat cost_center node whose name matches the employee's cost_center value; the Q2b routing target. */
  cost_center_unit_id: number | null;
  /**
   * `isActiveEmployee` over the roster row. A seat outlives the employment, so
   * `active_users` gates on this rather than on the seat's `released_at`;
   * lines already pointing at an inactive employee still resolve.
   */
  active: boolean;
}

/** A current (released_at null) contract_users row, linked or not. */
export interface ContractSeat {
  contract_id: number;
  product_id: number | null;
  org_employee_id: number | null;
}

export interface AllocationContext {
  allocationsByContractId: Map<number, AllocationRow[]>;
  linesByAllocationId: Map<number, AllocationLineRow[]>;
  unitsById: Map<number, OrgUnitNode>;
  employeesById: Map<number, AllocationEmployee>;
  seatsByContractId: Map<number, ContractSeat[]>;
  hierarchy: HierarchyMap;
}

export interface OrgUnitTargetRef {
  kind: 'org_unit';
  id: number;
  name: string;
}

/** A product the contract carries; the subject of a by-product allocation scope. */
export interface AllocationProduct {
  id: number;
  name: string;
}

export type AllocationTargetRef =
  | OrgUnitTargetRef
  | {
      kind: 'employee';
      id: number;
      name: string;
      orgUnitId: number | null;
      /**
       * Set on resolver-built refs (the only refs a rollup sees); picker and
       * editor refs never enter a rollup and leave it absent.
       */
      costCenterUnitId?: number | null;
    };

export interface ResolvedLine {
  target: AllocationTargetRef;
  percent: number;
}

export interface ResolvedScope {
  /** null = whole-contract scope */
  productId: number | null;
  mode: AllocationMode;
  /** The contract whose allocation row resolved this scope; differs from the resolved contract when inherited. */
  sourceContractId: number;
  lines: ResolvedLine[];
  /** active_users only: current seats excluded because they carry no org_employee_id. */
  unlinkedUserCount: number;
}

export interface ResolvedContractAllocation {
  contractId: number;
  /** Empty = unassigned (the engine's existing bucket). */
  scopes: ResolvedScope[];
}

export interface RolledUpLine {
  /**
   * The node at the requested level, or null when the line lands nowhere at
   * that level — a target above the level, a ragged branch, a cost center, an
   * employee outside the tree. Money routes a null to `unassigned`; a label
   * drops it. Never the original target: only a business group belongs in a
   * business-group column.
   */
  target: OrgUnitTargetRef | null;
  percent: number;
  /** Direct spend: the line was allocated at the node itself. Rolled-up lines came from below. */
  direct: boolean;
}
