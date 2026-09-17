import type { FieldDefinition } from '@/app/ui/contracts/contractFieldConfigs';

// =============================================================================
// Types
// =============================================================================

type FieldValueType = 'text' | 'number' | 'select' | 'date' | 'boolean';

export type FieldValue = string | number | boolean | null;

export type EditableTable =
  | 'contracts'
  | 'contracts_other_attributes'
  | 'contracts_metadata'
  | 'contract_product_credits'
  | 'vendor_products'
  | 'vendor_products_details'
  | 'vendor_products_users';

/**
 * Pseudo-tables that address a path inside one of the contracts JSON columns
 * rather than a real table. The value is the column the jsonPath is rooted at.
 */
export const JSON_COLUMN_BY_TABLE = {
  contracts_other_attributes: 'other_attributes',
  contracts_metadata: 'metadata',
} as const;

export type JsonEditableTable = keyof typeof JSON_COLUMN_BY_TABLE;

export function isJsonEditableTable(table: string): table is JsonEditableTable {
  return table in JSON_COLUMN_BY_TABLE;
}

interface StaticOptions {
  type: 'static';
  values: Array<{ value: number | string; label: string }>;
}

interface AsyncOptions {
  type: 'async';
  queryKey: string[];
  fetcherName: string;
}

type OptionsConfig = StaticOptions | AsyncOptions;

interface ValidationConfig {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  message?: string;
}

export interface JsonFieldPath {
  path: string[];
  arrayKey?: string;
  valueKey: string;
}

export interface EditableFieldDefinition {
  key: string;
  table: EditableTable;
  title: string;
  valueType: FieldValueType;
  tooltip?: string;
  options?: OptionsConfig;
  validation?: ValidationConfig;
  versionTable?: string;
  jsonPath?: JsonFieldPath;
}

// =============================================================================
// Registry
// =============================================================================

// Contract text fields - these map directly to contracts table columns
const CONTRACT_TEXT_FIELDS: Array<{ key: string; title: string }> = [
  { key: 'payment_terms', title: 'Payment Terms' },
  { key: 'cancellation_process', title: 'Cancellation Process' },
  { key: 'scope_of_use', title: 'Scope of Use' },
  { key: 'permissions', title: 'Permissions' },
  { key: 'exclusivity_terms', title: 'Exclusivity Terms' },
  { key: 'distribution_rights', title: 'Distribution Rights' },
  { key: 'geo_restrictions', title: 'Geographic Restrictions' },
  { key: 'marketing_rights', title: 'Marketing Rights' },
  { key: 'suspension_of_service', title: 'Suspension of Service' },
  { key: 'end_users', title: 'End Users' },
  { key: 'internal_external_users', title: 'User Type' },
  { key: 'activities', title: 'Activities' },
  { key: 'derivative_works', title: 'Derivative Works' },
  { key: 'market_data_types', title: 'Market Data Types' },
  { key: 'audit_requirements', title: 'Audit Requirements' },
  { key: 'data_disposal_tnc', title: 'Data Disposal Terms and Conditions' },
  {
    key: 'arbitration_and_conflict_resolution',
    title: 'Arbitration and Conflict Resolution',
  },
  { key: 'service_level_agreements', title: 'Service Level Agreements' },
  { key: 'security_awareness', title: 'Security Awareness and Training' },
  { key: 'cost_mitigation', title: 'Incident Related Cost Mitigation' },
  { key: 'ai_training_restrictions', title: 'AI Training Restrictions' },
  { key: 'vendor_location', title: 'Vendor Location' },
];

const EDITABLE_FIELDS: Map<string, EditableFieldDefinition> = new Map();

// Register contract text fields
for (const { key, title } of CONTRACT_TEXT_FIELDS) {
  EDITABLE_FIELDS.set(`contracts:${key}`, {
    key,
    table: 'contracts',
    title,
    valueType: 'text',
    versionTable: 'contract_versions',
  });
}

// Register product fields
EDITABLE_FIELDS.set('vendor_products:delivery_method_id', {
  key: 'delivery_method_id',
  table: 'vendor_products',
  title: 'Delivery Method',
  valueType: 'select',
  options: {
    type: 'async',
    queryKey: ['dataDeliveryTypes'],
    fetcherName: 'getAllDataDeliveryTypes',
  },
  versionTable: 'vendor_products_versions',
});

// Master data on the product, not the contract line: editing it changes the code
// for every contract linked to this product. Unique per vendor, so a clash with
// another product is rejected rather than silently merged.
EDITABLE_FIELDS.set('vendor_products:product_code', {
  key: 'product_code',
  table: 'vendor_products',
  title: 'Product Code',
  valueType: 'text',
  tooltip:
    'Exchange Agreement Product Code, e.g. MAFFL2-TPLNDRUA. Used to match this product across Schedule of Fees, Service Order and Invoice documents.',
  versionTable: 'vendor_products_versions',
});

EDITABLE_FIELDS.set('vendor_products_details:fees', {
  key: 'fees',
  table: 'vendor_products_details',
  title: 'Fees',
  valueType: 'number',
  validation: { min: 0 },
  versionTable: 'vendor_products_details_versions',
});

EDITABLE_FIELDS.set('vendor_products_users:number_of_users', {
  key: 'number_of_users',
  table: 'vendor_products_users',
  title: 'Number of Users',
  valueType: 'number',
  validation: { min: 0 },
  versionTable: 'vendor_products_users_versions',
});

EDITABLE_FIELDS.set('contract_product_credits:amount', {
  key: 'amount',
  table: 'contract_product_credits',
  title: 'Credit',
  valueType: 'number',
  validation: { min: 0 },
});

EDITABLE_FIELDS.set('contracts_other_attributes:sales_tax', {
  key: 'sales_tax',
  table: 'contracts_other_attributes',
  title: 'Sales Tax',
  valueType: 'number',
  validation: { min: 0 },
  jsonPath: {
    path: ['invoice_fields', 'sales_tax_details'],
    arrayKey: 'year',
    valueKey: 'sales_tax',
  },
});

const ORDER_NUMBER_JSON_PATH: JsonFieldPath = {
  path: ['lineage', 'order_number'],
  valueKey: 'order_number',
};

EDITABLE_FIELDS.set('contracts_metadata:order_number', {
  key: 'order_number',
  table: 'contracts_metadata',
  title: 'Contract No.',
  valueType: 'text',
  jsonPath: ORDER_NUMBER_JSON_PATH,
});

EDITABLE_FIELDS.set('contracts_metadata:invoice_number', {
  key: 'invoice_number',
  table: 'contracts_metadata',
  title: 'Invoice No.',
  valueType: 'text',
  jsonPath: ORDER_NUMBER_JSON_PATH,
});

// =============================================================================
// Accessors
// =============================================================================

export function getEditableField(
  table: string,
  field: string,
): EditableFieldDefinition | undefined {
  return EDITABLE_FIELDS.get(`${table}:${field}`);
}

export function isFieldEditable(table: string, field: string): boolean {
  return EDITABLE_FIELDS.has(`${table}:${field}`);
}

export function getEditableFieldsForTable(
  table: EditableTable,
): EditableFieldDefinition[] {
  return Array.from(EDITABLE_FIELDS.values()).filter((f) => f.table === table);
}

export function getAllEditableFields(): EditableFieldDefinition[] {
  return Array.from(EDITABLE_FIELDS.values());
}

// For backwards compatibility with existing EDITABLE_TEXT_FIELDS usage
export function getEditableContractFieldKeys(): Set<string> {
  return new Set(
    Array.from(EDITABLE_FIELDS.values())
      .filter((f) => f.table === 'contracts')
      .map((f) => f.key),
  );
}
