import { z } from 'zod';

// ---------------------------------------------------------------------------
// SPA master-field-aligned schemas
// Keys match master_field_definitions.field_key for the SPA document type
// so extraction output maps directly to document_field_values storage.
// ---------------------------------------------------------------------------

// -- Step 1: Transaction economics ----------------------------------------

export const spaShareClassSchema = z
  .string()
  .nullable()
  .describe(
    "From this SPA, extract the share class being purchased (e.g. 'Series A Preferred Stock'). If not found, return null.",
  );

export const spaNumberOfSharesSchema = z
  .number()
  .nullable()
  .describe(
    'From this SPA, extract the total number of shares being purchased in the transaction. If not found, return null.',
  );

// -- Step 2: Representations & Warranties ---------------------------------

export const spaRepresentationsAndWarrantiesSchema = z
  .array(
    z.object({
      rep_title: z.string().describe('Title of the representation.'),
      materiality_qualifier: z
        .enum(['material_adverse_effect', 'material', 'none'])
        .describe('The materiality qualifier applied to this representation.'),
      knowledge_qualifier: z
        .enum(['actual_knowledge', 'constructive_knowledge', 'none'])
        .describe('The knowledge qualifier applied to this representation.'),
      survival_period_months: z
        .number()
        .nullable()
        .describe(
          'The survival period for this representation in months, if specified.',
        ),
    }),
  )
  .nullable()
  .describe(
    'From this SPA, extract all company representations and warranties. For each rep return: rep_title, materiality_qualifier (material_adverse_effect/material/none), knowledge_qualifier (actual_knowledge/constructive_knowledge/none), survival_period_months. Flag any rep that is qualified by both materiality AND knowledge — these are the weakest reps. If not found, return null.',
  );

// -- Step 3: Conditions to Closing ----------------------------------------

export const spaConditionsToClosingSchema = z
  .array(
    z.object({
      condition: z.string().describe('Description of the closing condition.'),
      party_responsible: z
        .enum(['company', 'investor', 'both'])
        .nullable()
        .describe('The party responsible for satisfying this condition.'),
      waivable: z
        .boolean()
        .nullable()
        .describe('Whether this condition can be waived.'),
      outside_date_if_not_met: z
        .string()
        .nullable()
        .describe(
          'The outside date by which this condition must be met, if specified (YYYY-MM-DD).',
        ),
    }),
  )
  .nullable()
  .describe(
    "From this SPA, list all conditions to closing. For each return: condition, party_responsible (company/investor/both), waivable (true/false), outside_date_if_not_met. Flag any condition that is solely within the investor's discretion to satisfy or waive. If not found, return null.",
  );

// -- Step 4: Indemnification (individual fields) --------------------------

export const spaIndemnificationSurvivalPeriodSchema = z
  .number()
  .nullable()
  .describe(
    'From this SPA, extract the general indemnification survival period in months — the number of months reps and warranties survive post-closing for indemnification purposes. If not found, return null.',
  );

export const spaBasketTypeSchema = z
  .enum(['Deductible', 'First Dollar'])
  .nullable()
  .describe(
    "From this SPA, extract the indemnification basket type. 'Deductible' means losses must exceed the basket before any recovery is owed; 'First Dollar' means all losses from the first dollar are recoverable once the basket threshold is crossed. If not found, return null.",
  );

export const spaIndemnificationCapSchema = z
  .number()
  .nullable()
  .describe(
    'From this SPA, extract the indemnification cap — the maximum aggregate indemnification liability of the indemnifying party. Return as a number. If not found, return null.',
  );

export const spaFraudCarveOutSchema = z
  .boolean()
  .nullable()
  .describe(
    'From this SPA, determine whether fraud claims are carved out (excluded) from the indemnification cap. Return true if fraud is carved out, false if not. If not found, return null.',
  );

export const spaSurvivalPeriodMonthsFundamentalRepsSchema = z
  .number()
  .nullable()
  .describe(
    'From this SPA, extract the default survival period in months for fundamental representations and warranties (the longer survival period that applies to fundamental reps as a group). If not found, return null.',
  );

// -- Step 5: Covenants (split into pre and post) --------------------------

export const spaPreClosingCovenantsSchema = z
  .array(
    z.object({
      covenant_description: z
        .string()
        .describe('Description of the pre-closing covenant.'),
      party_obligated: z
        .string()
        .describe('The party obligated under this covenant.'),
      restricts_operations: z
        .boolean()
        .describe(
          'True if this covenant restricts normal business operations (hiring, contracts, capex).',
        ),
    }),
  )
  .nullable()
  .describe(
    'From this SPA, list all pre-closing covenants — operating restrictions on the company between signing and closing. For each return: covenant_description, party_obligated, restricts_operations. Flag any that would restrict hiring above a salary threshold, new customer contracts above a value threshold, or capital expenditures above a threshold. If not found, return null.',
  );

export const spaPostClosingCovenantsSchema = z
  .array(
    z.object({
      covenant_description: z
        .string()
        .describe('Description of the post-closing covenant.'),
      party_obligated: z
        .string()
        .describe('The party obligated under this covenant.'),
      duration: z
        .string()
        .nullable()
        .describe('The duration or period for which this covenant applies.'),
    }),
  )
  .nullable()
  .describe(
    'From this SPA, list all post-closing covenants — obligations and restrictions that survive the closing. For each return: covenant_description, party_obligated, duration. If not found, return null.',
  );
