import { z } from 'zod';

export const boObserverIdentitySchema = z
  .object({
    observer_individual_name: z
      .string()
      .nullable()
      .describe('Full name of the individual observer'),
    observer_entity_name: z
      .string()
      .nullable()
      .describe('Fund or entity name of the observer (if any)'),
    company_name: z
      .string()
      .nullable()
      .describe('Name of the company granting observer rights'),
    effective_date: z
      .string()
      .nullable()
      .describe('Effective date of the agreement (ISO 8601)'),
    basis_for_appointment: z
      .enum(['investor', 'lender', 'advisor', 'other'])
      .nullable()
      .describe('Basis on which the observer right is granted'),
    ownership_threshold_for_appointment: z
      .number()
      .nullable()
      .describe(
        'Minimum ownership percentage required to hold the observer right, as a percentage (e.g., 5 for 5% of outstanding Preferred)',
      ),
    related_investment_agreement_name: z
      .string()
      .nullable()
      .describe(
        'Name of any related investment agreement referenced (e.g., "Series A Investors\' Rights Agreement")',
      ),
    related_investment_agreement_date: z
      .string()
      .nullable()
      .describe('Date of the related investment agreement (ISO 8601)'),
  })
  .nullable()
  .describe(
    'From this board observer agreement, extract: observer_individual_name, observer_entity_name, company_name, effective_date, basis_for_appointment (investor/lender/advisor/other), ownership_threshold_for_appointment (percent), related_investment_agreement_name, related_investment_agreement_date. If not found, return null.',
  );

export const boScopeOfRightsSchema = z
  .object({
    right_to_attend_in_person_meetings: z
      .string()
      .nullable()
      .describe(
        'Whether the observer may attend meetings in person, in the wording used by the agreement (e.g., "may attend all meetings in person", "at the Company\'s invitation only")',
      ),
    right_to_attend_virtual_meetings: z
      .string()
      .nullable()
      .describe(
        'Whether the observer may attend meetings virtually, in the wording used by the agreement (e.g., "by telephone or video conference")',
      ),
    right_to_receive_meeting_notices: z
      .string()
      .nullable()
      .describe(
        'Whether the observer receives meeting notices, in the wording used by the agreement (e.g., "same notice as directors")',
      ),
    notice_advance_period_days: z
      .number()
      .nullable()
      .describe('Advance notice period in days the observer receives'),
    right_to_receive_agendas: z
      .string()
      .nullable()
      .describe(
        'Whether the observer receives meeting agendas, in the wording used by the agreement',
      ),
    right_to_receive_board_packages_and_materials: z
      .string()
      .nullable()
      .describe(
        'Whether the observer receives board packages and materials, in the wording used by the agreement (e.g., "all materials provided to directors", "excluding privileged materials")',
      ),
    right_to_receive_minutes: z
      .string()
      .nullable()
      .describe(
        'Whether the observer receives board minutes, in the wording used by the agreement',
      ),
    right_to_speak_at_meetings: z
      .string()
      .nullable()
      .describe(
        'Whether the observer may speak at meetings, in the wording used by the agreement (e.g., "may participate in discussions but not vote")',
      ),
  })
  .nullable()
  .describe(
    'From this board observer agreement, extract all rights granted. Return: right_to_attend_in_person_meetings, right_to_attend_virtual_meetings, right_to_receive_meeting_notices, notice_advance_period_days, right_to_receive_agendas, right_to_receive_board_packages_and_materials, right_to_receive_minutes, right_to_speak_at_meetings. For each right, quote or closely paraphrase the wording used by the agreement rather than answering yes or no. If not found, return null.',
  );

export const boExclusionsSchema = z
  .object({
    excluded_from_executive_sessions: z
      .string()
      .nullable()
      .describe(
        'Whether the observer is excluded from executive sessions, in the wording used by the agreement',
      ),
    excluded_for_conflicts_of_interest: z
      .string()
      .nullable()
      .describe(
        'Whether the observer is excluded where a conflict of interest exists, in the wording used by the agreement',
      ),
    excluded_for_litigation_involving_observer_firm: z
      .string()
      .nullable()
      .describe(
        "Whether the observer is excluded from matters involving litigation with the observer's firm, in the wording used by the agreement",
      ),
    excluded_for_competitive_matters: z
      .string()
      .nullable()
      .describe(
        'Whether the observer is excluded from competitively sensitive matters, in the wording used by the agreement',
      ),
    company_right_to_exclude_by_board_vote: z
      .string()
      .nullable()
      .describe(
        'Whether the company may exclude the observer by board vote, in the wording used by the agreement (e.g., "upon a majority vote of the disinterested directors")',
      ),
  })
  .nullable()
  .describe(
    'From this board observer agreement, extract the exclusion provisions. Return: excluded_from_executive_sessions, excluded_for_conflicts_of_interest, excluded_for_litigation_involving_observer_firm, excluded_for_competitive_matters, company_right_to_exclude_by_board_vote. For each, quote or closely paraphrase the wording used by the agreement rather than answering yes or no. If not found, return null.',
  );

export const boConfidentialitySchema = z
  .object({
    confidentiality_obligation_present: z
      .string()
      .nullable()
      .describe(
        'Whether a confidentiality obligation applies to the observer, in the wording used by the agreement',
      ),
    scope_of_confidential_information: z
      .string()
      .nullable()
      .describe('Scope of the confidentiality obligation'),
    obligation_extends_to_observer_firm: z
      .string()
      .nullable()
      .describe(
        "Whether the obligation extends to the observer's affiliated funds or firm, in the wording used by the agreement",
      ),
    permitted_disclosures: z
      .enum([
        'fund_partners',
        'lps_on_need_to_know',
        'legal_counsel',
        'regulators',
        'other',
      ])
      .nullable()
      .describe('Category of disclosure the agreement permits'),
    duration_post_termination_days: z
      .number()
      .nullable()
      .describe(
        'Duration of the confidentiality obligation after termination, in days',
      ),
    regulatory_disclosure_carve_out: z
      .string()
      .nullable()
      .describe(
        'Whether a regulatory or legally compelled disclosure carve-out applies, in the wording used by the agreement',
      ),
  })
  .nullable()
  .describe(
    'From this board observer agreement, extract confidentiality provisions. Return: confidentiality_obligation_present, scope_of_confidential_information, obligation_extends_to_observer_firm, permitted_disclosures (fund_partners/lps_on_need_to_know/legal_counsel/regulators/other), duration_post_termination_days, regulatory_disclosure_carve_out. For the non-enumerated fields, quote or closely paraphrase the wording used by the agreement rather than answering yes or no. If not found, return null.',
  );

export const boTerminationSchema = z
  .object({
    termination_on_ipo: z
      .string()
      .nullable()
      .describe(
        'Whether observer rights terminate on an IPO, in the wording used by the agreement',
      ),
    ownership_threshold_termination_pct: z
      .number()
      .nullable()
      .describe(
        'Ownership percentage below which observer rights terminate (e.g., 5 for 5%)',
      ),
    termination_on_change_of_control: z
      .string()
      .nullable()
      .describe(
        'Whether observer rights terminate on a change of control, in the wording used by the agreement',
      ),
    termination_on_mutual_consent: z
      .string()
      .nullable()
      .describe(
        'Whether termination by mutual consent is provided for, in the wording used by the agreement',
      ),
    company_right_to_terminate_for_cause: z
      .string()
      .nullable()
      .describe(
        'Whether the company may terminate for cause, in the wording used by the agreement (e.g., "upon a material breach of the confidentiality obligations")',
      ),
    observer_right_to_resign: z
      .string()
      .nullable()
      .describe(
        'Whether the observer may resign the observer right, in the wording used by the agreement',
      ),
    notice_required_days: z
      .number()
      .nullable()
      .describe('Advance notice required to terminate, in days'),
  })
  .nullable()
  .describe(
    'From this board observer agreement, extract termination provisions. Return: termination_on_ipo, ownership_threshold_termination_pct (percent), termination_on_change_of_control, termination_on_mutual_consent, company_right_to_terminate_for_cause, observer_right_to_resign, notice_required_days. For the non-numeric fields, quote or closely paraphrase the wording used by the agreement rather than answering yes or no. If not found, return null.',
  );

export const boGovernanceSchema = z
  .object({
    no_voting_rights_confirmed: z
      .string()
      .nullable()
      .describe(
        'Whether the agreement confirms the observer has no voting rights, in the wording used by the agreement',
      ),
    no_fiduciary_duty_confirmed: z
      .string()
      .nullable()
      .describe(
        'Whether the agreement confirms the observer owes no fiduciary duty, in the wording used by the agreement',
      ),
    liability_limitation_for_observer: z
      .string()
      .nullable()
      .describe('Any liability limitation clause applicable to the observer'),
    governing_law: z
      .string()
      .nullable()
      .describe('Governing law (e.g., "Delaware", "California")'),
    amendment_requirements: z
      .string()
      .nullable()
      .describe('Requirements to amend the agreement'),
    counterpart_execution_permitted: z
      .string()
      .nullable()
      .describe(
        'Whether execution in counterparts is permitted, in the wording used by the agreement',
      ),
  })
  .nullable()
  .describe(
    'From this board observer agreement, confirm governance provisions. Return: no_voting_rights_confirmed, no_fiduciary_duty_confirmed, liability_limitation_for_observer, governing_law, amendment_requirements, counterpart_execution_permitted. For the confirmation fields, quote or closely paraphrase the wording used by the agreement rather than answering yes or no. If not found, return null.',
  );
