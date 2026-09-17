import { z } from 'zod';

// Structured Object Schemas
export const contractualPricePerShareSchema = z
  .object({
    value: z.number().nullable(),
    applicableTo: z.string().nullable(),
    scheduleRef: z.string().nullable(),
    clause: z.string().nullable(),
  })
  .nullable()
  .describe(
    "From this Stock Purchase Agreement, extract 'Contractual Price Per Share' (value(s), who it applies to, schedule/exhibit refs) and quote the exact clause. If not found, return null.",
  );

export const originalIssuePriceSchema = z
  .object({
    value: z.number().nullable(),
    class: z.string().nullable(),
    series: z.string().nullable(),
    clause: z.string().nullable(),
  })
  .nullable()
  .describe(
    "From this coi/charter, extract 'Original Issue Price' (value/definition + qualifiers like class/series/seniority) and quote the exact clause. If not found, return null.",
  );

export const pricePerShareSchema = z
  .number()
  .nullable()
  .describe(
    "From this document, extract 'Price Per Share (PPS)' as a number. If not found, return null.",
  );

export const proRataRightsAllSchema = z
  .object({
    type: z.enum(['obligation', 'right']).nullable(),
    thresholds: z.string().nullable(),
    timing: z.string().nullable(),
    clause: z.string().nullable(),
  })
  .nullable()
  .describe(
    "From this Investors' Rights Agreement, extract 'Pro Rata Rights' (obligation/right, thresholds, timing) and quote the exact clause. If not found, return null.",
  );

export const issueDateSchema = z
  .object({
    value: z.string().nullable(),
    definition: z.string().nullable(),
    clause: z.string().nullable(),
  })
  .nullable()
  .describe(
    "From this Convertible Note, extract 'Issue Date' (value/definition + how/when it applies) and quote the exact clause. If not found, return null.",
  );

// Enum / Constrained Schemas
export const stageSchema = z
  .enum([
    'pre_seed',
    'seed',
    'series_a',
    'series_b',
    'series_c',
    'series_d',
    'series_e',
    'series_f',
    'series_g',
    'post_ipo',
    'convertible_note',
    'grant',
    'private_equity',
    'other',
  ])
  .nullable()
  .describe(
    "Extract 'Stage' from this document. If it is not explicitly stated, return null. Use ONLY one of the following values: pre_seed, seed, series_a, series_b, series_c, series_d, series_e, series_f, series_g, post_ipo, convertible_note, grant, private_equity, other.",
  );

export const eventTypeSchema = z
  .enum(['equity_round', 'safe', 'convertible_note', 'warrant', 'secondary'])
  .nullable()
  .describe(
    `Extract 'Event Type' from this document. If it is not explicitly stated, return null.

      Determine the event_type based on the document title and structure. Use ONLY one of the following values:
*   **equity_round**: If the document is a "Stock Purchase Agreement" or "Subscription Agreement" selling specific shares (Common/Preferred).
*   **safe**: If the document is a "Simple Agreement for Future Equity."
*   **convertible_note**: If the document is a "Note Purchase Agreement" or "Promissory Note" with an interest rate and maturity date.
*   **warrant**: If the document is primarily for the issuance of Warrants.
*   **secondary**: If the agreement is between a Shareholder and a Purchaser (not the Company).`,
  );

export const effectiveDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe(
    "Extract 'Effective Date' or 'Agreement Date' or 'Date of Execution' from this document. If it is not explicitly stated, return null.",
  );

export const currencySchema = z
  .enum([
    'USD',
    'EUR',
    'GBP',
    'JPY',
    'CAD',
    'AUD',
    'CHF',
    'CNY',
    'HKD',
    'INR',
    'MXN',
    'NZD',
    'RUB',
    'SAR',
    'SEK',
    'SGD',
    'THB',
    'TRY',
    'ZAR',
  ])
  .nullable()
  .describe(
    "Extract 'Currency' from this document. If it is not explicitly stated, return null.",
  );

// SPA Complex Array/Object Schemas
export const closingConditionsSchema = z
  .array(
    z.object({
      condition_description: z.string(),
      party_responsible_to_satisfy: z
        .enum(['company', 'investor', 'both'])
        .describe(
          'The party responsible for satisfying this closing condition.',
        ),
      waivable: z
        .boolean()
        .describe('Whether this closing condition can be waived.'),
      outside_date_if_not_met: z
        .string()
        .nullable()
        .describe(
          'The outside date by which this condition must be met, if specified.',
        ),
      investor_discretion: z
        .boolean()
        .describe(
          "True if the condition is solely within the investor's discretion to satisfy or waive.",
        ),
    }),
  )
  .nullable()
  .describe(
    "From this SPA, list all conditions to closing. For each return: condition_description, party_responsible_to_satisfy (company/investor/both), waivable (true/false), outside_date_if_not_met. Flag any condition that is solely within the investor's discretion to satisfy or waive. If not found, return null.",
  );

export const covenantsAndPostClosingObligationsSchema = z
  .array(
    z.object({
      covenant_description: z.string(),
      timing: z
        .enum(['pre_closing', 'post_closing', 'ongoing'])
        .describe('When this covenant applies.'),
      party_obligated: z
        .string()
        .describe('The party obligated under this covenant.'),
      duration: z
        .string()
        .nullable()
        .describe(
          'The duration or period for which this covenant applies, if specified.',
        ),
      restricts_hiring_above_threshold: z
        .boolean()
        .describe(
          'True if this is a pre-closing covenant that restricts hiring above a salary threshold.',
        ),
      restricts_new_contracts_above_threshold: z
        .boolean()
        .describe(
          'True if this is a pre-closing covenant that restricts new customer contracts above a value threshold.',
        ),
      restricts_capex_above_threshold: z
        .boolean()
        .describe(
          'True if this is a pre-closing covenant that restricts capital expenditures above a threshold.',
        ),
    }),
  )
  .nullable()
  .describe(
    'From this SPA, list all pre-closing and post-closing covenants. For each return: covenant_description, timing (pre_closing/post_closing/ongoing), party_obligated, duration. Flag any pre-closing covenant that would restrict: hiring above a salary threshold, new customer contracts above a value threshold, or capital expenditures above a threshold. If not found, return null.',
  );

export const repAndWarrantyMatrixSchema = z
  .array(
    z.object({
      rep_title: z.string(),
      materiality_qualifier: z
        .enum(['material_adverse_effect', 'material', 'none'])
        .describe('The materiality qualifier applied to this representation.'),
      knowledge_qualifier: z
        .enum(['actual_knowledge', 'constructive_knowledge', 'none'])
        .describe('The knowledge qualifier applied to this representation.'),
      survival_period: z
        .string()
        .nullable()
        .describe('The survival period for this representation, if specified.'),
      dual_qualified: z
        .boolean()
        .describe(
          'True if the rep is qualified by both materiality AND knowledge — these are the weakest reps.',
        ),
    }),
  )
  .nullable()
  .describe(
    'From this SPA, extract all company representations and warranties. For each rep return: rep_title, materiality_qualifier (material_adverse_effect/material/none), knowledge_qualifier (actual_knowledge/constructive_knowledge/none), survival_period. Flag any rep that is qualified by both materiality AND knowledge — these are the weakest reps. If not found, return null.',
  );

export const indemnificationTermsSchema = z
  .object({
    survival_period_months: z
      .number()
      .nullable()
      .describe(
        'General survival period for indemnification claims, in months.',
      ),
    basket_type: z
      .enum(['deductible', 'first_dollar'])
      .nullable()
      .describe('The type of indemnification basket.'),
    basket_amount: z
      .string()
      .nullable()
      .describe(
        'The basket amount (threshold) before indemnification applies.',
      ),
    indemnification_cap_amount: z
      .string()
      .nullable()
      .describe('The maximum indemnification cap amount.'),
    cap_as_pct_of_purchase_price: z
      .number()
      .nullable()
      .describe(
        'The indemnification cap expressed as a percentage of the purchase price.',
      ),
    fraud_carve_out_from_cap: z
      .boolean()
      .describe(
        'True if fraud claims are carved out from the indemnification cap.',
      ),
    fundamental_reps_with_longer_survival: z
      .array(
        z.object({
          rep_title: z.string(),
          survival_period: z
            .string()
            .describe('The extended survival period for this fundamental rep.'),
        }),
      )
      .nullable()
      .describe(
        'List of fundamental representations with longer survival periods.',
      ),
    maximum_exposure: z
      .string()
      .nullable()
      .describe('Calculated maximum exposure under the indemnification terms.'),
  })
  .nullable()
  .describe(
    'From this SPA, extract indemnification terms. Return: survival_period_months, basket_type (deductible/first_dollar), basket_amount, indemnification_cap_amount, cap_as_pct_of_purchase_price, fraud_carve_out_from_cap (true/false), fundamental_reps_with_longer_survival (list and period). Calculate maximum_exposure under the indemnification. If not found, return null.',
  );

export const investorRightsSchema = z
  .array(
    z.object({
      right_type: z.string(),
      specific_terms: z.string().nullable(),
      trigger_conditions: z.string().nullable(),
      duration: z.string().nullable(),
      transferable_with_shares: z.boolean(),
    }),
  )
  .nullable()
  .describe(
    'Extract distinct investor rights grounded in explicit document text. Return as a structured list (array of objects): right_type, specific_terms, trigger_conditions, duration, transferable_with_shares (true/false). Return null if none.',
  );

// Side Letter Fields
export const mfnClauseSchema = z
  .array(z.string())
  .nullable()
  .describe(
    `
    Search the provided document for any "Most Favored Nation" or "MFN" clauses.

    RECOGNITION SIGNALS:
    - Phrases like "more favorable terms," "subsequent financing," or "equal to or better than."
    - Provisions allowing the investor to amend their agreement to match terms given to future investors.
    `,
  );

export const coInvestmentRightSchema = z
  .array(z.string())
  .nullable()
  .describe(
    `
      Identify any "Co-Investment" rights granted to the investor.

      RECOGNITION SIGNALS:
      - Rights to "participate" in future rounds beyond standard pro-rata.
      - Rights to "allocate" a portion of a future round to the investor's limited partners or affiliates.
      - Terms like "Side-by-side investment" or "Participation in subsequent offerings."
      `,
  );

export const enhancedInformationRightSchema = z
  .array(z.string())
  .nullable()
  .describe(
    `
      Identify any "Enhanced Information Rights" or "Management Rights" that go beyond standard quarterly/annual reporting.

      RECOGNITION SIGNALS:
      - Rights to "monthly" financial statements (standard is usually quarterly).
      - Rights to "inspect books and records" or "visit facilities" at will.
      - Rights to "consult with management" or "advise on operating plans."
      - Terms like "Management Rights Letter" or "Information Covenant."
      `,
  );

export const regulatoryAccommodationsSchema = z
  .object({
    erisa_provisions: z
      .object({
        applies: z.boolean(),
        description: z
          .string()
          .nullable()
          .describe('Description of ERISA provisions, if applicable.'),
      })
      .describe('Whether ERISA provisions are present and their details.'),
    foia_exemption: z
      .boolean()
      .describe('Whether a FOIA exemption provision is present.'),
    sovereign_wealth_fund_provisions: z
      .boolean()
      .describe(
        'Whether sovereign wealth fund accommodation provisions are present.',
      ),
    tax_provisions: z
      .array(z.enum(['UBTI', 'ECI', 'withholding', 'other']))
      .nullable()
      .describe('List of tax-related provisions included.'),
    esg_screening_rights: z
      .boolean()
      .describe('Whether ESG screening rights are granted.'),
    company_compliance_obligations: z
      .array(z.string())
      .nullable()
      .describe(
        'List of provisions that impose an ongoing compliance obligation on the company.',
      ),
  })
  .nullable()
  .describe(
    'From this side letter, identify any regulatory accommodation provisions.',
  );

export const confidentialityObligationsSchema = z
  .object({
    existence_confidential: z
      .boolean()
      .describe(
        'Whether the existence of the side letter itself is confidential.',
      ),
    terms_confidential: z
      .boolean()
      .describe('Whether the terms of the side letter are confidential.'),
    permitted_disclosures: z
      .array(z.enum(['legal_counsel', 'auditors', 'regulators', 'other']))
      .nullable()
      .describe('List of parties to whom disclosure is permitted.'),
    duration_of_confidentiality: z
      .string()
      .nullable()
      .describe(
        'The duration of the confidentiality obligation, if specified.',
      ),
    carve_outs_for_mfn_compliance: z
      .boolean()
      .describe(
        'Whether there are carve-outs allowing disclosure for MFN compliance purposes.',
      ),
  })
  .nullable()
  .describe(
    'From this side letter, identify confidentiality obligations. Return: existence_confidential (true/false), terms_confidential (true/false), permitted_disclosures (list: legal_counsel/auditors/regulators/other), duration_of_confidentiality, carve_outs_for_MFN_compliance (true/false). If not found, return null.',
  );

export const conflictResolutionSchema = z
  .object({
    controlling_document_on_conflict: z
      .enum(['side_letter', 'main_agreement', 'not_stated'])
      .describe(
        'Which document controls in the event of a conflict between the side letter and the main agreement.',
      ),
    amendment_requirements: z
      .string()
      .nullable()
      .describe(
        'The threshold or requirements needed to amend this side letter.',
      ),
    survivability_on_share_transfer: z
      .boolean()
      .describe(
        'Whether the side letter provisions survive upon transfer of shares.',
      ),
    main_agreement_permits_side_letters: z
      .boolean()
      .nullable()
      .describe(
        'Whether the main agreement expressly permits side letters. If false or null, this may create an issue with other investors MFN rights.',
      ),
  })
  .nullable()
  .describe(
    "From this side letter, identify conflict resolution provisions. Return: controlling_document_on_conflict (side_letter/main_agreement/not_stated), amendment_requirements (threshold needed to amend this side letter), survivability_on_share_transfer (true/false). Flag if the main agreement does not expressly permit side letters — this may create an issue with other investors' MFN rights. If not found, return null.",
  );

// Term Sheet Fields

export const tsValuationDealSizeSchema = z
  .object({
    pre_money_valuation: z.number().nullable(),
    investment_amount: z.number().nullable(),
    post_money_valuation: z.number().nullable(),
    currency: z.string().nullable(),
    source_clause: z.string().nullable(),
  })
  .nullable()
  .describe(
    `You are a VC analyst reviewing a term sheet. Extract the following: pre_money_valuation, investment_amount, post_money_valuation, currency. If a value is not stated, return null. Quote the exact clause where each was found in source_clause.

IMPORTANT: Confirm whether valuation is pre- or post-money — founders and investors often quote differently. Look in the opening section or 'Financing' clause for pre-money valuation, investment amount, and post-money valuation.`,
  );

export const tsInstrumentTypeSchema = z
  .object({
    instrument_type: z.string().nullable(),
    series_name: z.string().nullable(),
    share_class: z.string().nullable(),
    source_clause: z.string().nullable(),
  })
  .nullable()
  .describe(
    `From this term sheet, identify the security type being issued (e.g., Series A Preferred Stock, Common Stock, SAFE, Convertible Note). Return: instrument_type, series_name, share_class. Quote the exact clause in source_clause.

Note the series designation — it determines priority in the liquidation waterfall. Look in the 'Securities' or 'Type of Security' clause.`,
  );

export const tsLiquidationPreferenceSchema = z
  .object({
    preference_multiple: z.string().nullable(),
    participating: z.boolean().nullable(),
    participation_cap: z.number().nullable(),
    seniority_vs_prior_series: z.string().nullable(),
    source_clause: z.string().nullable(),
  })
  .nullable()
  .describe(
    `From this term sheet, extract all liquidation preference terms. Return: preference_multiple (e.g. "1x", "2x"), participating (true/false), participation_cap (amount or null), seniority_vs_prior_series. Quote the exact clause in source_clause.

Participating preferred with no cap is most investor-friendly; watch for stacked preferences across rounds. Look in the 'Liquidation Preference' clause.`,
  );

export const tsAntiDilutionSchema = z
  .object({
    anti_dilution_type: z
      .enum([
        'broad_based_weighted_average',
        'narrow_based_weighted_average',
        'full_ratchet',
        'none',
      ])
      .nullable(),
    exclusions_from_formula: z.string().nullable(),
    source_clause: z.string().nullable(),
  })
  .nullable()
  .describe(
    `Identify the anti-dilution provision in this term sheet. Return: anti_dilution_type (broad_based_weighted_average, narrow_based_weighted_average, full_ratchet, or none), exclusions_from_formula. Quote the exact clause in source_clause.

Full ratchet is rare but very punitive to founders; broad-based weighted average is market standard. Look in the 'Anti-Dilution' clause.`,
  );

export const tsInvestorRightsSchema = z
  .object({
    board_seats_granted: z.number().nullable(),
    board_observer_rights: z.boolean().nullable(),
    protective_provisions: z
      .array(z.object({ provision: z.string().nullable() }))
      .nullable(),
    information_rights: z
      .object({
        granted: z.boolean().nullable(),
        frequency: z.string().nullable(),
      })
      .nullable(),
    pro_rata_rights: z.boolean().nullable(),
    source_clauses: z
      .array(
        z.object({
          field_name: z.string().nullable(),
          source_clause: z.string().nullable(),
        }),
      )
      .nullable(),
  })
  .nullable()
  .describe(
    `From this term sheet, extract all investor rights. Return: board_seats_granted (number), board_observer_rights (true/false), protective_provisions (list each one), information_rights (granted yes/no and frequency), pro_rata_rights (true/false). For each extracted field, return a source_clauses entry as an array of objects with field_name and source_clause.
     Board composition and protective provisions are often more impactful than valuation long-term. Look in 'Board of Directors', 'Protective Provisions', 'Information Rights', and 'Pro-Rata Rights' clauses.`,
  );

export const tsFounderTermsSchema = z
  .object({
    vesting_schedule: z.string().nullable(),
    cliff_period: z.string().nullable(),
    acceleration_type: z
      .enum(['none', 'single_trigger', 'double_trigger'])
      .nullable(),
    exclusivity_period_days: z.number().nullable(),
    no_shop_applies: z.boolean().nullable(),
    source_clauses: z
      .array(
        z.object({
          field_name: z.string().nullable(),
          source_clause: z.string().nullable(),
        }),
      )
      .nullable(),
  })
  .nullable()
  .describe(
    `Extract all founder-related provisions from this term sheet. Return: vesting_schedule, cliff_period, acceleration_type (none/single_trigger/double_trigger), exclusivity_period_days, no_shop_applies (true/false). For each extracted field, return a source_clauses entry as an array of objects with field_name and source_clause.
    Flag any single-trigger acceleration — it can affect M&A negotiations significantly. Look in 'Vesting', 'Exclusivity', and 'No-Shop' clauses.`,
  );
