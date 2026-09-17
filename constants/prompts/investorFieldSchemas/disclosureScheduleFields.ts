import { z } from 'zod';

export const dsStructureSchema = z
  .object({
    agreement_name_and_date_it_qualifies: z
      .string()
      .nullable()
      .describe(
        'Name and date of the definitive agreement this schedule qualifies (e.g., "Series B SPA dated January 15, 2026")',
      ),
    schedule_date: z
      .string()
      .nullable()
      .describe('Date of the disclosure schedule itself (ISO 8601)'),
    total_number_of_schedule_items: z
      .number()
      .nullable()
      .describe('Total count of disclosed items across all schedule sections'),
    cross_reference_mechanic: z
      .enum(['strict_silo', 'general_cross_reference', 'not_stated'])
      .nullable()
      .describe(
        'Cross-reference mechanic: strict_silo (disclosure against one rep qualifies only that rep), general_cross_reference (disclosure qualifies all reps where applicable), not_stated',
      ),
    bring_down_at_closing_required: z
      .boolean()
      .nullable()
      .describe(
        'Whether the schedule must be updated / brought down at closing',
      ),
    section_numbers_and_reps: z
      .array(
        z.object({
          section_number: z
            .string()
            .describe('Schedule section number (e.g., "2.2", "3.9")'),
          rep_description: z
            .string()
            .describe(
              'Short description of the rep or warranty this section qualifies',
            ),
        }),
      )
      .nullable()
      .describe('List of all schedule sections and the rep they correspond to'),
  })
  .nullable()
  .describe(
    'From this disclosure schedule, extract: agreement_name_and_date_it_qualifies, schedule_date, total_number_of_schedule_items, cross_reference_mechanic (strict_silo/general_cross_reference/not_stated), bring_down_at_closing_required (boolean). List all schedule section numbers present and their corresponding rep. If not found, return null.',
  );

export const dsCapitalizationSchema = z
  .object({
    items_disclosed: z
      .array(z.string())
      .nullable()
      .describe('All items disclosed in the capitalization section'),
    instruments_not_on_cap_table: z
      .array(z.string())
      .nullable()
      .describe(
        'Equity instruments or obligations that are not reflected on the cap table',
      ),
    promised_but_unissued_grants: z
      .array(z.string())
      .nullable()
      .describe(
        'Option or equity grants that have been promised but not yet issued',
      ),
    stockholder_agreements_not_previously_disclosed: z
      .array(z.string())
      .nullable()
      .describe(
        'Stockholder or investor rights agreements not previously disclosed to the investor',
      ),
    cap_table_inaccurate: z
      .boolean()
      .nullable()
      .describe(
        'Whether any disclosed item indicates the cap table is inaccurate or incomplete',
      ),
  })
  .nullable()
  .describe(
    'From the capitalization section of this disclosure schedule, extract all disclosed exceptions. Return: items_disclosed (list), instruments_not_on_cap_table (list), promised_but_unissued_grants (list), stockholder_agreements_not_previously_disclosed (list). Flag any disclosure that indicates the cap table is inaccurate. If not found, return null.',
  );

export const dsIpSchema = z
  .object({
    ip_not_solely_owned: z
      .array(
        z.object({
          description: z
            .string()
            .describe('Description of the IP not solely owned'),
          risk_category: z
            .enum([
              'deal_blocker',
              'material_risk',
              'manageable',
              'informational',
            ])
            .describe('Risk category'),
        }),
      )
      .nullable()
      .describe('IP assets not solely owned by the company'),
    open_source_components: z
      .array(
        z.object({
          component: z.string().describe('Name of the open source component'),
          license_type: z
            .string()
            .describe('License type (e.g., MIT, GPL, LGPL, AGPL, Apache 2.0)'),
          copyleft_risk: z
            .enum(['high', 'medium', 'low', 'none'])
            .describe(
              'Copyleft risk level — high for GPL/AGPL/LGPL, low/none for permissive',
            ),
          risk_category: z
            .enum([
              'deal_blocker',
              'material_risk',
              'manageable',
              'informational',
            ])
            .describe('Risk category'),
        }),
      )
      .nullable()
      .describe(
        'Open source components with license type and copyleft risk assessment',
      ),
    inbound_licenses: z
      .array(
        z.object({
          description: z
            .string()
            .describe('Description of the inbound IP license'),
          risk_category: z
            .enum([
              'deal_blocker',
              'material_risk',
              'manageable',
              'informational',
            ])
            .describe('Risk category'),
        }),
      )
      .nullable()
      .describe('Third-party inbound IP licenses'),
    ip_assignments_not_executed: z
      .array(
        z.object({
          description: z
            .string()
            .describe('Description of the unexecuted IP assignment'),
          risk_category: z
            .enum([
              'deal_blocker',
              'material_risk',
              'manageable',
              'informational',
            ])
            .describe('Risk category'),
        }),
      )
      .nullable()
      .describe(
        'IP assignments not yet executed (e.g., founder or employee IP not formally assigned)',
      ),
    third_party_ip_claims: z
      .array(
        z.object({
          description: z
            .string()
            .describe('Description of the third-party IP claim'),
          risk_category: z
            .enum([
              'deal_blocker',
              'material_risk',
              'manageable',
              'informational',
            ])
            .describe('Risk category'),
        }),
      )
      .nullable()
      .describe('Third-party IP ownership claims or disputes'),
  })
  .nullable()
  .describe(
    'From the IP section of this disclosure schedule, extract: ip_not_solely_owned (list), open_source_components (list with license type and copyleft risk), inbound_licenses (list), ip_assignments_not_executed (list), third_party_ip_claims (list). Categorize each as: deal_blocker/material_risk/manageable/informational. If not found, return null.',
  );

export const dsContractsSchema = z
  .array(
    z.object({
      contract_name_and_counterparty: z
        .string()
        .nullable()
        .describe('Name of the contract and the counterparty'),
      disclosure_reason: z
        .string()
        .nullable()
        .describe(
          'Reason this contract is disclosed (e.g., "exceeds $500K annual value", "change-of-control provision")',
        ),
      materiality_assessment: z
        .string()
        .nullable()
        .describe('Assessment of why this contract is material'),
      consent_required_for_transaction: z
        .boolean()
        .nullable()
        .describe(
          'Whether this contract requires counterparty consent to the transaction (e.g., change-of-control clause)',
        ),
      consent_obtained: z
        .boolean()
        .nullable()
        .describe(
          'Whether the required consent has already been obtained. Null if consent is not required or status is not stated.',
        ),
    }),
  )
  .nullable()
  .describe(
    'From the contracts section of this disclosure schedule, extract all disclosed contracts. For each return: contract_name_and_counterparty, disclosure_reason, materiality_assessment, consent_required_for_transaction (boolean), consent_obtained (boolean — null if not required or not stated). Flag any contract where consent is required and not yet obtained. If not found, return null.',
  );

export const dsLitigationComplianceSchema = z
  .object({
    claims: z
      .array(
        z.object({
          parties: z.string().describe('Parties involved in the claim'),
          nature_of_claim: z
            .string()
            .describe('Nature or description of the claim'),
          amount_in_controversy: z
            .string()
            .nullable()
            .describe('Dollar amount in controversy, if stated'),
          current_status: z
            .string()
            .describe(
              'Current status of the claim (e.g., "pending", "settled", "threatened")',
            ),
          high_exposure: z
            .boolean()
            .nullable()
            .describe('Whether exposure exceeds $100K'),
        }),
      )
      .nullable()
      .describe('All disclosed litigation claims'),
    regulatory_investigations: z
      .array(z.string())
      .nullable()
      .describe('Regulatory investigations disclosed'),
    consent_decrees: z
      .array(z.string())
      .nullable()
      .describe(
        'Consent decrees or settlement orders the company is subject to',
      ),
    known_compliance_violations: z
      .array(z.string())
      .nullable()
      .describe('Known compliance violations disclosed'),
  })
  .nullable()
  .describe(
    'From the litigation section, extract all disclosed claims. For each return: parties, nature_of_claim, amount_in_controversy, current_status. Also extract: regulatory_investigations (list), consent_decrees (list), known_compliance_violations (list). Flag any item with >$100K exposure. If not found, return null.',
  );

export const dsFinancialEmployeeSchema = z
  .object({
    off_balance_sheet_liabilities: z
      .array(z.string())
      .nullable()
      .describe('Off-balance sheet liabilities disclosed'),
    tax_liabilities_or_disputes: z
      .array(z.string())
      .nullable()
      .describe('Tax liabilities, disputes, or assessments disclosed'),
    material_changes_since_balance_sheet: z
      .array(z.string())
      .nullable()
      .describe('Material changes since the balance sheet date disclosed'),
    employees_without_ip_assignments: z
      .array(z.string())
      .nullable()
      .describe(
        'Employees or contractors without executed IP assignment agreements',
      ),
    change_of_control_bonus_obligations: z
      .array(z.string())
      .nullable()
      .describe(
        'Change-of-control bonus or retention obligations triggered by the transaction',
      ),
    outstanding_severance_obligations: z
      .array(z.string())
      .nullable()
      .describe('Outstanding or contingent severance obligations disclosed'),
  })
  .nullable()
  .describe(
    'From the financial and employee sections, extract: off_balance_sheet_liabilities (list), tax_liabilities_or_disputes (list), material_changes_since_balance_sheet (list), employees_without_ip_assignments (list), change_of_control_bonus_obligations (list), outstanding_severance_obligations (list). Flag any item not reflected in financial statements. If not found, return null.',
  );
