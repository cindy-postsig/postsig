import { z } from 'zod';

export const mrlVcocPurposeSchema = z
  .object({
    fund_legal_name: z
      .string()
      .nullable()
      .describe('Full legal name of the fund receiving management rights'),
    fund_entity_type: z
      .string()
      .nullable()
      .describe(
        'Entity type of the fund (e.g., "Delaware limited partnership")',
      ),
    company_name: z
      .string()
      .nullable()
      .describe('Name of the portfolio company granting management rights'),
    effective_date: z
      .string()
      .nullable()
      .describe('Effective date of the management rights letter (ISO 8601)'),
    vcoc_erisa_purpose_explicitly_stated: z
      .boolean()
      .nullable()
      .describe(
        'Whether the VCOC/ERISA purpose is explicitly stated in the recitals — quote the recital if present',
      ),
    vcoc_erisa_recital_quote: z
      .string()
      .nullable()
      .describe('Direct quote of the VCOC/ERISA purpose recital, if present'),
    related_investment_agreement_referenced: z
      .string()
      .nullable()
      .describe(
        'Name of any related investment agreement referenced (e.g., Series B SPA, IRA)',
      ),
    vcoc_purpose_absent_or_ambiguous: z
      .boolean()
      .nullable()
      .describe(
        'Whether the VCOC/ERISA purpose is absent or ambiguous — flag if so',
      ),
  })
  .nullable()
  .describe(
    'From this management rights letter, extract: fund_legal_name, fund_entity_type, company_name, effective_date, vcoc_erisa_purpose_explicitly_stated (boolean — quote the recital), related_investment_agreement_referenced. Flag if the VCOC/ERISA purpose is absent or ambiguous. If not found, return null.',
  );

export const mrlManagementRightsSchema = z
  .object({
    rights: z
      .array(
        z.object({
          right_type: z
            .string()
            .describe(
              'Type of management right (e.g., "consulting", "inspection", "facility access")',
            ),
          description: z
            .string()
            .describe('Full description of the right as stated'),
          frequency_or_trigger: z
            .string()
            .nullable()
            .describe('Frequency or triggering condition for the right'),
          limitations: z
            .string()
            .nullable()
            .describe('Any limitations on the right'),
        }),
      )
      .nullable()
      .describe('All management rights granted, with detail for each'),
    right_to_consult_and_advise: z
      .boolean()
      .nullable()
      .describe(
        'Whether the fund has the right to consult and advise management',
      ),
    right_to_inspect_books: z
      .boolean()
      .nullable()
      .describe('Whether the fund has the right to inspect books and records'),
    right_to_visit_facilities: z
      .boolean()
      .nullable()
      .describe('Whether the fund has the right to visit company facilities'),
    right_to_receive_financials: z
      .boolean()
      .nullable()
      .describe(
        'Whether the fund has the right to receive financial statements',
      ),
    core_right_absent: z
      .boolean()
      .nullable()
      .describe(
        'Whether any core management right (consult/advise, inspect books, visit facilities, receive financials) is absent — flag if so',
      ),
  })
  .nullable()
  .describe(
    'From this management rights letter, list all management rights granted. For each return: right_type, description, frequency_or_trigger, limitations. Confirm: right_to_consult_and_advise (boolean), right_to_inspect_books (boolean), right_to_visit_facilities (boolean), right_to_receive_financials (boolean). Flag if any core right is absent. If not found, return null.',
  );

export const mrlBoardAccessSchema = z
  .object({
    board_observer_right: z
      .boolean()
      .nullable()
      .describe('Whether the fund has board observer rights'),
    right_to_receive_notices: z
      .boolean()
      .nullable()
      .describe('Whether the fund receives board meeting notices'),
    advance_notice_period_days: z
      .number()
      .nullable()
      .describe('Advance notice period in days'),
    right_to_receive_materials: z
      .boolean()
      .nullable()
      .describe('Whether the fund receives board meeting materials/packages'),
    excluded_from_executive_sessions: z
      .boolean()
      .nullable()
      .describe('Whether the observer can be excluded from executive sessions'),
    right_to_receive_minutes: z
      .boolean()
      .nullable()
      .describe('Whether the fund receives board minutes'),
    rights_granted_to: z
      .string()
      .nullable()
      .describe(
        'Whether rights are granted directly to the fund or a designated representative',
      ),
  })
  .nullable()
  .describe(
    'From this management rights letter, extract board-related rights. Return: board_observer_right (boolean), right_to_receive_notices (boolean), advance_notice_period_days, right_to_receive_materials (boolean), excluded_from_executive_sessions (boolean), right_to_receive_minutes (boolean). Note whether rights are granted directly to the fund or a designated representative. If not found, return null.',
  );

export const mrlInformationRightsSchema = z
  .object({
    financial_reporting_frequency: z
      .string()
      .nullable()
      .describe(
        'Frequency of financial reporting (e.g., "monthly", "quarterly", "annually")',
      ),
    annual_budget_right: z
      .boolean()
      .nullable()
      .describe('Whether the fund has the right to receive the annual budget'),
    cap_table_update_right: z
      .boolean()
      .nullable()
      .describe('Whether the fund has the right to receive cap table updates'),
    material_event_notice_right: z
      .boolean()
      .nullable()
      .describe(
        'Whether the fund has the right to receive notice of material events',
      ),
    are_rights_granted_directly_to_fund: z
      .boolean()
      .nullable()
      .describe(
        'Whether information rights are granted directly to the fund entity (not merely passed through from IRA)',
      ),
    pass_through_from_ira: z
      .boolean()
      .nullable()
      .describe(
        'Whether rights are a pass-through from the IRA rather than standalone — flag if so, as this may be insufficient for VCOC',
      ),
  })
  .nullable()
  .describe(
    'From this management rights letter, extract all information rights. Return: financial_reporting_frequency, annual_budget_right (boolean), cap_table_update_right (boolean), material_event_notice_right (boolean). Confirm: are_rights_granted_directly_to_fund (boolean). Flag if pass-through from IRA — may be insufficient for VCOC. If not found, return null.',
  );

export const mrlTransferTerminationSchema = z
  .object({
    rights_transferable_with_fund_interest: z
      .boolean()
      .nullable()
      .describe(
        "Whether management rights are transferable with the fund's investment (required for VCOC)",
      ),
    termination_on_ipo: z
      .boolean()
      .nullable()
      .describe('Whether management rights terminate on IPO'),
    termination_ownership_threshold: z
      .string()
      .nullable()
      .describe(
        'Ownership threshold below which management rights terminate (e.g., "less than 5% of outstanding shares")',
      ),
    termination_on_fund_dissolution: z
      .boolean()
      .nullable()
      .describe('Whether management rights terminate on fund dissolution'),
    amendment_requirements: z
      .string()
      .nullable()
      .describe('Requirements to amend the management rights letter'),
    non_transferable_or_no_threshold: z
      .boolean()
      .nullable()
      .describe(
        'Whether rights are non-transferable or no ownership threshold termination is specified — flag if so',
      ),
  })
  .nullable()
  .describe(
    'From this management rights letter, extract: rights_transferable_with_fund_interest (boolean), termination_on_ipo (boolean), termination_ownership_threshold, termination_on_fund_dissolution (boolean), amendment_requirements. Flag if rights are non-transferable or no ownership threshold is specified. If not found, return null.',
  );
