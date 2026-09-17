/**
 * Default column sets for every configurable CPM list view.
 *
 * These were inline arrays in each route file. They live here so the layout
 * policy module can be tested against the real defaults (label coverage, the
 * "column absent from a stored order" case) rather than against fixtures that
 * quietly drift from what ships.
 *
 * Call sites still own their conditional bits — `select` depends on
 * permissions, `discount` on whether the data has any — so they compose on top
 * of these rather than being replaced by them.
 */

import type { ColumnLayoutViewKey, ColumnSpec } from './columnLayout';

/** Without `select`, which `AllContractsPage` prepends when the user may manage. */
export const CONTRACTS_ALL_COLUMNS: readonly ColumnSpec[] = [
  'vendor',
  'orderNumber',
  'product',
  'folder',
  'type',
  'renewalType',
  'termStartDate',
  'cancelByDate',
  'termEndDate',
  'currentBudget',
  'projectedBudget',
  'totalContractValue',
  'tags',
  'businessSponsor',
  'businessGroup',
];

export const CONTRACTS_PENDING_COLUMNS: readonly ColumnSpec[] = [
  'expander',
  'vendor',
  'orderNumber',
  'product',
  'type',
  'renewalType',
  'termStartDate',
  'cancelByDate',
  'termEndDate',
  'currentBudget',
  'projectedBudget',
  'totalContractValue',
  'tags',
  'businessSponsor',
  'businessGroup',
];

export const CONTRACTS_ARCHIVED_COLUMNS: readonly ColumnSpec[] = [
  'expander',
  'vendor',
  'orderNumber',
  'product',
  'type',
  'renewalType',
  'termStartDate',
  'cancelByDate',
  'termEndDate',
  'currentBudget',
  'projectedBudget',
  'totalContractValue',
  'tags',
  'businessSponsor',
  'businessGroup',
];

export const CONTRACTS_FOLDER_COLUMNS: readonly ColumnSpec[] = [
  'select',
  'expander',
  'vendor',
  'orderNumber',
  'product',
  'type',
  'renewalType',
  'termStartDate',
  'cancelByDate',
  'termEndDate',
  'currentBudget',
  'projectedBudget',
  'totalContractValue',
  'tags',
  'businessSponsor',
  'businessGroup',
];

export const CALENDAR_LIST_COLUMNS: readonly ColumnSpec[] = [
  'vendor',
  'orderNumber',
  'product',
  'type',
  'term',
  'renewalType',
  'termStartDate',
  'cancelByDate',
  'termEndDate',
  'currentBudget',
  'projectedBudget',
  'totalContractValue',
  'businessSponsor',
  'businessGroup',
];

/** Includes `discount`, which `BudgetOverviewServer` drops when no data has one. */
export const BUDGET_OVERVIEW_COLUMNS: readonly ColumnSpec[] = [
  'vendor',
  'orderNumber',
  'product',
  'type',
  'renewalType',
  'termStartDate',
  'cancelByDate',
  'termEndDate',
  'discount',
  'currentBudget',
  'projectedBudget',
  'annualDifference',
  'tags',
  'businessSponsor',
  'businessGroup',
];

export const ARCHIVED_STANDALONE_COLUMNS: readonly ColumnSpec[] = [
  'expander',
  'vendor',
  'product',
  'type',
  'renewalType',
  'termStartDate',
  'cancelByDate',
  'termEndDate',
  'totalContractValue',
  'status',
];

export const INVENTORY_LIST_COLUMNS: readonly ColumnSpec[] = [
  'expander',
  'alerts',
  'vendor',
  'productName',
  'licensesCount',
  'activeUsers',
  'deliveryMethods',
  'startDate',
  'endDate',
  'status',
  'cost',
  'businessSponsor',
  'businessGroup',
];

/** `assetClasses` is offered but off by default (see `columnLayout.ts`). */
export const VENDORS_LIST_COLUMNS: readonly ColumnSpec[] = [
  'vendor',
  'activeAgreements',
  'products',
  'cancelByDate',
  'termEndDate',
  'currentSpend',
  'projectedSpend',
  'spendShare',
  'relationshipStart',
  'assetClasses',
];

/**
 * The system folders (Invoices / Trials / NDAs) keep their column sets in
 * `systemFolderConfig.ts`, next to the type ids and filters that define them.
 * Re-exported here only so the label-coverage test sees every configurable
 * view in one place.
 */
export const LIST_VIEW_DEFAULT_COLUMNS: Record<
  Exclude<
    ColumnLayoutViewKey,
    'contracts.invoices' | 'contracts.trials' | 'contracts.ndas'
  >,
  readonly ColumnSpec[]
> = {
  'contracts.all': CONTRACTS_ALL_COLUMNS,
  'contracts.pending': CONTRACTS_PENDING_COLUMNS,
  'contracts.archived': CONTRACTS_ARCHIVED_COLUMNS,
  'contracts.folder': CONTRACTS_FOLDER_COLUMNS,
  'calendar.list': CALENDAR_LIST_COLUMNS,
  'budget.overview': BUDGET_OVERVIEW_COLUMNS,
  'archived.standalone': ARCHIVED_STANDALONE_COLUMNS,
  'inventory.list': INVENTORY_LIST_COLUMNS,
  'vendors.list': VENDORS_LIST_COLUMNS,
};
