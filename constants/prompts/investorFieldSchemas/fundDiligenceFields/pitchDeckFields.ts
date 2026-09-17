import { z } from 'zod';

export const pdMarketSizingSchema = z
  .object({
    tam: z
      .object({
        amount: z.number().nullable(),
        source: z.string().nullable(),
      })
      .nullable()
      .describe('Total Addressable Market'),
    sam: z
      .object({
        amount: z.number().nullable(),
        source: z.string().nullable(),
      })
      .nullable()
      .describe('Serviceable Addressable Market'),
    som: z
      .object({
        amount: z.number().nullable(),
        source: z.string().nullable(),
      })
      .nullable()
      .describe('Serviceable Obtainable Market'),
    growth_rate: z
      .number()
      .nullable()
      .describe('Market growth rate (CAGR) as decimal'),
    methodology: z
      .string()
      .nullable()
      .describe('Methodology used for sizing (top-down or bottom-up)'),
    unsourced_claims_flag: z
      .boolean()
      .nullable()
      .describe('Whether any market size claims lack cited sources'),
  })
  .nullable()
  .describe(
    'Extract market sizing data from this Pitch Deck. Return TAM, SAM, and SOM with amounts and sources, market growth rate, methodology, and flag any claims without cited sources. Note: Pitch decks are marketing documents — all data is unaudited. If not found, return null.',
  );

export const pdTractionMetricsSchema = z
  .object({
    arr: z.number().nullable().describe('Annual Recurring Revenue'),
    mrr: z.number().nullable().describe('Monthly Recurring Revenue'),
    mom_growth: z
      .number()
      .nullable()
      .describe('Month-over-month growth rate as decimal'),
    customer_count: z.number().nullable().describe('Number of customers'),
    nrr: z
      .number()
      .nullable()
      .describe('Net Revenue Retention as decimal (e.g., 1.20 for 120%)'),
    churn_rate: z.number().nullable().describe('Churn rate as decimal'),
    as_of_date: z
      .string()
      .nullable()
      .describe('As-of date for metrics (ISO 8601)'),
    verified: z
      .boolean()
      .nullable()
      .describe('Whether metrics are stated as verified/audited'),
  })
  .nullable()
  .describe(
    'Extract traction metrics from this Pitch Deck. Include ARR, MRR, month-over-month growth, customer count, net revenue retention, churn rate, as-of date, and whether metrics are verified/audited. Note: Pitch deck data is unaudited. If not found, return null.',
  );

export const pdFundraiseDetailsSchema = z
  .object({
    raise_amount: z.number().nullable().describe('Target raise amount'),
    use_of_proceeds: z
      .array(
        z.object({
          category: z
            .string()
            .describe(
              'Use category (e.g., "Engineering", "Sales", "Marketing")',
            ),
          pct: z
            .number()
            .nullable()
            .describe('Percentage allocated to this category'),
        }),
      )
      .nullable()
      .describe('Planned use of proceeds'),
    target_close_date: z
      .string()
      .nullable()
      .describe('Target close date (ISO 8601)'),
    committed_amount: z
      .number()
      .nullable()
      .describe('Amount already committed'),
    lead_investor: z
      .string()
      .nullable()
      .describe('Lead investor if identified'),
  })
  .nullable()
  .describe(
    'Extract fundraise details from this Pitch Deck. Include target raise amount, use of proceeds (category and percentage), target close date, committed amount, and lead investor. Look in "The Ask", "Fundraise", and "Use of Funds" slides. If not found, return null.',
  );

export const pdTeamSchema = z
  .array(
    z.object({
      name: z.string().describe('Team member name'),
      title: z.string().describe('Title / role'),
      prior_companies: z
        .array(z.string())
        .nullable()
        .describe('Notable prior companies'),
      experience_summary: z
        .string()
        .nullable()
        .describe('Brief experience summary'),
      prior_exits: z
        .boolean()
        .nullable()
        .describe('Whether this person has prior successful exits'),
    }),
  )
  .nullable()
  .describe(
    'Extract team information from this Pitch Deck. For each team member, return name, title, prior companies, experience summary, and whether they have prior exits. Flag any unfilled key roles. Look in "Team" and "About Us" slides. If not found, return null.',
  );

export const pdFinancialProjectionsSchema = z
  .object({
    projections: z
      .array(
        z.object({
          year: z.string().describe('Year (e.g., "2025", "2026")'),
          revenue: z.number().nullable().describe('Projected revenue'),
          gross_margin_pct: z
            .number()
            .nullable()
            .describe('Gross margin percentage'),
          ebitda: z.number().nullable().describe('Projected EBITDA'),
          burn_rate: z.number().nullable().describe('Monthly burn rate'),
          runway_months: z.number().nullable().describe('Runway in months'),
        }),
      )
      .nullable()
      .describe('Year-by-year financial projections'),
    projection_period: z
      .string()
      .nullable()
      .describe('Projection period (e.g., "2025-2028")'),
    key_assumptions: z
      .string()
      .nullable()
      .describe('Stated key assumptions behind projections'),
  })
  .nullable()
  .describe(
    'Extract financial projections from this Pitch Deck. For each projected year, return revenue, gross margin, EBITDA, burn rate, and runway. Also extract the projection period and key assumptions. Note: Pitch deck projections are forward-looking and unaudited. If not found, return null.',
  );
