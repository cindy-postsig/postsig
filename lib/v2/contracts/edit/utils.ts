import type {
  PendingChanges,
  FieldChange,
  ProductDetailsChange,
  ProductUsersChange,
  ProductChange,
} from './types';
import {
  getEditableContractFieldKeys,
  isFieldEditable as isFieldEditableRegistry,
} from './field-registry';

// Derived from field-registry for backwards compatibility
export const EDITABLE_TEXT_FIELDS = getEditableContractFieldKeys();

export function isEditableField(fieldKey: string): boolean {
  return isFieldEditableRegistry('contracts', fieldKey);
}

export function computeChangedData(
  changes: PendingChanges,
): Record<string, FieldChange> {
  const changedData: Record<string, FieldChange> = {};
  for (const [key, change] of Object.entries(changes)) {
    if (change.oldValue !== change.newValue) {
      changedData[key] = change;
    }
  }
  return changedData;
}

export function extractNewValues(
  changes: PendingChanges,
): Record<string, string | null> {
  const newValues: Record<string, string | null> = {};
  for (const [key, change] of Object.entries(changes)) {
    if (change.oldValue !== change.newValue) {
      newValues[key] = change.newValue;
    }
  }
  return newValues;
}

export function countChangedFields(changes: PendingChanges): number {
  return Object.values(changes).filter(
    (change) => change.oldValue !== change.newValue,
  ).length;
}

// =============================================================================
// Product Edit Fields & Helpers
// =============================================================================

export function isEditableProductDetailsField(fieldKey: string): boolean {
  return isFieldEditableRegistry('vendor_products_details', fieldKey);
}

export function isEditableProductUsersField(fieldKey: string): boolean {
  return isFieldEditableRegistry('vendor_products_users', fieldKey);
}

export function isEditableProductField(fieldKey: string): boolean {
  return isFieldEditableRegistry('vendor_products', fieldKey);
}

export function filterChangedProductDetails(
  changes: ProductDetailsChange[],
): ProductDetailsChange[] {
  return changes.filter((change) => {
    const feesChanged =
      change.changes.fees &&
      change.changes.fees.oldValue !== change.changes.fees.newValue;
    return feesChanged;
  });
}

export function filterChangedProductUsers(
  changes: ProductUsersChange[],
): ProductUsersChange[] {
  return changes.filter((change) => {
    const usersChanged =
      change.changes.number_of_users &&
      change.changes.number_of_users.oldValue !==
        change.changes.number_of_users.newValue;
    return usersChanged;
  });
}

export function filterChangedProducts(
  changes: ProductChange[],
): ProductChange[] {
  return changes.filter((change) => {
    const deliveryChanged =
      change.changes.delivery_method_id &&
      change.changes.delivery_method_id.oldValue !==
        change.changes.delivery_method_id.newValue;
    return deliveryChanged;
  });
}

export function countProductChanges(
  detailsChanges?: ProductDetailsChange[],
  usersChanges?: ProductUsersChange[],
  productChanges?: ProductChange[],
): number {
  let count = 0;

  if (detailsChanges) {
    count += filterChangedProductDetails(detailsChanges).length;
  }
  if (usersChanges) {
    count += filterChangedProductUsers(usersChanges).length;
  }
  if (productChanges) {
    count += filterChangedProducts(productChanges).length;
  }

  return count;
}
