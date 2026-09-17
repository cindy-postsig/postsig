import { z } from 'zod';

export const raTypeAndPartiesSchema = z
  .object({
    repurchase_type: z
      .enum([
        'founder_vesting_repurchase',
        'investor_buyback',
        'company_discretionary_repurchase',
      ])
      .nullable()
      .describe('Which of the three repurchase types this agreement is'),
    company_legal_name: z
      .string()
      .nullable()
      .describe('Full legal name of the company'),
    subject_party_legal_name: z
      .string()
      .nullable()
      .describe(
        'Full legal name of the party whose shares are subject to repurchase',
      ),
    subject_party_role: z
      .enum(['founder', 'employee', 'investor', 'other'])
      .nullable()
      .describe('Role of the subject party in relation to the company'),
    effective_date: z
      .string()
      .nullable()
      .describe('Effective date of the repurchase agreement (ISO 8601)'),
    related_agreement_name: z
      .string()
      .nullable()
      .describe(
        'Name of the underlying agreement this repurchase agreement relates to (e.g., a restricted stock purchase agreement or stock purchase agreement)',
      ),
    related_agreement_date: z
      .string()
      .nullable()
      .describe('Date of the related agreement (ISO 8601)'),
  })
  .nullable()
  .describe(
    "Extract the repurchase type and parties from this Repurchase Agreement. Look in the title, recitals, and definitions. Capture which of the three repurchase types applies (Founder Vesting Repurchase, Investor Buyback, or Company Discretionary Repurchase), the company's legal name, the subject party's legal name and role, the effective date, and the name and date of any related agreement this one references. If not found, return null.",
  );

export const raSharesSubjectSchema = z
  .object({
    total_shares_subject_to_repurchase: z
      .number()
      .nullable()
      .describe('Total number of shares subject to repurchase'),
    share_class: z
      .string()
      .nullable()
      .describe('Class of shares subject to repurchase'),
    vesting_or_repurchase_schedule: z
      .string()
      .nullable()
      .describe(
        'Vesting or repurchase lapse schedule for the shares (e.g., monthly over 48 months with a 12-month cliff)',
      ),
    shares_vested_as_of_effective_date: z
      .number()
      .nullable()
      .describe('Shares already vested as of the effective date'),
    shares_unvested_as_of_effective_date: z
      .number()
      .nullable()
      .describe('Shares still unvested as of the effective date'),
  })
  .nullable()
  .describe(
    'Extract the shares subject to repurchase from this Repurchase Agreement. Look for the "Shares Subject to Repurchase" or "Repurchased Shares" section. Capture the total shares subject to repurchase, the share class, the vesting or repurchase schedule, and the shares vested versus unvested as of the effective date — vested plus unvested should equal the total. If not found, return null.',
  );

export const raRepurchasePriceSchema = z
  .object({
    repurchase_price_per_share: z
      .string()
      .nullable()
      .describe(
        'Repurchase price per share, which may be a fixed amount or a formula, as stated',
      ),
    price_basis: z
      .enum([
        'original_purchase_price',
        'fair_market_value',
        'formula',
        'other',
      ])
      .nullable()
      .describe('Basis for the repurchase price'),
    valuation_methodology_if_fmv_based: z
      .string()
      .nullable()
      .describe(
        'How fair market value is determined, where the price basis is fair market value',
      ),
    price_varies_by_trigger_event: z
      .string()
      .nullable()
      .describe(
        'Whether the repurchase price varies depending on the trigger event, as stated',
      ),
    adjusts_for_splits_or_recapitalizations: z
      .string()
      .nullable()
      .describe(
        'Whether the repurchase price adjusts for stock splits or recapitalizations, as stated',
      ),
  })
  .nullable()
  .describe(
    'Extract the repurchase price terms from this Repurchase Agreement. Look for the "Repurchase Price" or "Purchase Price" section. Capture the repurchase price per share, its basis, the valuation methodology if fair-market-value based, whether the price varies by trigger event, and whether it adjusts for splits or recapitalizations, in each case using the wording of the document. If not found, return null.',
  );

export const raTriggerEventsSchema = z
  .array(
    z.object({
      trigger_event: z
        .enum([
          'voluntary_resignation',
          'involuntary_termination_without_cause',
          'termination_for_cause',
          'death',
          'disability',
          'change_of_control',
          'breach',
          'other',
        ])
        .nullable()
        .describe('The event that triggers the repurchase right'),
      mandatory_or_optional: z
        .enum(['mandatory', 'optional'])
        .nullable()
        .describe(
          'Whether the repurchase is mandatory or optional for this trigger event',
        ),
      repurchase_price_applicable: z
        .string()
        .nullable()
        .describe(
          'Repurchase price applicable to this trigger event, if it differs from the general repurchase price',
        ),
      additional_conditions: z
        .string()
        .nullable()
        .describe('Any additional conditions specific to this trigger event'),
    }),
  )
  .nullable()
  .describe(
    'Extract each trigger event under which the repurchase right may be exercised from this Repurchase Agreement. A repurchase agreement can list multiple trigger events (e.g., voluntary resignation, termination without cause, termination for cause, death, disability, change of control, breach), each potentially with its own applicable price and conditions. Return one array entry per trigger event. If none are found, return null.',
  );

export const raExerciseOfRightSchema = z
  .object({
    rights_holder: z
      .enum(['company', 'investor', 'both'])
      .nullable()
      .describe('Who holds the repurchase right'),
    exercise_period_days_after_trigger: z
      .number()
      .nullable()
      .describe(
        'Number of days after a trigger event within which the repurchase right must be exercised',
      ),
    notice_requirements: z
      .string()
      .nullable()
      .describe('Notice requirements to exercise the repurchase right'),
    payment_mechanics: z
      .enum(['cash', 'cancellation_of_note', 'other'])
      .nullable()
      .describe('How the repurchase price is paid'),
    rights_assignable: z
      .string()
      .nullable()
      .describe(
        'Whether the repurchase right is assignable, as stated by the agreement',
      ),
  })
  .nullable()
  .describe(
    'Extract the exercise-of-right provisions from this Repurchase Agreement. Look for the "Exercise of Repurchase Right" or "Notice and Exercise" section. Capture who holds the right, the exercise period in days after a trigger event, the notice requirements, the payment mechanics, and whether the right is assignable. If not found, return null.',
  );

export const raLapseTerminationSchema = z
  .object({
    lapses_on_ipo: z
      .string()
      .nullable()
      .describe('Whether the repurchase right lapses on an IPO, as stated'),
    lapses_on_change_of_control: z
      .string()
      .nullable()
      .describe(
        'Whether the repurchase right lapses on a change of control, as stated',
      ),
    lapses_on_full_vesting: z
      .string()
      .nullable()
      .describe(
        'Whether the repurchase right lapses once the shares are fully vested, as stated',
      ),
    other_lapse_triggers: z
      .string()
      .nullable()
      .describe('Any other stated triggers that cause the right to lapse'),
    governing_law: z
      .string()
      .nullable()
      .describe('Jurisdiction whose law governs the agreement'),
    amendment_requirements: z
      .string()
      .nullable()
      .describe('What the agreement says is required to amend it'),
  })
  .nullable()
  .describe(
    'Extract the lapse, termination, and governing provisions from this Repurchase Agreement. Look for the "Lapse of Repurchase Right", "Termination", "Governing Law", and "Amendment" sections. Capture whether the right lapses on an IPO, a change of control, or full vesting, any other lapse triggers, the governing law, and the amendment requirements. If not found, return null.',
  );
