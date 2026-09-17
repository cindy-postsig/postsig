import { z } from 'zod';

// COI (Charter / Certificate of Incorporation) Schemas

export const coiAuthorizedShareStructureSchema = z
  .object({
    total_authorized: z
      .number()
      .nullable()
      .describe('Total number of authorized shares across all classes'),
    common_authorized: z
      .number()
      .nullable()
      .describe('Total authorized common shares'),
    preferred_authorized: z
      .number()
      .nullable()
      .describe('Total authorized preferred shares across all series'),
    blank_check_preferred: z
      .boolean()
      .nullable()
      .describe('Whether the board can issue blank check preferred stock'),
  })
  .nullable()
  .describe(
    'Extract the authorized share structure from this Charter/COI. Look for total authorized shares broken down by common and preferred, and whether blank check preferred authorization exists. Check "AUTHORIZED CAPITAL STOCK" or "Authorized Shares" sections. If not found, return null.',
  );

export const coiPreferredTermsBySeriesSchema = z
  .array(
    z.object({
      series_name: z
        .string()
        .describe('Series designation (e.g., "Series A", "Series Seed")'),
      authorized_shares: z
        .number()
        .nullable()
        .describe('Number of authorized shares for this series'),
      original_issue_price: z
        .number()
        .nullable()
        .describe('Original issue price per share'),
      liquidation_preference: z
        .string()
        .nullable()
        .describe(
          'Liquidation preference terms (e.g., "1x non-participating")',
        ),
      liquidation_multiplier: z
        .number()
        .nullable()
        .describe(
          'Liquidation preference multiplier as a number (e.g., 1 for "1x", 1.5 for "1.5x the Original Issue Price")',
        ),
      conversion_ratio: z
        .string()
        .nullable()
        .describe(
          'Conversion ratio to common in strict "N:M" format (e.g., "1:1", "1.5:1"). Output only the ratio — no extra words.',
        ),
      dividend_rights: z
        .string()
        .nullable()
        .describe('Dividend rights description'),
      voting_rights: z
        .string()
        .nullable()
        .describe('Voting rights description (e.g., "as-converted basis")'),
    }),
  )
  .nullable()
  .describe(
    'Extract preferred stock terms for EACH series from this Charter/COI. For every series of preferred stock, return the series name, authorized shares, original issue price, liquidation preference (with its numeric multiplier), conversion ratio, dividend rights, and voting rights. Look in each series-specific section of the Charter. If not found, return null.',
  );

export const coiLiquidationWaterfallSchema = z
  .array(
    z.object({
      share_class: z.string().describe('Share class or series'),
      priority_rank: z
        .number()
        .describe('Priority rank in the waterfall (1 = first paid)'),
      liquidation_multiplier: z
        .number()
        .nullable()
        .describe(
          'Liquidation preference multiplier as a number (e.g., 1 for "1x", 1.5 for "1.5x the Original Issue Price")',
        ),
      participation: z
        .boolean()
        .nullable()
        .describe('Whether this class participates after preference'),
      participation_cap: z
        .number()
        .nullable()
        .describe(
          'Participation cap as a multiple of the original issue price (e.g., 3 for a "3x" cap). Null if participation is uncapped or not applicable.',
        ),
    }),
  )
  .nullable()
  .describe(
    'Extract the liquidation waterfall / distribution priority from this Charter/COI. For each share class, return its priority rank, liquidation preference multiplier (numeric, e.g. 1 for "1x"), whether it participates after preference, and any participation cap (numeric multiple). Reconstruct the full priority order. Look in "Liquidation", "Winding Up", and "Distribution" sections. If not found, return null.',
  );

export const coiProtectiveProvisionsSchema = z
  .array(
    z.object({
      provision_description: z
        .string()
        .describe('Description of the protective provision'),
      consent_required_from: z
        .string()
        .describe('Which class/series must consent'),
      threshold: z
        .string()
        .nullable()
        .describe('Voting threshold required (e.g., "majority", "66.7%")'),
      category: z
        .enum(['corporate', 'equity', 'financial', 'governance', 'other'])
        .describe('Category of the provision'),
    }),
  )
  .nullable()
  .describe(
    'Extract all protective provisions (veto rights) from this Charter/COI. For each provision, return the description, which share class/series must consent, the voting threshold, and categorize it as corporate, equity, financial, governance, or other. Look in "Protective Provisions" and "Consent Rights" sections. If not found, return null.',
  );

export const coiAntiDilutionSchema = z
  .array(
    z.object({
      series: z
        .string()
        .describe('Series this anti-dilution provision applies to'),
      type: z
        .enum([
          'broad_based_weighted_average',
          'narrow_based_weighted_average',
          'full_ratchet',
        ])
        .describe('Anti-dilution formula type'),
      formula_description: z
        .string()
        .nullable()
        .describe('Description of the formula mechanics'),
      exclusions: z
        .array(z.string())
        .nullable()
        .describe('Issuances excluded from anti-dilution adjustment'),
    }),
  )
  .nullable()
  .describe(
    'Extract anti-dilution provisions for each preferred series from this Charter/COI. For each series, return the anti-dilution type (broad-based weighted average, narrow-based, or full ratchet), formula description, and list of excluded issuances. Look in "Anti-Dilution Adjustments" and "Conversion" sections. If not found, return null.',
  );

export const coiRestatedEffectiveDateSchema = z
  .string()
  .nullable()
  .describe(
    'From this certificate of incorporation, extract the effective date of the most recent amendment or restatement. Look for filing stamps, "effective as of" language, or Delaware Secretary of State certification. If not found, return null.',
  );

export const coiRestatedAmendmentsIncorporatedSchema = z
  .array(
    z.object({
      amendment_description: z
        .string()
        .describe('Description of the prior amendment or certificate'),
      original_date: z
        .string()
        .nullable()
        .describe('Original date of the amendment (YYYY-MM-DD if available)'),
    }),
  )
  .nullable()
  .describe(
    'From this certificate of incorporation, extract the list of prior amendments or certificates being restated or incorporated. For each return: amendment_description, original_date. Look in the recitals or introductory paragraphs. If not found, return null.',
  );

export const coiConversionMechanicsSchema = z
  .array(
    z.object({
      series_name: z.string().describe('Series designation'),
      optional_conversion_ratio: z
        .string()
        .nullable()
        .describe(
          'Optional (holder-initiated) conversion ratio in strict "N:M" format (e.g., "1:1"). Output only the ratio — no extra words.',
        ),
      mandatory_conversion_triggers: z
        .string()
        .nullable()
        .describe(
          'Mandatory/automatic conversion triggers (e.g., IPO threshold, investor vote percentage)',
        ),
      conversion_price_adjustments: z
        .string()
        .nullable()
        .describe('Any conversion price adjustments or reset provisions'),
    }),
  )
  .nullable()
  .describe(
    'From this certificate of incorporation, extract conversion mechanics for each series of preferred stock. Return: series_name, optional_conversion_ratio, mandatory_conversion_triggers (e.g., IPO threshold, investor vote percentage), conversion_price_adjustments. Look in the Conversion section under each series. If not found, return null.',
  );

export const coiRedemptionRightsSchema = z
  .object({
    has_redemption_rights: z
      .boolean()
      .nullable()
      .describe('Whether redemption rights exist'),
    redemption_start_date: z
      .string()
      .nullable()
      .describe('Earliest date redemption can be triggered'),
    redemption_price_formula: z
      .string()
      .nullable()
      .describe('Formula for computing the redemption price'),
    requires_investor_vote: z
      .boolean()
      .nullable()
      .describe('Whether redemption requires an investor vote'),
  })
  .nullable()
  .describe(
    'From this certificate of incorporation, extract any redemption rights. Return: has_redemption_rights (boolean), redemption_start_date, redemption_price_formula, requires_investor_vote (boolean). Look in "Redemption" sections. If not found, return null.',
  );

export const coiDividendsSchema = z
  .array(
    z.object({
      series_names: z
        .array(z.string())
        .describe(
          'Series designations, only return the identifiers, not the full names',
        ),
      dividend_type: z
        .enum(['cumulative', 'non_cumulative', 'none'])
        .describe('Dividend type'),
      dividend_accruing: z
        .boolean()
        .nullable()
        .describe('Whether dividends accrue'),
      dividend_basis: z
        .string()
        .nullable()
        .describe('Basis for dividend payments'),
      payable_when_declared: z
        .boolean()
        .nullable()
        .describe('Whether dividends are payable when declared'),
      seniority: z
        .enum(['senior', 'pari_passu', 'junior', 'unknown'])
        .nullable()
        .describe('Seniority of the preferred shares'),
      dividend_rate: z
        .number()
        .nullable()
        .describe('Dividend rate (percentage)'),
      payment_frequency: z
        .string()
        .nullable()
        .describe('Payment frequency (e.g., quarterly, annually)'),
      participation_with_common: z
        .boolean()
        .nullable()
        .describe('Whether preferred participates in common dividends'),
    }),
  )
  .nullable()
  .describe(
    'From this certificate of incorporation, extract dividend provisions for each series. Return: series_names (array of series identifiers only), dividend_type (cumulative/non_cumulative/none), dividend_accruing (boolean), dividend_basis, payable_when_declared (boolean), seniority (senior/pari_passu/junior/unknown), dividend_rate, payment_frequency, participation_with_common (boolean). If not found, return null.',
  );

export const coiPayToPlaySchema = z
  .object({
    has_pay_to_play: z
      .boolean()
      .nullable()
      .describe('Whether pay-to-play provisions exist'),
    consequence_of_non_participation: z
      .enum(['conversion_to_common', 'conversion_to_shadow', 'other'])
      .nullable()
      .describe('Consequence of not participating in a future round'),
    affected_series: z
      .string()
      .nullable()
      .describe('Which series are subject to pay-to-play'),
    minimum_participation_amount: z
      .string()
      .nullable()
      .describe('Minimum participation amount to avoid consequences'),
  })
  .nullable()
  .describe(
    'From this certificate of incorporation, extract pay-to-play provisions. Return: has_pay_to_play (boolean), consequence_of_non_participation (conversion_to_common/conversion_to_shadow/other), affected_series, minimum_participation_amount. If not found, return null.',
  );

// Subscription Agreement Schemas

export const subInvestorDetailsSchema = z
  .object({
    legal_name: z
      .string()
      .nullable()
      .describe('Legal name of the subscribing investor'),
    entity_type: z
      .string()
      .nullable()
      .describe(
        'Entity type (e.g., "limited partnership", "corporation", "individual")',
      ),
    jurisdiction: z
      .string()
      .nullable()
      .describe('Jurisdiction of organization'),
    subscription_amount: z
      .number()
      .nullable()
      .describe('Total subscription amount'),
    wire_instructions_present: z
      .boolean()
      .nullable()
      .describe('Whether wire instructions are provided'),
    signatory: z
      .string()
      .nullable()
      .describe('Name and title of the signatory'),
  })
  .nullable()
  .describe(
    'Extract the subscribing investor details from this Subscription Agreement. Look for the investor legal name, entity type, jurisdiction, subscription amount, whether wire instructions are present, and the signatory. Check the opening paragraphs, investor questionnaire, and signature blocks. If not found, return null.',
  );

export const subSecuritiesPurchasedSchema = z
  .object({
    share_class: z
      .string()
      .nullable()
      .describe('Class of shares being purchased'),
    series: z.string().nullable().describe('Series designation if applicable'),
    shares: z.number().nullable().describe('Number of shares being purchased'),
    price_per_share: z.number().nullable().describe('Price per share'),
    total_purchase_price: z
      .number()
      .nullable()
      .describe('Total purchase price'),
    closing_date: z
      .string()
      .nullable()
      .describe('Expected closing date (ISO 8601)'),
    verification_method: z
      .string()
      .nullable()
      .describe('How share count was verified (e.g., "per Schedule A")'),
  })
  .nullable()
  .describe(
    'Extract details of the securities being purchased in this Subscription Agreement. Return share class, series, number of shares, price per share, total purchase price, closing date, and verification method. Look in "Subscription", "Purchase", and attached schedules. If not found, return null.',
  );

export const subAccreditationSchema = z
  .object({
    accredited_investor: z
      .boolean()
      .nullable()
      .describe('Whether investor represents they are accredited'),
    accreditation_basis: z
      .string()
      .nullable()
      .describe('Basis for accredited investor status'),
    qualified_purchaser: z
      .boolean()
      .nullable()
      .describe('Whether investor is a qualified purchaser'),
    non_us_person: z
      .boolean()
      .nullable()
      .describe('Whether investor represents as a non-US person'),
  })
  .nullable()
  .describe(
    'Extract investor accreditation representations from this Subscription Agreement. Determine if the investor represents as accredited (and on what basis), whether they are a qualified purchaser, and whether they represent as a non-US person. Look in "Investor Representations", "Accredited Investor", and investor questionnaire sections. If not found, return null.',
  );

export const subClosingMechanicsSchema = z
  .object({
    scheduled_closing_date: z
      .string()
      .nullable()
      .describe('Scheduled closing date (ISO 8601)'),
    conditions: z
      .array(z.string())
      .nullable()
      .describe('List of closing conditions'),
    investor_specific_conditions: z
      .array(z.string())
      .nullable()
      .describe('Conditions specific to this investor'),
    wire_deadline: z.string().nullable().describe('Deadline for wire transfer'),
  })
  .nullable()
  .describe(
    'Extract closing mechanics from this Subscription Agreement. Return the scheduled closing date, list of closing conditions, any investor-specific conditions, and wire transfer deadline. Look in "Closing", "Conditions", and "Payment" sections. If not found, return null.',
  );

// Warrant Extended Schemas

export const wtExerciseMechanicsSchema = z
  .object({
    exercise_types: z
      .array(z.enum(['cash', 'net_exercise', 'cashless']))
      .nullable()
      .describe('Available exercise methods'),
    net_exercise_formula: z
      .string()
      .nullable()
      .describe('Formula for net/cashless exercise'),
    notice_period: z
      .string()
      .nullable()
      .describe('Required notice period for exercise'),
    minimum_exercise: z
      .number()
      .nullable()
      .describe('Minimum number of shares per exercise'),
    auto_exercise: z
      .boolean()
      .nullable()
      .describe('Whether auto-exercise on expiration is provided'),
  })
  .nullable()
  .describe(
    'Extract exercise mechanics from this Warrant. Determine available exercise methods (cash, net/cashless exercise), the net exercise formula, notice period, minimum exercise amount, and whether auto-exercise on expiration is provided. Look in "Exercise", "Method of Exercise", and "Net Exercise" sections. If not found, return null.',
  );

export const wtExpirationSchema = z
  .object({
    issue_date: z.string().nullable().describe('Warrant issue date (ISO 8601)'),
    expiration_date: z
      .string()
      .nullable()
      .describe('Warrant expiration date (ISO 8601)'),
    term_years: z.number().nullable().describe('Warrant term in years'),
    accelerating_events: z
      .array(z.string())
      .nullable()
      .describe('Events that accelerate expiration'),
  })
  .nullable()
  .describe(
    'Extract expiration terms from this Warrant. Return the issue date, expiration date, term in years, and any events that accelerate expiration (e.g., IPO, acquisition). Look in "Term", "Expiration", and "Termination" sections. If not found, return null.',
  );

export const wtAntiDilutionAdjustmentsSchema = z
  .object({
    stock_splits: z
      .boolean()
      .nullable()
      .describe('Whether exercise price adjusts for stock splits'),
    stock_dividends: z
      .boolean()
      .nullable()
      .describe('Whether exercise price adjusts for stock dividends'),
    recapitalization: z
      .boolean()
      .nullable()
      .describe('Whether adjustments apply to recapitalizations'),
    below_exercise_issuances: z
      .string()
      .nullable()
      .describe('Treatment of below-exercise-price issuances'),
    option_pool_adjustments: z
      .string()
      .nullable()
      .describe('How option pool changes affect the warrant'),
  })
  .nullable()
  .describe(
    'Extract anti-dilution and adjustment provisions from this Warrant. Determine how the exercise price and share count adjust for stock splits, dividends, recapitalizations, below-exercise-price issuances, and option pool changes. Look in "Adjustments", "Anti-Dilution", and "Protective Provisions" sections. If not found, return null.',
  );

export const wtChangeOfControlSchema = z
  .object({
    treatment: z
      .enum([
        'exercise_before',
        'convert_to_acquirer',
        'cash_out',
        'terminate',
        'holder_election',
      ])
      .nullable()
      .describe('How the warrant is treated in a change of control'),
    valuation_methodology: z
      .string()
      .nullable()
      .describe(
        'How the warrant is valued in a CoC (e.g., "Black-Scholes", "intrinsic value")',
      ),
    holder_election: z
      .boolean()
      .nullable()
      .describe('Whether the holder can elect treatment'),
    cash_out_value: z
      .string()
      .nullable()
      .describe('Cash-out value formula or amount'),
  })
  .nullable()
  .describe(
    'Extract change of control provisions from this Warrant. Determine the treatment (exercise before closing, convert to acquirer securities, cash-out, terminate, or holder election), the valuation methodology, whether the holder has an election, and the cash-out value formula. Look in "Change of Control", "Fundamental Transaction", and "Corporate Transaction" sections. If not found, return null.',
  );
