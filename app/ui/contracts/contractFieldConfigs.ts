import { formatCurrency, formatNumberOfMonths } from '@/app/lib/utils';
import { baseContractTypeId, contractTypes } from '@/app/lib/constants';
import { Dates } from '@/constants/types';
import { formatInheritedCancelByTooltip } from '@/lib/v2/core/lineage';
import { type InheritedCancelByDate } from '@/lib/v2/core/types';
import type { SalesTaxDetail } from '@/lib/v2/products/types';
import _ from 'lodash';

// Field definition with all possible configurations
export interface FieldDefinition {
  key: string;
  title: string;
  dataKey?: string;
  formatter?: (value: any, contract?: any) => string;
  condition?: (contract: any) => boolean;
  jsx?: (value: any, contract?: any) => any;
  citationId?: string;
  isLegacy?: boolean;
  tooltip?: string;
  /** When true, the rendered value is a date and follows the user's format preference. */
  isDate?: boolean;
}

// Zone types
export type ZoneType = 'overview' | 'postsigMetadata' | 'contractDetails';

// Section configuration for contract details zone
export interface DetailSection {
  title: string;
  fields: string[]; // Field keys to include
}

// Contract configuration
export interface ContractConfig {
  overview: string[]; // Field keys for overview zone
  postsigMetadata: string[]; // Field keys for postsig metadata zone
  contractDetails: DetailSection[]; // Sections for contract details zone
  tabs: string[]; // Available tabs: 'allocation', 'owner', 'users', 'dora', 'audit', 'lineage'
}

/** Field keys that render the cancel-by date and can fall back to the MSA's. */
const CANCEL_BY_DATE_FIELD_KEYS = ['cancel_by_date', 'cancel_date'];

/**
 * The cancel-by date a service order inherits from its MSA parent, if any.
 * Attached to the contract server-side (see the contract detail page).
 */
export function getInheritedCancelByDate(
  contract: any,
): InheritedCancelByDate | null {
  return contract?.inherited_cancel_by_date ?? null;
}

/** Tooltip explaining a cancel-by date that came from the MSA, else the field's own. */
export function getFieldTooltip(
  contract: any,
  field: FieldDefinition,
): string | undefined {
  if (!CANCEL_BY_DATE_FIELD_KEYS.includes(field.key)) return field.tooltip;

  const inherited = getInheritedCancelByDate(contract);
  if (!inherited) return field.tooltip;

  return formatInheritedCancelByTooltip(inherited.noticeDays);
}

/** Falls back to the MSA's notice period when the contract states no date itself. */
function formatCancelByDate(dates: Dates[] | null, contract?: any): string {
  return dates?.[0]?.date || getInheritedCancelByDate(contract)?.date || 'N/A';
}

// All field definitions registry
export const FIELD_DEFINITIONS: Record<string, FieldDefinition> = {
  // Date fields
  term_start_date: {
    key: 'term_start_date',
    title: 'Start Date',
    dataKey: 'term_start_date',
    formatter: (dates: Dates[] | null) => dates?.[0]?.date || 'N/A',
    citationId: 'term_start_date',
    isDate: true,
  },
  term_end_date: {
    key: 'term_end_date',
    title: 'End Date',
    dataKey: 'term_end_date',
    formatter: (dates: Dates[] | null) => dates?.[0]?.date || 'N/A',
    citationId: 'term_end_date',
    isDate: true,
  },
  cancel_by_date: {
    key: 'cancel_by_date',
    title: 'Cancel By Date',
    dataKey: 'cancel_date',
    formatter: formatCancelByDate,
    citationId: 'cancel_by_date',
    isDate: true,
  },
  cancel_date: {
    key: 'cancel_date',
    title: 'Cancel By Date',
    dataKey: 'cancel_date',
    formatter: formatCancelByDate,
    citationId: 'cancel_date',
    isDate: true,
  },
  execution_date: {
    key: 'execution_date',
    title: 'Execution Date',
    dataKey: 'execution_date',
    formatter: (value: string) => value || 'N/A',
    citationId: 'execution_date',
    isDate: true,
  },
  subscription_term: {
    key: 'subscription_term',
    title: 'Subscription Term',
    dataKey: 'subscription_term',
    formatter: (value: number) => (value ? formatNumberOfMonths(value) : 'N/A'),
    citationId: 'subscription_term',
  },
  renewal_type: {
    key: 'renewal_type',
    title: 'Renewal Type',
    dataKey: 'renewal_type',
    formatter: (value: string) => value || 'N/A',
    condition: (contract: any) => !_.isNull(contract.renewal_type),
    citationId: 'renewal_type',
  },
  multi_year: {
    key: 'multi_year',
    title: 'Multi-Year Agreement',
    dataKey: 'multi_year',
    formatter: (value: boolean) =>
      !_.isNull(value) ? (value ? 'Yes' : 'No') : 'N/A',
    condition: (contract: any) => !_.isNull(contract.multi_year),
    citationId: 'multi_year',
  },
  billing_frequency: {
    key: 'billing_frequency',
    title: 'Billing Frequency',
    dataKey: 'billing_frequency',
    citationId: 'billing_frequency',
  },
  currency: {
    key: 'currency',
    title: 'Currency',
    dataKey: 'currency',
    formatter: (value: string) => value?.toUpperCase() || '',
    citationId: 'currency',
  },
  extended_confidentiality_period: {
    key: 'extended_confidentiality_period',
    title: 'Extended Confidentiality Term',
    dataKey: 'other_attributes.nda_fields.extended_confidentiality_period',
    formatter: (value: any, contract: any) => {
      if (!value) return 'N/A';

      const months = Number(value);
      const termEndDate = (contract.term_end_date as Dates[] | null)?.[0]?.date;

      if (termEndDate && !isNaN(months)) {
        const { addMonths, parseISO, format } = require('date-fns');
        const endDate = addMonths(parseISO(termEndDate), months);
        return format(endDate, 'yyyy-MM-dd');
      }

      return !isNaN(months) ? formatNumberOfMonths(months) : 'N/A';
    },
    citationId: 'extended_confidentiality_period',
    isDate: true,
  },
  order_number: {
    key: 'order_number',
    title: 'Contract No.',
    dataKey: 'metadata.lineage.order_number',
    formatter: (value: any) =>
      typeof value === 'string' || typeof value === 'number'
        ? String(value).trim()
        : '',
    citationId: 'order_number',
  },
  invoice_number: {
    key: 'invoice_number',
    title: 'Invoice No.',
    dataKey: 'metadata.lineage.order_number',
    formatter: (value: any) =>
      typeof value === 'string' || typeof value === 'number'
        ? String(value).trim()
        : '',
    citationId: 'invoice_number',
  },
  billing_period_end_date: {
    key: 'billing_period_end_date',
    title: 'Billing Period End Date',
    dataKey: 'term_end_date',
    formatter: (dates: Dates[] | null) => dates?.[0]?.date || 'N/A',
    citationId: 'term_end_date',
    isDate: true,
  },
  billing_period_start_date: {
    key: 'billing_period_start_date',
    title: 'Billing Period Start Date',
    dataKey: 'term_start_date',
    formatter: (dates: Dates[] | null) => dates?.[0]?.date || 'N/A',
    citationId: 'term_start_date',
    isDate: true,
  },
  invoice_date: {
    key: 'invoice_date',
    title: 'Invoice Date',
    dataKey: 'execution_date',
    formatter: (value: string) => value || 'N/A',
    citationId: 'execution_date',
    isDate: true,
  },
  due_date: {
    key: 'due_date',
    title: 'Due Date',
    dataKey: 'due_date',
    formatter: (value: string) => value || 'N/A',
    citationId: 'due_date',
    isDate: true,
  },

  // Payment fields
  payment_terms: {
    key: 'payment_terms',
    title: 'Payment Terms',
    dataKey: 'payment_terms',
    citationId: 'payment_terms',
  },
  sales_tax_amount: {
    key: 'sales_tax_amount',
    title: 'Sales Tax Amount',
    dataKey: 'other_attributes.invoice_fields.sales_tax_details',
    formatter: (details: SalesTaxDetail[] | null, contract: any) => {
      const total = (details ?? []).reduce(
        (sum, detail) => sum + (parseFloat(String(detail.sales_tax)) || 0),
        0,
      );
      const currency = contract?.currency?.toUpperCase?.() || undefined;
      return formatCurrency(total, currency, true) ?? '';
    },
    condition: (contract: any) =>
      (
        contract?.other_attributes?.invoice_fields?.sales_tax_details ?? []
      ).some(
        (detail: SalesTaxDetail) => parseFloat(String(detail.sales_tax)) > 0,
      ),
  },
  sales_tax_percent: {
    key: 'sales_tax_percent',
    title: 'Sales Tax %',
    dataKey: 'other_attributes.invoice_fields.sales_tax_details',
    formatter: (details: SalesTaxDetail[] | null) => {
      const taxed = (details ?? []).find(
        (detail) => (parseFloat(String(detail.sales_tax)) || 0) > 0,
      );
      return taxed?.sales_tax_percent != null
        ? `${taxed.sales_tax_percent}%`
        : 'N/A';
    },
    condition: (contract: any) =>
      (
        contract?.other_attributes?.invoice_fields?.sales_tax_details ?? []
      ).some(
        (detail: SalesTaxDetail) => parseFloat(String(detail.sales_tax)) > 0,
      ),
  },
  renewal_period: {
    key: 'renewal_period',
    title: 'Renewal Period',
    dataKey: 'renewal_period',
    formatter: (value: number, contract: any) =>
      formatNumberOfMonths(value) || contract?.legacy_renewal_period || 'N/A',
    condition: (contract: any) =>
      contract.renewal_period || contract.legacy_renewal_period,
    citationId: 'renewal_period',
  },
  cancellation_process: {
    key: 'cancellation_process',
    title: 'Cancellation Process',
    dataKey: 'cancellation_process',
    citationId: 'cancellation_process',
  },

  // Permissions fields
  end_users: {
    key: 'end_users',
    title: 'End Users',
    dataKey: 'end_users',
    citationId: 'end_users',
  },
  number_of_users: {
    key: 'number_of_users',
    title: 'Number of Users',
    jsx: (_, contract: any) => 'number_of_users_jsx',
    condition: (contract: any) =>
      contract.vendor_products_users?.length > 0 || contract.number_of_users,
  },
  ai_training_restrictions: {
    key: 'ai_training_restrictions',
    title: 'AI Training Restrictions',
    dataKey: 'ai_training_restrictions',
    citationId: 'ai_training_restrictions',
  },
  market_data_types: {
    key: 'market_data_types',
    title: 'Market Data Types',
    dataKey: 'market_data_types',
    citationId: 'market_data_types',
  },
  data_delivery_types: {
    key: 'data_delivery_types',
    title: 'Data Delivery Method',
    dataKey: 'contract_data_delivery_types',
    jsx: (_, contract: any) => 'data_delivery_types_jsx',
    condition: (contract: any) => {
      // Check for product-specific delivery methods
      let hasProductDeliveryMethods = false;
      if (contract.vendor_products_details?.length > 0) {
        hasProductDeliveryMethods = contract.vendor_products_details.some(
          (detail: any) => detail.vendor_products?.data_delivery_types?.name,
        );
      }

      // Check for contract-level delivery methods
      const hasContractDeliveryMethods =
        contract.contract_data_delivery_types?.length > 0;

      // Show field if either type exists
      return hasProductDeliveryMethods || hasContractDeliveryMethods;
    },
    citationId: 'data_delivery_types',
  },
  internal_external_users: {
    key: 'internal_external_users',
    title: 'User Type',
    dataKey: 'internal_external_users',
    citationId: 'internal_external_users',
  },
  exclusivity_terms: {
    key: 'exclusivity_terms',
    title: 'Exclusivity Terms',
    dataKey: 'exclusivity_terms',
    citationId: 'exclusivity_terms',
  },
  distribution_rights: {
    key: 'distribution_rights',
    title: 'Distribution Rights',
    dataKey: 'distribution_rights',
    citationId: 'distribution_rights',
  },
  geo_restrictions: {
    key: 'geo_restrictions',
    title: 'Geographic Restrictions',
    dataKey: 'geo_restrictions',
    citationId: 'geo_restrictions',
  },
  derivative_works: {
    key: 'derivative_works',
    title: 'Derivative Works',
    dataKey: 'derivative_works',
    citationId: 'derivative_works',
  },
  activities: {
    key: 'activities',
    title: 'Activities',
    dataKey: 'activities',
    citationId: 'activities',
  },

  // Terms fields
  marketing_rights: {
    key: 'marketing_rights',
    title: 'Marketing Rights',
    dataKey: 'marketing_rights',
    citationId: 'marketing_rights',
  },
  suspension_of_service: {
    key: 'suspension_of_service',
    title: 'Suspension of Service',
    dataKey: 'suspension_of_service',
    citationId: 'suspension_of_service',
  },
  data_disposal_tnc: {
    key: 'data_disposal_tnc',
    title: 'Data Disposal Terms and Conditions',
    dataKey: 'data_disposal_tnc',
    citationId: 'data_disposal_tnc',
  },
  audit_requirements: {
    key: 'audit_requirements',
    title: 'Audit Requirements',
    dataKey: 'audit_requirements',
    citationId: 'audit_requirements',
  },
  service_level_agreements: {
    key: 'service_level_agreements',
    title: 'Service Level Agreements',
    dataKey: 'service_level_agreements',
    citationId: 'service_level_agreements',
  },
  cost_mitigation: {
    key: 'cost_mitigation',
    title: 'Incident Related Cost Mitigation',
    dataKey: 'cost_mitigation',
    citationId: 'cost_mitigation',
  },
  arbitration_and_conflict_resolution: {
    key: 'arbitration_and_conflict_resolution',
    title: 'Arbitration and Conflict Resolution',
    dataKey: 'arbitration_and_conflict_resolution',
    citationId: 'arbitration_and_conflict_resolution',
  },
  security_awareness: {
    key: 'security_awareness',
    title: 'Security Awareness and Training',
    dataKey: 'security_awareness',
    citationId: 'security_awareness',
  },
  amended_clauses: {
    key: 'amended_clauses',
    title: 'Amended Clauses',
    dataKey: 'other_attributes.amended_clauses',
    citationId: 'amended_clauses',
  },

  // Adjustment fields
  discount: {
    key: 'discount',
    title: 'Discount',
    dataKey: 'discount',
    formatter: (value: number) => (value ? `${value}%` : 'N/A'),
    condition: (contract: any) => Boolean(contract.discount),
    citationId: 'discount',
    tooltip: 'The discount applied to the total cost.',
  },
  annual_increase: {
    key: 'annual_increase',
    title: 'Percentage Increase Per Period',
    dataKey: 'annual_increase',
    formatter: (value: number, contract: any) => {
      if (!value) return 'N/A';
      const months = contract.annual_increase_months || 12;
      const periodText = months === 12 ? 'annually' : `every ${months} months`;
      return `${value}% ${periodText}`;
    },
    condition: (contract: any) => Boolean(contract.annual_increase),
    citationId: 'annual_increase',
    tooltip: 'The increase applied upon renewal.',
  },
  cpi: {
    key: 'cpi',
    title: 'Consumer Price Index (CPI) Increase',
    dataKey: 'other_attributes.increase.cpi',
    formatter: (value: string, contract: any) => {
      // Also check the alternative path
      const altValue = contract.other_attributes?.cpi;
      const finalValue = value || altValue;
      return finalValue === 'Yes' || finalValue === 'No' ? finalValue : 'N/A';
    },
    condition: (contract: any) => {
      const cpiValue =
        contract.other_attributes?.increase?.cpi ||
        contract.other_attributes?.cpi;
      return cpiValue === 'Yes' || cpiValue === 'No';
    },
    citationId: 'cpi',
    tooltip: 'Annual increase may be affected by CPI at time of renewal.',
  },

  // NDA fields
  purpose: {
    key: 'purpose',
    title: 'Purpose',
    dataKey: 'other_attributes.nda_fields.purpose',
    citationId: 'purpose',
  },
  mutual_nda: {
    key: 'mutual_nda',
    title: 'Mutual NDA',
    dataKey: 'other_attributes.nda_fields.mutual_nda',
    citationId: 'mutual_nda',
  },
  confidential_information: {
    key: 'confidential_information',
    title: 'Confidential Information',
    dataKey: 'other_attributes.nda_fields.confidential_information',
    citationId: 'confidential_information',
  },
  permitted_use: {
    key: 'permitted_use',
    title: 'Permitted Use',
    dataKey: 'other_attributes.nda_fields.permitted_use',
    citationId: 'permitted_use',
  },
  term_termination: {
    key: 'term_termination',
    title: 'Term/Termination',
    dataKey: 'other_attributes.nda_fields.term_termination',
    citationId: 'term_termination',
  },
  non_use_non_disclosure: {
    key: 'non_use_non_disclosure',
    title: 'Non-Use/Non-Disclosure',
    dataKey: 'other_attributes.nda_fields.non_use_non_disclosure',
    citationId: 'non_use_non_disclosure',
  },
  maintenance_of_confidentiality: {
    key: 'maintenance_of_confidentiality',
    title: 'Maintenance of Confidentiality',
    dataKey: 'other_attributes.nda_fields.maintenance_of_confidentiality',
    citationId: 'maintenance_of_confidentiality',
  },
  no_obligation: {
    key: 'no_obligation',
    title: 'No Obligation',
    dataKey: 'other_attributes.nda_fields.no_obligation',
    citationId: 'no_obligation',
  },
  no_license_ownership: {
    key: 'no_license_ownership',
    title: 'No License/Ownership',
    dataKey: 'other_attributes.nda_fields.no_license_ownership',
    citationId: 'no_license_ownership',
  },
  exclusions_exceptions: {
    key: 'exclusions_exceptions',
    title: 'Exclusions/Exceptions',
    dataKey: 'other_attributes.nda_fields.exclusions_exceptions',
    citationId: 'exclusions_exceptions',
  },
  non_solicitation_of_employees: {
    key: 'non_solicitation_of_employees',
    title: 'Non-Solicitation of Employees',
    dataKey: 'other_attributes.nda_fields.non_solicitation_of_employees',
    citationId: 'non_solicitation_of_employees',
  },
  remedies: {
    key: 'remedies',
    title: 'Remedies',
    dataKey: 'other_attributes.nda_fields.remedies',
    citationId: 'remedies',
  },
  no_warranty: {
    key: 'no_warranty',
    title: 'No Warranty',
    dataKey: 'other_attributes.nda_fields.no_warranty',
    citationId: 'no_warranty',
  },
  disclosure_required_by_law: {
    key: 'disclosure_required_by_law',
    title: 'Disclosure Required By Law',
    dataKey: 'other_attributes.nda_fields.disclosure_required_by_law',
    citationId: 'disclosure_required_by_law',
  },
  miscellaneous: {
    key: 'miscellaneous',
    title: 'Miscellaneous',
    dataKey: 'other_attributes.nda_fields.miscellaneous',
    citationId: 'miscellaneous',
  },
};

export const CONTRACT_CONFIGS: Record<number, ContractConfig> = {
  [contractTypes.Invoice]: {
    overview: [
      'billing_period_start_date',
      'billing_period_end_date',
      'invoice_date',
      'due_date',
      'billing_frequency',
      'subscription_term',
      'currency',
      'invoice_number',
    ],
    postsigMetadata: [
      'postsig_notes',
      'missing_fields',
      'asset_classes',
      'tags',
      'summary',
    ],
    contractDetails: [
      {
        title: 'Summary of Charges',
        fields: ['products_licensed'],
      },
      {
        title: 'Product Credits',
        fields: ['product_credits'],
      },
      {
        title: 'Product Terms',
        fields: ['market_data_types', 'data_delivery_types'],
      },
      {
        title: 'Payment Details',
        fields: [
          'sales_tax_percent',
          'sales_tax_amount',
          'payment_terms',
          'renewal_period',
          'cancellation_process',
        ],
      },
      {
        title: 'Permissions and Scope of Use',
        fields: ['end_users', 'number_of_users'],
      },
    ],
    tabs: ['allocation', 'owner', 'users', 'audit', 'lineage'],
  },

  [contractTypes.NDA]: {
    overview: [
      'term_start_date',
      'term_end_date',
      'cancel_date',
      'execution_date',
      'subscription_term',
      'extended_confidentiality_period',
      'order_number',
    ],
    postsigMetadata: [
      'postsig_notes',
      'nda_risks',
      'missing_fields',
      'asset_classes',
      'tags',
      'summary',
    ],
    contractDetails: [
      {
        title: 'Scope and Definition of Confidentiality',
        fields: [
          'purpose',
          'mutual_nda',
          'confidential_information',
          'permitted_use',
          'term_termination',
        ],
      },
      {
        title: 'Obligations and Protective Measures',
        fields: [
          'non_use_non_disclosure',
          'maintenance_of_confidentiality',
          'no_obligation',
          'no_license_ownership',
          'exclusions_exceptions',
          'non_solicitation_of_employees',
          'data_disposal_tnc',
        ],
      },
      {
        title: 'Remedies and Legal Provisions',
        fields: [
          'remedies',
          'no_warranty',
          'disclosure_required_by_law',
          'arbitration_and_conflict_resolution',
          'miscellaneous',
        ],
      },
    ],
    tabs: ['owner', 'users', 'audit', 'lineage'],
  },
};

export const DEFAULT_CONTRACT_CONFIG: ContractConfig = {
  overview: [
    'term_start_date',
    'term_end_date',
    'cancel_by_date',
    'subscription_term',
    'renewal_type',
    'multi_year',
    'order_number',
  ],
  postsigMetadata: [
    'postsig_notes',
    'missing_fields',
    'asset_classes',
    'tags',
    'summary',
  ],
  contractDetails: [
    {
      title: 'Products Licensed',
      fields: ['products_licensed'],
    },
    {
      title: 'Product Terms',
      fields: ['market_data_types', 'data_delivery_types', 'exclusivity_terms'],
    },
    {
      title: 'Adjustments',
      fields: ['discount', 'annual_increase', 'cpi'],
    },
    {
      title: 'Payment Details',
      fields: [
        'billing_frequency',
        'currency',
        'payment_terms',
        'renewal_period',
        'cancellation_process',
      ],
    },
    {
      title: 'Permissions and Scope of Use',
      fields: [
        'end_users',
        'number_of_users',
        'ai_training_restrictions',
        'internal_external_users',
        'distribution_rights',
        'geo_restrictions',
        'derivative_works',
        'activities',
      ],
    },
    // Individual term cards (no section title)
    {
      title: 'Marketing Rights',
      fields: ['marketing_rights'],
    },
    {
      title: 'Suspension of Service',
      fields: ['suspension_of_service'],
    },
    {
      title: 'Data Disposal Terms and Conditions',
      fields: ['data_disposal_tnc'],
    },
    {
      title: 'Audit Requirements',
      fields: ['audit_requirements'],
    },
    {
      title: 'Service Level Agreements',
      fields: ['service_level_agreements'],
    },
    {
      title: 'Incident Related Cost Mitigation',
      fields: ['cost_mitigation'],
    },
    {
      title: 'Arbitration and Conflict Resolution',
      fields: ['arbitration_and_conflict_resolution'],
    },
    {
      title: 'Security Awareness and Training',
      fields: ['security_awareness'],
    },
    {
      title: 'Amended Clauses',
      fields: ['amended_clauses'],
    },
  ],
  tabs: ['allocation', 'owner', 'users', 'dora', 'audit', 'lineage'],
};

// Helper functions
export function getContractConfig(typeId: number): ContractConfig {
  // Exchange Agreement types share their base type's viewer layout, so an
  // Exchange Agreement Invoice renders the Invoice config rather than falling
  // through to the generic default.
  return (
    CONTRACT_CONFIGS[typeId] ||
    CONTRACT_CONFIGS[baseContractTypeId(typeId)] ||
    DEFAULT_CONTRACT_CONFIG
  );
}

export function getFieldDefinition(fieldKey: string): FieldDefinition | null {
  return FIELD_DEFINITIONS[fieldKey] || null;
}

export function getFieldValue(contract: any, field: FieldDefinition): any {
  if (!field.dataKey) return null;

  const value = _.get(contract, field.dataKey);

  // Check for NO_DATA at the source before formatting
  if (typeof value === 'string' && value.trim() === 'NO_DATA') {
    return null;
  }

  if (field.formatter) {
    const formattedValue = field.formatter(value, contract);
    // Also check formatted value for NO_DATA
    if (
      typeof formattedValue === 'string' &&
      formattedValue.trim() === 'NO_DATA'
    ) {
      return null;
    }
    return formattedValue;
  }

  return value;
}

export function shouldDisplayField(
  contract: any,
  field: FieldDefinition,
): boolean {
  if (field.condition) {
    return field.condition(contract);
  }

  const value = getFieldValue(contract, field);
  // Treat "NO_DATA" as empty/falsy
  if (typeof value === 'string' && value.trim() === 'NO_DATA') {
    return false;
  }
  return Boolean(value);
}

export function hasDataInSection(contract: any, fields: string[]): boolean {
  return fields.some((fieldKey) => {
    const field = getFieldDefinition(fieldKey);
    if (!field) return false;
    return shouldDisplayField(contract, field);
  });
}

export function getAllConfiguredFields(
  contract: any,
  config: ContractConfig,
): string[] {
  const allFields: string[] = [];

  // 1. Add overview fields first (include all, regardless of data presence)
  config.overview.forEach((fieldKey) => {
    const field = getFieldDefinition(fieldKey);
    if (field && !allFields.includes(fieldKey)) {
      allFields.push(fieldKey);
    }
  });

  // 2. Add postsigMetadata fields that have export column mappings (after overview)
  const exportablePostsigFields = ['summary', 'asset_classes']; // Fields that have CSV column mappings
  config.postsigMetadata.forEach((fieldKey) => {
    if (
      exportablePostsigFields.includes(fieldKey) &&
      !allFields.includes(fieldKey)
    ) {
      allFields.push(fieldKey);
    }
  });

  // 3. Add contractDetails fields from all sections (include all, regardless of data presence)
  config.contractDetails.forEach((section) => {
    section.fields.forEach((fieldKey) => {
      const field = getFieldDefinition(fieldKey);
      if (field && !allFields.includes(fieldKey)) {
        allFields.push(fieldKey);
      }
    });
  });

  // Check if this contract type should include product-related fields
  const hasProductsSection = config.contractDetails.some(
    (section) =>
      section.title.includes('Products') ||
      section.fields.includes('products_licensed'),
  );

  // Add some key contract-level fields that are always useful in exports
  const essentialFields = [
    'vendor',
    'contract_type',
    'business_sponsor',
    'tags',
  ];

  // Add product-related fields if the contract type is product-focused
  if (hasProductsSection) {
    essentialFields.push(
      'product_name',
      'product_code',
      'fiscal_year',
      'product_fee',
      'product_start_date', // Important for understanding when products become effective
      'unconfirmed', // Shows if contract status is unconfirmed
      'related_contracts', // Shows parent/child contract relationships
    );
  }

  // Add common business fields that are always useful
  essentialFields.push(
    'business_group',
    'business_justification',
    'business_order',
  );

  essentialFields.forEach((fieldKey) => {
    if (!allFields.includes(fieldKey)) {
      allFields.push(fieldKey);
    }
  });

  return allFields;
}
