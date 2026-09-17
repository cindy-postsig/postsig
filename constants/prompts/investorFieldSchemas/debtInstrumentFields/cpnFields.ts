import { z } from 'zod';

export const cpnCoreDebtTermsSchema = z
  .object({
    principal: z.number().nullable().describe('Principal amount of the note'),
    interest_rate: z
      .number()
      .nullable()
      .describe('Annual interest rate as a decimal (e.g., 0.08 for 8%)'),
    interest_type: z
      .enum(['simple', 'compound'])
      .nullable()
      .describe('Whether interest is simple or compound'),
    accrual_basis: z
      .string()
      .nullable()
      .describe(
        'Interest accrual basis (e.g., "365-day year", "360-day year")',
      ),
    maturity_date: z.string().nullable().describe('Maturity date (ISO 8601)'),
    payment_schedule: z
      .string()
      .nullable()
      .describe(
        'Interest payment schedule (e.g., "accrued, not paid until maturity")',
      ),
  })
  .nullable()
  .describe(
    'Extract the core debt terms from this Convertible Promissory Note. Look for principal amount, interest rate and type (simple vs compound), accrual basis, maturity date, and payment schedule. These are typically in the opening paragraph and Section 1 (or "Terms of the Note"). If not found, return null.',
  );

export const cpnMaturityTreatmentSchema = z
  .object({
    treatment_type: z
      .enum(['repayment', 'conversion', 'extension', 'investor_election'])
      .nullable()
      .describe('What happens at maturity'),
    repayment_premium: z
      .number()
      .nullable()
      .describe(
        'Any premium on repayment at maturity (e.g., 1.5 means 150% of principal)',
      ),
    conversion_at_maturity: z
      .object({
        converts_to: z
          .string()
          .nullable()
          .describe('Share class upon maturity conversion'),
        price_mechanism: z
          .string()
          .nullable()
          .describe('How conversion price is set at maturity'),
      })
      .nullable()
      .describe('Conversion terms if note converts at maturity'),
    extension_terms: z
      .string()
      .nullable()
      .describe('Extension terms if maturity can be extended'),
  })
  .nullable()
  .describe(
    'Extract the maturity treatment provisions from this Convertible Note. Determine what happens if the note reaches maturity without a qualifying event: does it get repaid (with premium?), automatically convert, extend, or give the investor an election? Look in "Maturity", "Repayment", and "Default" sections. If not found, return null.',
  );

export const cpnSecuritySenioritySchema = z
  .object({
    secured: z.boolean().nullable().describe('Whether the note is secured'),
    collateral: z
      .string()
      .nullable()
      .describe('Description of collateral if secured'),
    lien_position: z
      .string()
      .nullable()
      .describe('Lien position (e.g., "first", "second", "subordinated")'),
    subordination: z
      .string()
      .nullable()
      .describe('Subordination terms if the note is subordinated'),
    cross_default: z
      .boolean()
      .nullable()
      .describe('Whether cross-default provisions exist'),
    events_of_default: z
      .array(
        z.object({
          trigger: z.string().describe('The event that triggers a default'),
          cure_period: z.string().nullable().describe('Cure period if any'),
          acceleration: z
            .boolean()
            .describe('Whether the note accelerates upon this default'),
        }),
      )
      .nullable()
      .describe('List of events of default with cure periods and acceleration'),
  })
  .nullable()
  .describe(
    'Extract security and seniority provisions from this Convertible Note. Determine if the note is secured or unsecured, the lien position, subordination terms, cross-default provisions, and all events of default with their cure periods and acceleration rights. Look in "Security", "Subordination", and "Events of Default" sections. If not found, return null.',
  );

export const cpnChangeOfControlSchema = z
  .object({
    treatment: z
      .enum(['repayment', 'conversion', 'investor_election'])
      .nullable()
      .describe('How the note is treated upon a change of control'),
    repayment_multiple: z
      .number()
      .nullable()
      .describe(
        'Multiple of principal payable on CoC (e.g., 2.0 means 2x principal)',
      ),
    conversion_terms: z
      .string()
      .nullable()
      .describe('Conversion terms if note converts upon CoC'),
    coc_definition: z
      .string()
      .nullable()
      .describe('How "Change of Control" is defined in the document'),
  })
  .nullable()
  .describe(
    'Extract the change of control provisions from this Convertible Note. Determine the treatment (repayment at a multiple, conversion, or investor election), the repayment multiple if applicable, conversion terms, and how "Change of Control" is defined. Look in "Change of Control", "Corporate Transaction", or "Liquidity Event" sections. If not found, return null.',
  );
