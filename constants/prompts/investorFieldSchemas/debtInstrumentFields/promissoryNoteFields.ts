import { z } from 'zod';

export const pnPrincipalInterestSchema = z
  .object({
    maker: z.string().nullable().describe('The maker/borrower of the note'),
    payee: z.string().nullable().describe('The payee/lender of the note'),
    principal: z.number().nullable().describe('Principal amount'),
    interest_rate: z
      .number()
      .nullable()
      .describe('Annual interest rate as decimal'),
    interest_type: z
      .enum(['simple', 'compound'])
      .nullable()
      .describe('Simple or compound interest'),
    accrual_basis: z
      .string()
      .nullable()
      .describe('Interest accrual basis (e.g., "365-day year")'),
    payment_schedule: z
      .string()
      .nullable()
      .describe(
        'Payment schedule (e.g., "monthly", "quarterly", "at maturity")',
      ),
    issue_date: z.string().nullable().describe('Issue date (ISO 8601)'),
  })
  .nullable()
  .describe(
    'Extract the principal and interest terms from this Promissory Note. Identify the maker (borrower) and payee (lender), principal amount, interest rate and type, accrual basis, payment schedule, and issue date. Look in the opening paragraph and first sections. If not found, return null.',
  );

export const pnMaturityRepaymentSchema = z
  .object({
    note_type: z
      .enum(['demand', 'term', 'installment'])
      .nullable()
      .describe('Type of promissory note'),
    maturity_date: z.string().nullable().describe('Maturity date (ISO 8601)'),
    amortization_schedule: z
      .string()
      .nullable()
      .describe('Amortization details if applicable'),
    balloon_payment: z
      .boolean()
      .nullable()
      .describe('Whether there is a balloon payment at maturity'),
    prepayment_penalty: z
      .string()
      .nullable()
      .describe('Prepayment penalty terms if any'),
    extension_option: z
      .string()
      .nullable()
      .describe('Extension option terms if any'),
  })
  .nullable()
  .describe(
    'Extract maturity and repayment terms from this Promissory Note. Determine the note type (demand, term, or installment), maturity date, amortization schedule, balloon payment, prepayment penalty, and extension options. Look in "Maturity", "Repayment", and "Prepayment" sections. If not found, return null.',
  );

export const pnSecurityCollateralSchema = z
  .object({
    secured: z.boolean().nullable().describe('Whether the note is secured'),
    collateral: z.string().nullable().describe('Description of collateral'),
    lien_position: z
      .string()
      .nullable()
      .describe('Lien position (e.g., "first priority")'),
    ucc_filing: z
      .boolean()
      .nullable()
      .describe('Whether UCC filing is required'),
    guarantor: z.string().nullable().describe('Guarantor if any'),
    cross_default: z
      .boolean()
      .nullable()
      .describe('Whether cross-default provisions apply'),
  })
  .nullable()
  .describe(
    'Extract security and collateral provisions from this Promissory Note. Determine if the note is secured, describe collateral, lien position, UCC filing requirements, guarantor, and cross-default provisions. Look in "Security", "Collateral", and "Guarantee" sections. If not found, return null.',
  );

export const pnEventsOfDefaultSchema = z
  .array(
    z.object({
      trigger: z.string().describe('The event that constitutes a default'),
      cure_period: z.string().nullable().describe('Cure period allowed if any'),
      acceleration: z
        .boolean()
        .describe('Whether the full balance accelerates upon this default'),
      cross_default: z
        .boolean()
        .describe('Whether this is a cross-default provision'),
    }),
  )
  .nullable()
  .describe(
    'Extract all events of default from this Promissory Note. For each event, return the trigger description, cure period (if any), whether it causes acceleration of the full balance, and whether it is a cross-default provision. Look in the "Events of Default" section. If not found, return null.',
  );

export const pnConversionTermsSchema = z
  .object({
    convertible: z
      .boolean()
      .nullable()
      .describe('Whether the note has conversion rights'),
    conversion_trigger: z
      .string()
      .nullable()
      .describe('What triggers conversion'),
    conversion_price_or_formula: z
      .string()
      .nullable()
      .describe('Conversion price or formula'),
    valuation_cap: z
      .number()
      .nullable()
      .describe('Valuation cap for conversion if any'),
    discount: z
      .number()
      .nullable()
      .describe('Discount rate for conversion if any'),
    holder_option: z
      .boolean()
      .nullable()
      .describe('Whether conversion is at the holder option'),
  })
  .nullable()
  .describe(
    'Extract conversion terms from this Promissory Note, if any. Determine if the note is convertible, what triggers conversion, the conversion price or formula, valuation cap, discount rate, and whether conversion is at the holder option. Note: If this is a fully convertible note, it should likely be classified as a CPN instead. If no conversion terms found, return null.',
  );
