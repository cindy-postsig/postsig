import { z } from 'zod';

export const vdFacilityStructureSchema = z
  .object({
    lender: z
      .string()
      .nullable()
      .describe('The lender / financial institution'),
    total_facility: z.number().nullable().describe('Total facility amount'),
    tranches: z
      .array(
        z.object({
          tranche_name: z.string().nullable().describe('Tranche identifier'),
          amount: z.number().nullable().describe('Tranche amount'),
          availability_period: z
            .string()
            .nullable()
            .describe('Period during which the tranche can be drawn'),
          draw_conditions: z
            .string()
            .nullable()
            .describe('Conditions for drawing on this tranche'),
        }),
      )
      .nullable()
      .describe('Facility tranches if multi-tranche'),
    closing_date: z.string().nullable().describe('Closing date (ISO 8601)'),
    origination_fee: z
      .number()
      .nullable()
      .describe('Origination/commitment fee as decimal'),
    drawn_at_closing: z.number().nullable().describe('Amount drawn at closing'),
  })
  .nullable()
  .describe(
    'Extract the facility structure from this Venture Debt agreement. Identify the lender, total facility amount, tranches (with amounts, availability periods, and draw conditions), closing date, origination fee, and amount drawn at closing. Look in "Facility", "Commitment", and "Loan" sections. If not found, return null.',
  );

export const vdCostOfCapitalSchema = z
  .object({
    interest_rate: z
      .string()
      .nullable()
      .describe(
        'Interest rate description (e.g., "Prime + 2.0%" or "SOFR + 4.5%")',
      ),
    reference_rate: z
      .string()
      .nullable()
      .describe('Reference rate (e.g., "Prime", "SOFR", "fixed")'),
    pik_interest: z
      .number()
      .nullable()
      .describe('PIK (payment-in-kind) interest rate if any'),
    origination_fee: z
      .number()
      .nullable()
      .describe('Origination/commitment fee as percentage'),
    end_of_term_fee: z
      .number()
      .nullable()
      .describe('End-of-term / final payment fee as percentage'),
    prepayment_penalty_schedule: z
      .string()
      .nullable()
      .describe('Prepayment penalty schedule description'),
    effective_apr: z
      .number()
      .nullable()
      .describe('Effective APR if stated or calculable'),
  })
  .nullable()
  .describe(
    'Extract the total cost of capital from this Venture Debt agreement. Include interest rate and reference rate, PIK interest, origination fee, end-of-term fee, prepayment penalty schedule, and effective APR. Look in "Interest", "Fees", and "Payments" sections. If not found, return null.',
  );

export const vdWarrantCoverageSchema = z
  .object({
    coverage_pct: z
      .number()
      .nullable()
      .describe('Warrant coverage as percentage of facility'),
    exercise_price: z
      .string()
      .nullable()
      .describe('Exercise price or pricing mechanism'),
    share_class: z
      .string()
      .nullable()
      .describe('Share class of warrant shares'),
    warrant_shares: z.number().nullable().describe('Number of warrant shares'),
    expiration: z
      .string()
      .nullable()
      .describe('Warrant expiration date or term'),
    net_exercise: z
      .boolean()
      .nullable()
      .describe('Whether net/cashless exercise is permitted'),
    coc_treatment: z
      .string()
      .nullable()
      .describe('Treatment of warrants upon change of control'),
    dilution_pct: z
      .number()
      .nullable()
      .describe('Estimated dilution percentage from warrants'),
  })
  .nullable()
  .describe(
    'Extract warrant coverage terms from this Venture Debt agreement. Include coverage percentage, exercise price, share class, number of warrant shares, expiration, net exercise rights, change of control treatment, and estimated dilution. Look in "Warrant", "Equity", and exhibits. If not found, return null.',
  );

export const vdFinancialCovenantsSchema = z
  .array(
    z.object({
      covenant_type: z
        .string()
        .describe(
          'Type of financial covenant (e.g., "minimum cash", "revenue milestone")',
        ),
      threshold: z.string().describe('The specific threshold or metric'),
      testing_frequency: z
        .string()
        .nullable()
        .describe(
          'How often the covenant is tested (e.g., "monthly", "quarterly")',
        ),
      cure_period: z
        .string()
        .nullable()
        .describe('Cure period if covenant is breached'),
    }),
  )
  .nullable()
  .describe(
    'Extract all financial covenants from this Venture Debt agreement. For each covenant, return the type, threshold, testing frequency, and cure period. Common covenants include minimum cash balance, revenue milestones, and burn rate restrictions. Look in "Financial Covenants" and "Reporting" sections. If not found, return null.',
  );

export const vdNegativeCovenantsSchema = z
  .array(
    z.object({
      description: z.string().describe('Description of the negative covenant'),
      lender_consent_required: z
        .boolean()
        .describe('Whether lender consent is required to waive'),
      standard_or_negotiated: z
        .enum(['standard', 'negotiated'])
        .nullable()
        .describe('Whether this is a standard or negotiated provision'),
    }),
  )
  .nullable()
  .describe(
    'Extract all negative covenants from this Venture Debt agreement. Flag restrictions on equity raises, M&A activity, hiring, and capital expenditures. For each, return description, whether lender consent is needed, and whether the provision appears standard or negotiated. Look in "Negative Covenants" and "Restrictions" sections. If not found, return null.',
  );

export const vdPrepaymentMechanicsSchema = z
  .object({
    voluntary_permitted: z
      .boolean()
      .nullable()
      .describe('Whether voluntary prepayment is permitted'),
    penalty_schedule: z
      .array(
        z.object({
          period: z.string().describe('Time period (e.g., "months 1-12")'),
          penalty_pct: z.number().describe('Prepayment penalty as percentage'),
        }),
      )
      .nullable()
      .describe('Prepayment penalty schedule by period'),
    mandatory_triggers: z
      .array(z.string())
      .nullable()
      .describe('Events triggering mandatory prepayment'),
    coc_prepayment: z
      .string()
      .nullable()
      .describe('Prepayment terms upon change of control'),
    payoff_process: z
      .string()
      .nullable()
      .describe('Process for obtaining a payoff letter'),
    cost_at_month_12: z
      .number()
      .nullable()
      .describe('Total cost of prepayment at month 12 if calculable'),
    cost_at_month_24: z
      .number()
      .nullable()
      .describe('Total cost of prepayment at month 24 if calculable'),
    cost_at_month_36: z
      .number()
      .nullable()
      .describe('Total cost of prepayment at month 36 if calculable'),
  })
  .nullable()
  .describe(
    'Extract prepayment mechanics from this Venture Debt agreement. Include whether voluntary prepayment is permitted, the penalty schedule by period, mandatory prepayment triggers, change of control prepayment terms, payoff process, and if calculable, the total prepayment cost at months 12, 24, and 36. Look in "Prepayment", "Early Termination", and "Change of Control" sections. If not found, return null.',
  );
