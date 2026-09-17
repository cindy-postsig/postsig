/**
 * Missing Clauses Report Transform
 *
 * Extends base contract table row with missing clauses data.
 */

import {
  buildContractTableRow,
  buildProductSubRows,
} from '@/lib/v2/contracts/transforms';
import { EnrichedContract } from '@/lib/v2/contracts/service';
import { ProcessedContract } from '@/app/lib/definitions';
import { MissingClausesContext } from '../filters';
import { baseContractTypeId, contractTypes } from '@/app/lib/constants';

export interface MissingClausesReportRow extends ProcessedContract {
  missingClauses: string[];
  hasMissingClauses: boolean;
  missingClausesCount: number;
}

export interface MissingClausesSubRow {
  id: string;
  contract_id: number;
  isMissingClausesRow: boolean;
  isReportRow: boolean;
  missingClauses: string[];
}

/**
 * Build a missing clauses report row from an enriched contract.
 * Uses context Map to get missing clauses for each contract.
 */
export function buildMissingClausesRow(
  contract: EnrichedContract,
  context?: MissingClausesContext,
): MissingClausesReportRow {
  const base = buildContractTableRow(contract);

  // Get missing clauses from context map
  const missingClauses = context?.get(contract.id) || [];
  const hasMissingClauses = missingClauses.length > 0;
  const missingClausesCount = missingClauses.length;

  // Build product subRows for multi-product contracts
  const productSubRows = buildProductSubRows(contract, base);

  // Build report-specific subrows if there are missing clauses
  const reportSubRows = hasMissingClauses
    ? [
        {
          id: `report-clauses-${contract.id}`,
          contract_id: contract.id,
          isMissingClausesRow: true,
          isReportRow: true,
          missingClauses,
        },
      ]
    : [];

  const subRows = [...productSubRows, ...reportSubRows];

  return {
    ...base,
    missingClauses,
    hasMissingClauses,
    missingClausesCount,
    subRows: subRows.length > 0 ? subRows : undefined,
  } as MissingClausesReportRow;
}

/**
 * Build rows for all contracts with missing clauses context.
 */
export function buildMissingClausesRows(
  contracts: EnrichedContract[],
  context?: MissingClausesContext,
): MissingClausesReportRow[] {
  return contracts.map((contract) => buildMissingClausesRow(contract, context));
}

/**
 * Custom labels for field names in the missing fields report.
 */
const FIELD_LABELS: Record<string, string> = {
  data_disposal_tnc: 'Data Disposal Terms & Conditions',
  suspension_of_service: 'Suspension of Service',
  geo_restrictions: 'Geographic Restrictions',
  internal_external_users: 'Internal vs. External Users',
  activities: 'Allowed Activities',
  cancel_date: 'Cancel By Date',
  purpose: 'Purpose',
  confidential_information: 'Confidential Information',
  non_use_non_disclosure: 'Non-use Non-disclosure',
  maintenance_of_confidentiality: 'Maintenance of Confidentiality',
  term_termination: 'Term & Termination',
  no_obligation: 'No Obligation',
  no_license_ownership: 'No License/Ownership',
  remedies: 'Remedies',
  permitted_use: 'Permitted Use',
  no_warranty: 'No Warranty',
  miscellaneous: 'Miscellaneous',
  exclusions_exceptions: 'Exclusions/Exceptions',
  disclosure_required_by_law: 'Disclosure Required by Law',
  non_solicitation_of_employees: 'Non-solicitation of Employees',
  mutual_nda: 'Mutual NDA',
};

/**
 * NDA-specific fields that are stored in other_attributes.nda_fields
 */
const NDA_FIELDS = [
  'purpose',
  'confidential_information',
  'non_use_non_disclosure',
  'maintenance_of_confidentiality',
  'term_termination',
  'no_obligation',
  'no_license_ownership',
  'remedies',
  'permitted_use',
  'no_warranty',
  'miscellaneous',
  'exclusions_exceptions',
  'disclosure_required_by_law',
  'non_solicitation_of_employees',
  'mutual_nda',
];

/**
 * Default required fields by contract type. Keyed on base type ids: Exchange
 * Agreement variants are normalised via `baseContractTypeId` before lookup, so
 * an Exchange Agreement Service Order requires the same clauses as a regular one.
 */
const DEFAULT_REQUIRED_FIELDS = [
  {
    typeIds: [1, 2, 7],
    fields: [
      'distribution_rights',
      'geo_restrictions',
      'derivative_works',
      'data_disposal_tnc',
    ],
  },
  {
    typeIds: [1, 2],
    fields: ['audit_requirements', 'suspension_of_service', 'marketing_rights'],
  },
  {
    typeIds: [1],
    fields: ['service_level_agreements'],
  },
  {
    typeIds: [2, 7],
    fields: ['cancel_date'],
  },
  {
    typeIds: [2, 6],
    fields: ['payment_terms', 'subscription_term', 'billing_frequency'],
  },
  {
    typeIds: [2],
    fields: [
      'internal_external_users',
      'activities',
      'cancellation_process',
      'renewal_type',
    ],
  },
  {
    typeIds: [8],
    fields: [
      'term_start_date',
      'term_end_date',
      'cancel_date',
      'execution_date',
      'subscription_term',
      'purpose',
      'confidential_information',
      'non_use_non_disclosure',
      'maintenance_of_confidentiality',
      'term_termination',
      'no_obligation',
      'no_license_ownership',
      'remedies',
      'permitted_use',
      'no_warranty',
      'miscellaneous',
      'exclusions_exceptions',
      'disclosure_required_by_law',
      'non_solicitation_of_employees',
      'mutual_nda',
      'data_disposal_tnc',
      'arbitration_and_conflict_resolution',
    ],
  },
];

/**
 * Get the list of missing required fields for a contract.
 * Returns human-readable field labels.
 */
export function getMissingFields(
  contract: any,
  orgSettings?: string[] | null,
): string[] {
  const data: string[] = [];

  if (!contract.contract_types?.id) {
    return data;
  }

  const contractTypeId = baseContractTypeId(contract.contract_types.id);

  const shouldCheckNumberOfUsers =
    contract.vendor_products_users?.length === 0 &&
    (contract.number_of_users === null || contract.number_of_users === '');

  const hasField = (field: string): boolean => {
    // NDA fields live under other_attributes.nda_fields
    if (NDA_FIELDS.includes(field)) {
      const value = contract.other_attributes?.nda_fields?.[field];
      return value !== null && value !== undefined && value !== '';
    }

    const value = contract[field];

    // Treat empty arrays as missing (date fields are stored as [{ date: string }])
    if (Array.isArray(value)) {
      return value.length > 0 && value.some((item: any) => item?.date || item);
    }

    return value !== null && value !== undefined && value !== '';
  };

  const formatFieldLabel = (field: string): string => {
    return (
      FIELD_LABELS[field] ||
      field.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    );
  };

  // Use organization settings if provided
  if (orgSettings && Array.isArray(orgSettings) && orgSettings.length > 0) {
    const allSelectedFields = new Set(orgSettings);

    DEFAULT_REQUIRED_FIELDS.forEach(({ typeIds, fields }) => {
      if (typeIds.includes(contractTypeId)) {
        fields.forEach((field) => {
          // Handle number_of_users special case
          if (field === 'number_of_users' && !shouldCheckNumberOfUsers) return;

          if (allSelectedFields.has(field) && !hasField(field)) {
            data.push(formatFieldLabel(field));
          }
        });
      }
    });

    // Also check number_of_users for subscription contracts if in org settings
    if (
      contractTypeId === contractTypes.SO &&
      shouldCheckNumberOfUsers &&
      allSelectedFields.has('number_of_users') &&
      !hasField('number_of_users')
    ) {
      data.push(formatFieldLabel('number_of_users'));
    }
  } else {
    // Use default required fields
    DEFAULT_REQUIRED_FIELDS.forEach(({ typeIds, fields }) => {
      if (typeIds.includes(contractTypeId)) {
        fields.forEach((field) => {
          if (!hasField(field)) {
            data.push(formatFieldLabel(field));
          }
        });
      }
    });

    // Also check number_of_users for subscription contracts
    if (
      contractTypeId === contractTypes.SO &&
      shouldCheckNumberOfUsers &&
      !hasField('number_of_users')
    ) {
      data.push(formatFieldLabel('number_of_users'));
    }
  }

  return data;
}
