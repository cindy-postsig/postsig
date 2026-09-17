import { z } from 'zod';

export const maTransactionStructureSchema = z
  .object({
    transaction_type: z
      .string()
      .nullable()
      .describe(
        'Type of transaction (e.g., "forward merger", "reverse merger", "stock purchase")',
      ),
    surviving_entity: z
      .string()
      .nullable()
      .describe('Entity that survives the merger'),
    acquirer: z.string().nullable().describe('Acquirer / buyer'),
    target: z.string().nullable().describe('Target company'),
    consideration_type: z
      .string()
      .nullable()
      .describe('Type of consideration (e.g., "all cash", "stock", "mixed")'),
    enterprise_value: z
      .number()
      .nullable()
      .describe('Enterprise value if stated'),
    equity_value: z.number().nullable().describe('Equity value if stated'),
    per_share_price: z.number().nullable().describe('Per share price offered'),
    exchange_ratio: z
      .string()
      .nullable()
      .describe('Exchange ratio for stock consideration'),
    collar: z
      .string()
      .nullable()
      .describe('Collar mechanism on exchange ratio if any'),
    signing_date: z
      .string()
      .nullable()
      .describe('Agreement signing date (ISO 8601)'),
    expected_closing_date: z
      .string()
      .nullable()
      .describe('Expected closing date (ISO 8601)'),
  })
  .nullable()
  .describe(
    'Extract the transaction structure from this Merger Agreement. Identify the type (forward/reverse merger, stock purchase), surviving entity, acquirer, target, consideration type and amounts, per-share price, exchange ratio, collar mechanism, and key dates. Look in the Preamble, Recitals, and "The Merger" sections. If not found, return null.',
  );

export const maDealEconomicsSchema = z
  .object({
    working_capital_target: z
      .number()
      .nullable()
      .describe('Working capital target amount'),
    working_capital_definition: z
      .string()
      .nullable()
      .describe('How working capital is defined'),
    net_debt_adjustment: z
      .boolean()
      .nullable()
      .describe('Whether net debt adjustment applies'),
    cash_adjustment: z
      .boolean()
      .nullable()
      .describe('Whether a cash/cash-like adjustment applies'),
    adjustment_mechanism: z
      .string()
      .nullable()
      .describe(
        'Post-closing adjustment mechanism (e.g., "true-up within 90 days")',
      ),
    escrow_amount: z.number().nullable().describe('Escrow holdback amount'),
    escrow_term: z
      .string()
      .nullable()
      .describe('Escrow term / release schedule'),
    earnout: z
      .object({
        present: z.boolean().describe('Whether an earnout is included'),
        metrics: z
          .string()
          .nullable()
          .describe('Earnout metrics (e.g., "revenue", "EBITDA")'),
        period: z.string().nullable().describe('Earnout measurement period'),
        max_amount: z.number().nullable().describe('Maximum earnout payment'),
      })
      .nullable()
      .describe('Earnout provisions if any'),
  })
  .nullable()
  .describe(
    'Extract deal economics from this Merger Agreement. Cover working capital target and definition, adjustments (net debt, cash), post-closing true-up mechanism, escrow (amount and term), and earnout provisions (metrics, period, max). Look in "Purchase Price", "Adjustments", "Escrow", and "Earnout" sections. If not found, return null.',
  );

export const maClosingConditionsSchema = z
  .object({
    conditions: z
      .array(
        z.object({
          description: z
            .string()
            .describe('Description of the closing condition'),
          party: z
            .string()
            .describe(
              'Party responsible (e.g., "company", "acquirer", "mutual")',
            ),
          waivable: z
            .boolean()
            .nullable()
            .describe('Whether the condition can be waived'),
        }),
      )
      .nullable()
      .describe('List of closing conditions'),
    outside_date: z
      .string()
      .nullable()
      .describe('Outside/drop-dead date (ISO 8601)'),
    regulatory_approvals: z
      .array(z.string())
      .nullable()
      .describe('Required regulatory approvals (e.g., "HSR", "CFIUS")'),
    mae_definition_summary: z
      .string()
      .nullable()
      .describe('Summary of the Material Adverse Effect definition'),
    termination_fee: z
      .object({
        company_fee: z
          .number()
          .nullable()
          .describe('Termination fee payable by the company'),
        acquirer_fee: z
          .number()
          .nullable()
          .describe('Reverse termination fee payable by the acquirer'),
        trigger_events: z
          .array(z.string())
          .nullable()
          .describe('Events triggering the termination fee'),
      })
      .nullable()
      .describe('Termination fee provisions'),
  })
  .nullable()
  .describe(
    'Extract closing conditions from this Merger Agreement. List all conditions (with responsible party and waivability), the outside date, required regulatory approvals, MAE definition summary, and termination fee provisions (amounts and triggers). Look in "Conditions to Closing", "Termination", and "Material Adverse Effect" sections. If not found, return null.',
  );

export const maEquityTreatmentSchema = z
  .array(
    z.object({
      award_type: z
        .string()
        .describe(
          'Type of equity award (e.g., "stock option", "RSU", "warrant", "SAFE")',
        ),
      treatment: z
        .string()
        .describe(
          'How this award type is treated (e.g., "accelerated and cashed out", "assumed", "cancelled")',
        ),
      vested_treatment: z
        .string()
        .nullable()
        .describe('Treatment of vested portion'),
      unvested_treatment: z
        .string()
        .nullable()
        .describe('Treatment of unvested portion'),
      acceleration: z
        .boolean()
        .nullable()
        .describe('Whether acceleration occurs'),
      cash_out_formula: z
        .string()
        .nullable()
        .describe('Cash-out formula if applicable'),
    }),
  )
  .nullable()
  .describe(
    'Extract equity award treatment from this Merger Agreement. For each award type (options, RSUs, warrants, SAFEs), describe the treatment at closing, vested vs unvested distinction, acceleration, and cash-out formula. Look in "Treatment of Equity Awards", "Options", and "Warrants" sections. If not found, return null.',
  );

export const maIndemnificationRwSchema = z
  .object({
    survival_periods: z
      .string()
      .nullable()
      .describe('General survival period for reps and warranties'),
    basket_type: z
      .enum(['deductible', 'first_dollar', 'tipping'])
      .nullable()
      .describe('Indemnification basket type'),
    basket_amount: z.string().nullable().describe('Basket / threshold amount'),
    cap_amount: z.string().nullable().describe('Indemnification cap amount'),
    cap_as_pct: z
      .number()
      .nullable()
      .describe('Cap as percentage of deal value'),
    fraud_carve_out: z
      .boolean()
      .nullable()
      .describe('Whether fraud is carved out from limitations'),
    rw_insurance: z
      .boolean()
      .nullable()
      .describe('Whether R&W insurance is used'),
    retention_amount: z
      .string()
      .nullable()
      .describe('R&W insurance retention amount'),
    max_liability: z
      .string()
      .nullable()
      .describe('Maximum aggregate liability'),
  })
  .nullable()
  .describe(
    'Extract indemnification and R&W provisions from this Merger Agreement. Cover survival periods, basket type and amount, cap amount and percentage, fraud carve-out, R&W insurance and retention, and maximum liability. Look in "Indemnification", "Survival", and "Limitations" sections. If not found, return null.',
  );

export const maEmployeeMattersSchema = z
  .object({
    benefits_continuation: z
      .string()
      .nullable()
      .describe('Employee benefits continuation terms'),
    retention_pool: z
      .number()
      .nullable()
      .describe('Retention bonus pool amount'),
    key_employee_agreements: z
      .array(z.string())
      .nullable()
      .describe('Named key employees with specific agreements'),
    non_compete_terms: z
      .string()
      .nullable()
      .describe('Non-compete terms for key employees'),
    non_solicit_terms: z.string().nullable().describe('Non-solicitation terms'),
    post_closing_obligations: z
      .array(z.string())
      .nullable()
      .describe('Post-closing employee-related obligations'),
  })
  .nullable()
  .describe(
    'Extract employee matters from this Merger Agreement. Cover benefits continuation, retention pool, key employee agreements, non-compete and non-solicit terms, and post-closing obligations. Look in "Employee Matters", "Benefits", and "Covenants" sections. If not found, return null.',
  );
