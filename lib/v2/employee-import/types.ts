import { z } from 'zod';

export const EMPLOYEE_IMPORT_MAPPING_KEY = 'employees.import_mapping';

export const IMPORT_TARGET_FIELDS = [
  'full_name',
  'first_name',
  'last_name',
  'email',
  'employee_id',
  'region',
  'country',
  'division',
  'business_group',
  'department',
  'cost_center',
  'business_unit',
  'entity',
  'team',
  'start_date',
  'leave_date',
] as const;

export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number];

export const FIELD_LABELS: Record<ImportTargetField, string> = {
  full_name: 'Full Name (splits into First + Last)',
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  employee_id: 'Employee ID',
  region: 'Region',
  country: 'Country',
  division: 'Division',
  business_group: 'Business Group',
  department: 'Department',
  cost_center: 'Cost Center',
  business_unit: 'Business Unit',
  entity: 'Entity',
  team: 'Team',
  start_date: 'Start Date',
  leave_date: 'Leave Date',
};

export const DEFAULT_SEPARATOR = ' - ';

/**
 * Fields whose value is looked up rather than taken literally from the file.
 * Gated here (not in the UI) so the resolver knows which fields to collect
 * distinct source values for — collecting them for every field would put a
 * 1,589-value column like Cost Center into each debounced preview payload.
 */
export const VALUE_MAPPABLE_FIELDS = ['country', 'business_group'] as const;

/** Fields derived from another field's resolved value, and their source. */
export const DERIVED_FIELD_SOURCES = {
  country: 'region',
  business_group: 'division',
} as const satisfies Partial<Record<ImportTargetField, ImportTargetField>>;

export type DerivedField = keyof typeof DERIVED_FIELD_SOURCES;

export function isValueMappable(field: ImportTargetField): boolean {
  return (VALUE_MAPPABLE_FIELDS as readonly ImportTargetField[]).includes(
    field,
  );
}

export function isDerivedField(
  field: ImportTargetField,
): field is DerivedField {
  return field in DERIVED_FIELD_SOURCES;
}

const SourceRefSchema = z.object({
  /** 0-based column index. The UI renders and accepts letters (A, B, … AD). */
  index: z.number().int().min(0).max(16383),
  /** When this source is blank or zero-like, the whole field resolves to ''. */
  required: z.boolean().optional(),
});

const FieldRuleSchema = z.object({
  /**
   * Empty only when `deriveFrom` is set — a derived field takes another
   * field's resolved value as its input instead of reading columns.
   */
  sources: z.array(SourceRefSchema).max(8).default([]),
  deriveFrom: z.enum(IMPORT_TARGET_FIELDS).optional(),
  separator: z.string().max(16).optional(),
  /** Keys are stored lowercased and trimmed; lookups normalize the same way. */
  valueMap: z.record(z.string(), z.string()).optional(),
});

export const EmployeeImportMappingSchema = z.object({
  version: z.literal(1),
  hasHeaderRow: z.boolean(),
  sheetName: z.string().optional(),
  fields: z.partialRecord(
    z.enum(IMPORT_TARGET_FIELDS),
    FieldRuleSchema.refine(
      (rule) => rule.sources.length > 0 || rule.deriveFrom !== undefined,
      { error: 'A field must read at least one column or derive from another' },
    ),
  ),
  updatedAt: z.string().optional(),
  updatedBy: z.string().optional(),
});

export type SourceRef = z.infer<typeof SourceRefSchema>;
export type FieldRule = z.infer<typeof FieldRuleSchema>;
export type EmployeeImportMapping = z.infer<typeof EmployeeImportMappingSchema>;

/** A single spreadsheet row, one entry per column, before any mapping is applied. */
export type SheetRow = unknown[];

export type ParsedSheet = {
  sheetNames: string[];
  sheetName: string;
  /** Dense: every row has the same length. */
  rows: SheetRow[];
  columnCount: number;
};

export type ColumnDescriptor = {
  index: number;
  letter: string;
  header: string | null;
  samples: string[];
  nonEmptyCount: number;
};

export type ResolvedEmployeeRow = {
  /** 1-based row number in the source file, for error messages. */
  rowNumber: number;
  first_name: string;
  last_name: string;
  email: string;
  employee_id: string;
  region: string;
  country: string;
  division: string;
  business_group: string;
  department: string;
  cost_center: string;
  business_unit: string;
  entity: string;
  team: string;
  start_date: string;
  leave_date: string;
  status?: 'inactive';
  isValid: boolean;
  invalidReasons: string[];
};
