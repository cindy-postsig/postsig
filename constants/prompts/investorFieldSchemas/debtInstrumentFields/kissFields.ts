import { z } from 'zod';

export const kissTypeSchema = z
  .object({
    kiss_type: z
      .enum(['debt', 'equity'])
      .nullable()
      .describe('Whether this is a KISS Debt or KISS Equity instrument'),
    company: z.string().nullable().describe('The company issuing the KISS'),
    investor: z
      .string()
      .nullable()
      .describe('The investor purchasing the KISS'),
    issue_date: z.string().nullable().describe('The issue date (ISO 8601)'),
    has_interest: z
      .boolean()
      .nullable()
      .describe('Whether the instrument accrues interest (debt variant)'),
    has_maturity: z
      .boolean()
      .nullable()
      .describe('Whether the instrument has a maturity date (debt variant)'),
  })
  .nullable()
  .describe(
    'Identify the KISS type and core characteristics. KISS Debt has interest and maturity; KISS Equity does not. Look for "KISS Debt" or "KISS Equity" in the title, or determine by presence/absence of interest rate and maturity provisions. Extract company, investor, and issue date. If not found, return null.',
  );

export const kissEconomicTermsSchema = z
  .object({
    investment_amount: z
      .number()
      .nullable()
      .describe('The purchase price / investment amount'),
    valuation_cap: z
      .number()
      .nullable()
      .describe('The valuation cap for conversion'),
    discount: z
      .number()
      .nullable()
      .describe('The discount rate for conversion (e.g., 0.20 for 20%)'),
    interest_rate: z
      .number()
      .nullable()
      .describe('Annual interest rate if debt variant (e.g., 0.05 for 5%)'),
    maturity_date: z
      .string()
      .nullable()
      .describe('Maturity date if debt variant (ISO 8601)'),
  })
  .nullable()
  .describe(
    'Extract the economic terms from this KISS. Look for investment/purchase amount, valuation cap, discount rate, and (for debt variant) interest rate and maturity date. These are typically in the opening sections and defined terms. If not found, return null.',
  );

export const kissConversionTriggersSchema = z
  .object({
    qualified_financing_threshold: z
      .number()
      .nullable()
      .describe('Dollar threshold for a Qualified Financing'),
    equity_financing_conversion: z
      .object({
        converts_to: z
          .string()
          .nullable()
          .describe('Share class upon qualified financing'),
        price_mechanism: z
          .string()
          .nullable()
          .describe('How conversion price is determined'),
      })
      .nullable()
      .describe('Conversion mechanics upon equity financing'),
    corporate_transaction_conversion: z
      .object({
        treatment: z
          .string()
          .nullable()
          .describe('Treatment in a corporate transaction (M&A)'),
        payment_amount: z
          .string()
          .nullable()
          .describe('Amount payable or conversion terms'),
      })
      .nullable()
      .describe('Treatment upon corporate transaction'),
    ipo_conversion: z
      .object({
        converts_to: z.string().nullable().describe('Share class upon IPO'),
        price_mechanism: z
          .string()
          .nullable()
          .describe('How IPO conversion price is set'),
      })
      .nullable()
      .describe('Conversion upon IPO'),
    maturity_conversion: z
      .object({
        treatment: z
          .string()
          .nullable()
          .describe('Treatment at maturity (debt variant only)'),
        investor_election: z
          .boolean()
          .nullable()
          .describe('Whether investor can elect conversion at maturity'),
      })
      .nullable()
      .describe('Treatment at maturity for debt variant'),
  })
  .nullable()
  .describe(
    'Extract all conversion trigger scenarios from this KISS. For each event (qualified financing, corporate transaction, IPO, maturity), extract the conversion mechanics and share class. Look in "Conversion", "Corporate Transaction", and "Maturity" sections. If not found, return null.',
  );

export const kissMfnProRataSchema = z
  .object({
    mfn_clause: z
      .boolean()
      .nullable()
      .describe('Whether an MFN (Most Favored Nation) clause is present'),
    pro_rata_right: z
      .boolean()
      .nullable()
      .describe('Whether investor has pro rata rights'),
    major_investor_threshold: z
      .number()
      .nullable()
      .describe(
        'Dollar threshold to qualify as a Major Investor for pro rata rights',
      ),
  })
  .nullable()
  .describe(
    'Extract MFN and pro rata provisions from this KISS. Check for an MFN clause, pro rata participation rights, and whether there is a Major Investor threshold. If not found, return null.',
  );
