import type { EditableTable, FieldValue } from './field-registry';

export interface FieldChange {
  oldValue: string | null;
  newValue: string | null;
}

export type PendingChanges = Record<string, FieldChange>;

export interface ContractEditState {
  isEditMode: boolean;
  pendingChanges: PendingChanges;
  editedFieldCount: number;
}

export interface SaveContractEditsParams {
  contractId: number;
  changes: PendingChanges;
  actor?: 'user' | 'system';
}

export interface SaveContractEditsResult {
  success: boolean;
  versionId?: number;
  error?: string;
}

export interface ContractVersionSnapshot {
  contract_id: number;
  version_id: number;
  valid_from: string;
  valid_to: string | null;
  changed_data: PendingChanges;
  created_by: string;
  created_at: string;
  actor: string;
  comment: string | null;
}

// =============================================================================
// Product Edit Types (legacy, for backwards compatibility)
// =============================================================================

export interface ProductFieldChange<T> {
  oldValue: T | null;
  newValue: T | null;
}

export interface ProductDetailsChange {
  detailsId: number;
  productId: number;
  year: number;
  changes: {
    fees?: ProductFieldChange<number>;
  };
}

export interface ProductUsersChange {
  usersId: number;
  productId: number;
  changes: {
    number_of_users?: ProductFieldChange<number>;
  };
}

export interface ProductChange {
  productId: number;
  changes: {
    delivery_method_id?: ProductFieldChange<number>;
  };
}

export interface SaveProductEditsParams {
  contractId: number;
  detailsChanges?: ProductDetailsChange[];
  usersChanges?: ProductUsersChange[];
  productChanges?: ProductChange[];
  actor?: 'user' | 'system';
}

export interface SaveProductEditsResult {
  success: boolean;
  contractVersionId?: number;
  error?: string;
}

export interface RevertProductFieldParams {
  contractId: number;
  table:
    | 'vendor_products_details'
    | 'vendor_products_users'
    | 'vendor_products';
  recordId: number;
  fieldKey: string;
  targetValue: number | null;
}

// =============================================================================
// Unified Edit Types (new architecture)
// =============================================================================

export interface UnifiedFieldChange {
  table: EditableTable;
  recordId: number;
  field: string;
  oldValue: FieldValue;
  newValue: FieldValue;
  context?: {
    productId?: number;
    productName?: string;
    year?: number;
    oldDisplayValue?: string | null;
    newDisplayValue?: string | null;
    [key: string]: unknown;
  };
}

// Key format: "${table}:${recordId}:${field}"
export type ChangeKey = `${string}:${number}:${string}`;

export function makeChangeKey(
  table: string,
  recordId: number,
  field: string,
): ChangeKey {
  return `${table}:${recordId}:${field}` as ChangeKey;
}

export function parseChangeKey(key: ChangeKey): {
  table: string;
  recordId: number;
  field: string;
} {
  const parts = key.split(':');
  const field = parts.pop()!;
  const recordId = parseInt(parts.pop()!, 10);
  const table = parts.join(':');
  return { table, recordId, field };
}

export type UnifiedPendingChanges = Map<ChangeKey, UnifiedFieldChange>;

export interface SaveEditsParams {
  contractId: number;
  changes: UnifiedFieldChange[];
  actor?: 'user' | 'system';
}

export interface SaveEditsResult {
  success: boolean;
  contractVersionId?: number;
  error?: string;
}
