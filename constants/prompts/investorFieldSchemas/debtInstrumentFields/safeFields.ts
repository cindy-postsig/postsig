import { z } from 'zod';

export const safeTypeIdentificationSchema = z
  .object({
    safe_type: z
      .enum(['pre_money', 'post_money'])
      .nullable()
      .describe('Whether this is a pre-money or post-money SAFE'),
    governing_form: z
      .string()
      .nullable()
      .describe('The standard form used (e.g., "Y Combinator Pre-Money SAFE")'),
    version_year: z
      .string()
      .nullable()
      .describe('The version year of the SAFE form if identifiable'),
    company: z.string().nullable().describe('The company issuing the SAFE'),
    investor: z
      .string()
      .nullable()
      .describe('The investor purchasing the SAFE'),
  })
  .nullable()
  .describe(
    'Identify the SAFE type and parties. Determine if this is a pre-money or post-money SAFE by checking: (1) whether the conversion formula references "Company Capitalization" (pre-money) or "Post-Money Valuation Cap" (post-money), (2) presence of a "Discount Rate" (more common in post-money), (3) explicit labels like "Pre-Money" or "Post-Money" in the title or defined terms. Extract the governing form template, version year, and the company and investor names. If not determinable, return null.',
  );

export const safeConversionTriggersSchema = z
  .object({
    qualified_financing_threshold: z
      .number()
      .nullable()
      .describe(
        'Dollar threshold that defines a Qualified Financing (e.g., $1,000,000)',
      ),
    equity_financing_trigger: z
      .object({
        converts_to: z
          .string()
          .nullable()
          .describe('Share class SAFE converts into upon equity financing'),
        price_mechanism: z
          .string()
          .nullable()
          .describe(
            'How conversion price is determined (e.g., "lower of cap or discount")',
          ),
      })
      .nullable()
      .describe('Conversion terms upon an equity financing event'),
    liquidity_event_trigger: z
      .object({
        treatment: z
          .string()
          .nullable()
          .describe(
            'How SAFE is treated in a liquidity event (e.g., "option to convert or receive cash")',
          ),
        payment_priority: z
          .string()
          .nullable()
          .describe('Payment priority relative to other stakeholders'),
      })
      .nullable()
      .describe('Treatment upon a liquidity event (M&A, IPO)'),
    dissolution_trigger: z
      .object({
        payment_priority: z
          .string()
          .nullable()
          .describe(
            'Priority in dissolution (e.g., "after creditors, before common")',
          ),
        amount: z.string().nullable().describe('Amount payable on dissolution'),
      })
      .nullable()
      .describe('Treatment upon company dissolution'),
    ipo_trigger: z
      .object({
        converts_to: z.string().nullable().describe('Share class upon IPO'),
        lock_up: z.string().nullable().describe('Any lock-up period specified'),
      })
      .nullable()
      .describe(
        'Treatment upon an IPO if specified separately from equity financing',
      ),
  })
  .nullable()
  .describe(
    'Extract all conversion trigger scenarios from this SAFE. For each trigger event (equity financing, liquidity event, dissolution, IPO), extract the specific conversion mechanics, share class, price mechanism, and payment priority. Look in "Equity Financing", "Liquidity Event", "Dissolution Event", and "IPO" sections. If not found, return null.',
  );

export const safeMfnProRataSchema = z
  .object({
    mfn_clause: z
      .boolean()
      .nullable()
      .describe('Whether an MFN (Most Favored Nation) clause is present'),
    pro_rata_right: z
      .boolean()
      .nullable()
      .describe(
        'Whether the investor has pro rata rights in subsequent financings',
      ),
    pro_rata_amount_or_pct: z
      .string()
      .nullable()
      .describe('The pro rata allocation amount or percentage if specified'),
    non_standard_provisions: z
      .array(z.string())
      .nullable()
      .describe('Any provisions that deviate from the standard YC SAFE form'),
  })
  .nullable()
  .describe(
    'Extract MFN and pro rata provisions from this SAFE. Determine if an MFN clause allows the investor to adopt more favorable terms from subsequent SAFEs. Check for pro rata rights granting participation in the next equity financing. Flag any non-standard provisions that deviate from the Y Combinator template. If not found, return null.',
  );

export const safeInvestmentAmountSchema = z
  .object({
    investment_amount: z
      .number()
      .nullable()
      .describe('The purchase amount / investment amount'),
    safe_date: z
      .string()
      .nullable()
      .describe('The date of the SAFE agreement (ISO 8601)'),
    investor_name: z.string().nullable().describe('Legal name of the investor'),
  })
  .nullable()
  .describe(
    'Extract the core investment details from this SAFE: the purchase/investment amount, the agreement date, and the investor legal name. Look in the opening paragraph, recitals, and signature blocks. If not found, return null.',
  );
