import { z } from 'zod';

export const sopPlanIdentitySchema = z
  .object({
    plan_name: z
      .string()
      .nullable()
      .describe(
        'Full name of the plan as stated in the title or preamble (e.g., "2020 Stock Plan", "2024 Equity Incentive Plan")',
      ),
    plan_effective_date: z
      .string()
      .nullable()
      .describe(
        'Date the plan becomes effective (ISO 8601 format, e.g., 2024-03-15)',
      ),
    board_adoption_date: z
      .string()
      .nullable()
      .describe(
        'Date the board of directors adopted the plan (ISO 8601 format, e.g., 2024-03-15)',
      ),
    stockholder_approval_date: z
      .string()
      .nullable()
      .describe(
        'Date the stockholders approved the plan (ISO 8601 format, e.g., 2024-03-15)',
      ),
    governing_law: z
      .string()
      .nullable()
      .describe(
        'Jurisdiction whose law governs the plan (e.g., "Delaware", "California")',
      ),
    stockholder_approval_gained: z
      .string()
      .nullable()
      .describe(
        'Whether stockholder approval was obtained, in the wording used by the plan (e.g., "approved by the stockholders on May 28, 2020", "pending", "not required")',
      ),
  })
  .nullable()
  .describe(
    'Extract plan identity and authorization details from this stock option plan. Look in the title, preamble, recitals, and the adoption/approval or effective date provisions. Capture the plan name, its effective date, the board adoption date, the stockholder approval date, the governing law, and whether stockholder approval was obtained. If not found, return null.',
  );

export const sopPoolStructureSchema = z
  .object({
    total_shares_authorized: z
      .number()
      .nullable()
      .describe(
        'Total number of shares reserved for issuance under the plan (the full share reserve)',
      ),
    shares_issued_or_subject_to_outstanding_awards: z
      .number()
      .nullable()
      .describe(
        'Number of shares already issued under the plan or subject to outstanding awards',
      ),
    shares_available_for_grant: z
      .number()
      .nullable()
      .describe('Number of shares remaining available for future grant'),
    evergreen_provisions_present: z
      .string()
      .nullable()
      .describe(
        'Whether the plan contains an evergreen provision that automatically increases the share reserve, as stated (e.g., "yes, an automatic annual increase", "none")',
      ),
    evergreen_formula: z
      .string()
      .nullable()
      .describe(
        'The annual increase formula stated by the evergreen provision (e.g., "the lesser of 5% of outstanding shares or 1,000,000 shares")',
      ),
    evergreen_cap: z
      .string()
      .nullable()
      .describe(
        'Any stated ceiling on the evergreen increase, whether a share count, a percentage, or a number of years',
      ),
  })
  .nullable()
  .describe(
    'Extract the share reserve from this stock option plan. Look for the "Shares Reserved", "Share Reserve", "Shares Subject to the Plan", or "Stock Subject to the Plan" section. Distinguish three numbers that often appear together: the total authorized (reserved) share count, the shares already issued or subject to outstanding awards, and the shares remaining available for grant — outstanding plus available should equal total authorized. Also capture any evergreen provision, its annual increase formula, and any cap on that increase. If not found, return null.',
  );

export const sopAwardTypesSchema = z
  .object({
    award_types_permitted: z
      .enum(['ISO', 'NSO', 'RSA', 'RSU', 'SAR', 'performance_award', 'other'])
      .nullable()
      .describe(
        'Award type the plan permits: ISO (incentive stock option), NSO (non-statutory stock option), RSA (restricted stock award), RSU (restricted stock unit), SAR (stock appreciation right), performance_award, or other',
      ),
    iso_sublimit: z
      .number()
      .nullable()
      .describe(
        'Maximum number of shares that may be issued as incentive stock options, where the plan states a sublimit separate from the overall reserve',
      ),
    eligible_participants: z
      .enum(['employees', 'directors', 'consultants', 'advisors', 'others'])
      .nullable()
      .describe(
        'Class of participant eligible to receive awards under the plan: employees, directors, consultants, advisors, or others',
      ),
    individual_award_limit_per_participant: z
      .number()
      .nullable()
      .describe(
        'Maximum number of shares that may be granted to any single participant, per the plan',
      ),
  })
  .nullable()
  .describe(
    'Extract the award types and eligibility from this stock option plan. Look for the "Types of Awards", "Awards", or "Grants" section for the permitted award types and any ISO sublimit, and the "Eligibility" or "Eligible Participants" section for who may receive awards. Note that ISO eligibility is typically limited to employees even where the plan as a whole is broader. Also capture any per-participant individual award limit. If not found, return null.',
  );

export const sopExercisePriceSchema = z
  .object({
    iso_exercise_price_standard: z
      .string()
      .nullable()
      .describe(
        'Standard the plan sets for ISO exercise price (e.g., "no less than 100% of fair market value on the grant date")',
      ),
    nso_exercise_price_standard: z
      .string()
      .nullable()
      .describe(
        'Standard the plan sets for NSO exercise price (e.g., "no less than 85% of fair market value on the grant date")',
      ),
    fmv_determination_methodology: z
      .string()
      .nullable()
      .describe(
        'How the plan says fair market value is determined (e.g., "as determined in good faith by the Board", "most recent 409A valuation")',
      ),
    maximum_option_term_years: z
      .number()
      .nullable()
      .describe('Maximum term of an option in years, as stated by the plan'),
    maximum_iso_term_for_10_percent_stockholders_years: z
      .number()
      .nullable()
      .describe(
        'Maximum ISO term in years for holders of more than 10 percent of voting power, typically five',
      ),
  })
  .nullable()
  .describe(
    'Extract exercise price provisions from this stock option plan. Look for the "Exercise Price", "Option Price", or "Terms of Options" section. Capture the pricing standard for ISOs and for NSOs separately, how fair market value is determined, the maximum option term, and any shorter maximum ISO term that applies to holders of more than 10 percent of voting power. If not found, return null.',
  );

export const sopTerminationExerciseSchema = z
  .object({
    default_vesting_schedule: z
      .string()
      .nullable()
      .describe(
        'Default vesting schedule the plan sets for awards (e.g., "25% after one year, then monthly over 36 months")',
      ),
    cliff_period_months: z
      .number()
      .nullable()
      .describe('Length of the vesting cliff in months'),
    post_termination_exercise_voluntary_resignation_days: z
      .number()
      .nullable()
      .describe(
        'Days a participant has to exercise vested awards after a voluntary resignation',
      ),
    post_termination_exercise_termination_without_cause_days: z
      .number()
      .nullable()
      .describe(
        'Days a participant has to exercise vested awards after termination without cause',
      ),
    post_termination_exercise_termination_for_cause_days: z
      .number()
      .nullable()
      .describe(
        'Days a participant has to exercise vested awards after termination for cause, often zero',
      ),
    post_termination_exercise_death_days: z
      .number()
      .nullable()
      .describe(
        'Days a beneficiary has to exercise vested awards following the participant’s death',
      ),
  })
  .nullable()
  .describe(
    'Extract vesting and post-termination exercise provisions from this stock option plan. Look for the "Vesting", "Termination of Employment", or "Exercise After Termination" sections. Capture the default vesting schedule and cliff, then the post-termination exercise window in days for each termination reason. Post-termination windows vary significantly by reason: termination without cause is typically 90 days but ranges from 30 to 365, and termination for cause is often zero. If not found, return null.',
  );

export const sopChangeOfControlSchema = z
  .object({
    acceleration_type: z
      .enum(['none', 'single_trigger', 'double_trigger', 'board_discretion'])
      .nullable()
      .describe(
        'Acceleration the plan provides on a change of control: none, single_trigger (automatic on the transaction), double_trigger (transaction plus termination), or board_discretion',
      ),
    treatment_of_unvested_awards: z
      .enum([
        'accelerate',
        'assume',
        'substitute',
        'cancel',
        'board_discretion',
      ])
      .nullable()
      .describe(
        'What happens to unvested awards on a change of control: accelerate, assume, substitute, cancel, or board_discretion',
      ),
    cash_out_permitted: z
      .string()
      .nullable()
      .describe(
        'Whether the plan permits awards to be cashed out on a change of control, and on what terms, as stated',
      ),
    controlling_document: z
      .enum([
        'plan',
        'grant_agreement',
        'employment_agreement',
        'board_resolution',
      ])
      .nullable()
      .describe(
        'Which document controls change of control treatment where they conflict: plan, grant_agreement, employment_agreement, or board_resolution',
      ),
  })
  .nullable()
  .describe(
    'Extract change of control provisions from this stock option plan. Look for the "Change of Control", "Corporate Transaction", or "Adjustments" section. Single-trigger acceleration significantly affects the cost of an M&A transaction, so distinguish it carefully from double-trigger. If not found, return null.',
  );

export const sopAdministrationSchema = z
  .object({
    plan_administrator: z
      .enum(['board', 'compensation_committee', 'other'])
      .nullable()
      .describe('Who administers the plan'),
    administrator_has_modification_discretion: z
      .string()
      .nullable()
      .describe(
        'Whether the administrator may modify outstanding awards at its discretion, as stated by the plan',
      ),
    discretion_limits: z
      .string()
      .nullable()
      .describe(
        'Any stated limit on the administrator’s discretion (e.g., no repricing without stockholder approval)',
      ),
    who_can_amend: z
      .enum(['board', 'stockholders', 'both'])
      .nullable()
      .describe('Who may amend the plan'),
    matters_requiring_shareholder_approval_to_amend: z
      .string()
      .nullable()
      .describe(
        'Amendments the plan says require stockholder approval (e.g., increasing the share reserve, extending the term, repricing)',
      ),
    can_board_increase_reserve_without_shareholder_vote: z
      .string()
      .nullable()
      .describe(
        'Whether the board may increase the share reserve without a stockholder vote, as stated by the plan',
      ),
    plan_expiration_date: z
      .string()
      .nullable()
      .describe(
        'Date the plan expires and no further awards may be granted (ISO 8601 format, e.g., 2034-03-15)',
      ),
    effect_of_termination_on_outstanding_awards: z
      .string()
      .nullable()
      .describe(
        'What the plan says happens to outstanding awards when the plan itself terminates or expires',
      ),
  })
  .nullable()
  .describe(
    'Extract administration provisions from this stock option plan. Look for the "Administration", "Amendment and Termination", and "Term of Plan" sections. Capture who administers the plan, the scope of and limits on their discretion, who may amend the plan and which amendments need stockholder approval, whether the board may increase the reserve unilaterally, the plan expiration date, and the effect of plan termination on outstanding awards. If not found, return null.',
  );
