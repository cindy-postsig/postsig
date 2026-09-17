import { z } from 'zod';

export const lpaFundEconomicsSchema = z
  .object({
    management_fee_rate: z
      .number()
      .nullable()
      .describe('Management fee rate as decimal (e.g., 0.02 for 2%)'),
    management_fee_basis: z
      .string()
      .nullable()
      .describe('Fee basis (e.g., "committed capital", "invested capital")'),
    management_fee_step_down: z
      .string()
      .nullable()
      .describe(
        'Step-down terms (e.g., "reduces to 1.5% after investment period")',
      ),
    carry_rate: z
      .number()
      .nullable()
      .describe('Carried interest rate as decimal (e.g., 0.20 for 20%)'),
    preferred_return: z
      .number()
      .nullable()
      .describe('Preferred return / hurdle rate as decimal'),
    catch_up: z
      .string()
      .nullable()
      .describe('GP catch-up provision description'),
    clawback: z
      .boolean()
      .nullable()
      .describe('Whether a GP clawback provision exists'),
    gp_commitment: z
      .string()
      .nullable()
      .describe('GP commitment amount or percentage'),
  })
  .nullable()
  .describe(
    'Extract fund economics from this Limited Partnership Agreement. Include management fee (rate, basis, step-down), carried interest rate, preferred return, catch-up provision, clawback, and GP commitment. Look in "Management Fee", "Carried Interest", and "Distributions" sections. If not found, return null.',
  );

export const lpaCapitalCallsSchema = z
  .object({
    notice_period: z
      .string()
      .nullable()
      .describe('Notice period for capital calls (e.g., "10 business days")'),
    default_interest_rate: z
      .number()
      .nullable()
      .describe('Interest rate on defaulting LP contributions'),
    default_remedies: z
      .array(z.string())
      .nullable()
      .describe('Remedies available against defaulting LPs'),
    recycling_permitted: z
      .boolean()
      .nullable()
      .describe('Whether capital recycling is permitted'),
    over_commitment: z
      .string()
      .nullable()
      .describe('Over-commitment policy if any'),
    lp_transfer_restrictions: z
      .string()
      .nullable()
      .describe('Restrictions on LP interest transfers'),
  })
  .nullable()
  .describe(
    'Extract capital call provisions from this LPA. Cover notice period, default interest rate, remedies against defaulting LPs, recycling permissions, over-commitment policy, and LP transfer restrictions. Look in "Capital Contributions", "Defaults", and "Transfers" sections. If not found, return null.',
  );

export const lpaInvestmentRestrictionsSchema = z
  .object({
    geographic_focus: z
      .string()
      .nullable()
      .describe('Geographic focus (e.g., "US and Canada", "Global")'),
    sector_focus: z
      .string()
      .nullable()
      .describe('Sector focus (e.g., "enterprise software", "healthcare")'),
    stage_focus: z
      .string()
      .nullable()
      .describe('Stage focus (e.g., "Series A-B", "growth equity")'),
    concentration_limit: z
      .string()
      .nullable()
      .describe(
        'Single investment concentration limit (e.g., "no more than 15% of commitments")',
      ),
    follow_on_policy: z
      .string()
      .nullable()
      .describe('Follow-on investment policy'),
    co_invest_allocation: z
      .string()
      .nullable()
      .describe('LP co-investment allocation policy'),
    prohibited_investments: z
      .array(z.string())
      .nullable()
      .describe('Prohibited investment types'),
    investment_period: z
      .string()
      .nullable()
      .describe('Investment period length'),
    fund_term: z.string().nullable().describe('Total fund term'),
    extensions: z.string().nullable().describe('Extension provisions'),
  })
  .nullable()
  .describe(
    'Extract investment restrictions from this LPA. Cover geographic/sector/stage focus, concentration limits, follow-on policy, co-investment allocation, prohibited investments, investment period, fund term, and extension provisions. Look in "Investment Restrictions", "Objectives", and "Term" sections. If not found, return null.',
  );

export const lpaKeyPersonSchema = z
  .object({
    named_persons: z.array(z.string()).nullable().describe('Named key persons'),
    trigger_description: z
      .string()
      .nullable()
      .describe(
        'What triggers a key person event (e.g., "departure of any named person")',
      ),
    consequence: z
      .string()
      .nullable()
      .describe(
        'Consequence of key person event (e.g., "investment period suspended")',
      ),
    cure_period: z
      .string()
      .nullable()
      .describe('Cure period to resolve key person event'),
    lp_consent_threshold: z
      .string()
      .nullable()
      .describe('LP consent threshold to waive key person provision'),
    time_commitment: z
      .string()
      .nullable()
      .describe('Required time commitment for key persons'),
  })
  .nullable()
  .describe(
    'Extract key person provisions from this LPA. Identify named key persons, trigger events, consequences (typically investment period suspension), cure period, LP consent threshold to waive, and time commitment requirements. Look in "Key Person" or "Key Man" sections. If not found, return null.',
  );

export const lpaGovernanceSchema = z
  .object({
    lpac_composition: z
      .string()
      .nullable()
      .describe('LP Advisory Committee composition'),
    lpac_powers: z
      .array(z.string())
      .nullable()
      .describe('LPAC powers and responsibilities'),
    lp_majority_matters: z
      .array(
        z.object({
          matter: z.string().describe('Matter requiring LP majority vote'),
          threshold: z.string().describe('Required threshold'),
        }),
      )
      .nullable()
      .describe('Matters requiring LP majority consent'),
    lp_supermajority_matters: z
      .array(
        z.object({
          matter: z.string().describe('Matter requiring LP supermajority vote'),
          threshold: z.string().describe('Required threshold'),
        }),
      )
      .nullable()
      .describe('Matters requiring LP supermajority consent'),
    no_fault_removal: z
      .string()
      .nullable()
      .describe('No-fault GP removal provisions'),
    for_cause_removal: z
      .string()
      .nullable()
      .describe('For-cause GP removal provisions'),
  })
  .nullable()
  .describe(
    'Extract governance provisions from this LPA. Cover LPAC composition and powers, matters requiring LP majority and supermajority consent (with thresholds), and GP removal provisions (no-fault and for-cause). Look in "Advisory Committee", "LP Consent", and "Removal" sections. If not found, return null.',
  );

export const lpaDistributionWaterfallSchema = z
  .object({
    waterfall_type: z
      .enum(['european', 'american'])
      .nullable()
      .describe(
        'Waterfall type (European = whole-fund; American = deal-by-deal)',
      ),
    priority_steps: z
      .array(
        z.object({
          step_number: z.number().describe('Step order in the waterfall'),
          description: z
            .string()
            .describe('Description of this distribution step'),
          recipient: z
            .string()
            .nullable()
            .describe('Who receives distributions at this step'),
        }),
      )
      .nullable()
      .describe('Priority order of the distribution waterfall'),
    tax_distributions: z
      .boolean()
      .nullable()
      .describe('Whether tax distributions are provided'),
    in_kind_distributions: z
      .boolean()
      .nullable()
      .describe('Whether in-kind distributions are permitted'),
    distribution_frequency: z
      .string()
      .nullable()
      .describe(
        'Frequency of distributions (e.g., "quarterly", "upon realization")',
      ),
  })
  .nullable()
  .describe(
    'Extract the distribution waterfall from this LPA. Determine the waterfall type (European/whole-fund vs American/deal-by-deal), the priority order of distribution steps, tax distribution provisions, in-kind distribution permissions, and distribution frequency. Look in "Distributions", "Waterfall", and "Carried Interest" sections. If not found, return null.',
  );
