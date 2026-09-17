import { z } from 'zod';

export const iaDealEconomicsSchema = z
  .object({
    jurisdiction: z
      .string()
      .nullable()
      .describe(
        'Governing jurisdiction (e.g., "England and Wales", "Delaware")',
      ),
    investment_amount: z
      .number()
      .nullable()
      .describe('Total investment amount'),
    share_class: z.string().nullable().describe('Share class being purchased'),
    price_per_share: z.number().nullable().describe('Price per share'),
    pre_money_valuation: z.number().nullable().describe('Pre-money valuation'),
    post_money_valuation: z
      .number()
      .nullable()
      .describe('Post-money valuation'),
    completion_date: z
      .string()
      .nullable()
      .describe('Completion/closing date (ISO 8601)'),
    conditions_to_completion: z
      .array(z.string())
      .nullable()
      .describe('Conditions precedent to completion'),
  })
  .nullable()
  .describe(
    'Extract deal economics from this Investment Agreement. Note: UK/EU-style agreements use "completion" instead of "closing." Include jurisdiction, investment amount, share class, price per share, pre/post-money valuations, completion date, and conditions. Look in "Investment", "Consideration", and "Completion" sections. If not found, return null.',
  );

export const iaWarrantiesDisclosureSchema = z
  .array(
    z.object({
      warranty_title: z.string().describe('Title of the warranty'),
      materiality_qualifier: z
        .boolean()
        .describe('Whether the warranty has a materiality qualifier'),
      knowledge_qualifier: z
        .boolean()
        .describe('Whether the warranty has a knowledge qualifier'),
      disclosed_in_disclosure_letter: z
        .boolean()
        .nullable()
        .describe(
          'Whether matters are disclosed against this warranty in the disclosure letter',
        ),
    }),
  )
  .nullable()
  .describe(
    'Extract warranties and disclosure information from this Investment Agreement. For each warranty, return the title, whether it has materiality or knowledge qualifiers, and whether matters are disclosed against it in the disclosure letter. UK/EU-style agreements use "warranties" rather than "representations and warranties." Look in "Warranties" and "Disclosure Letter" sections. If not found, return null.',
  );

export const iaGovernanceProvisionsSchema = z
  .object({
    investor_board_seats: z
      .number()
      .nullable()
      .describe('Number of board seats for investors'),
    total_board_size: z.number().nullable().describe('Total board size'),
    drag_along_threshold: z
      .string()
      .nullable()
      .describe('Drag-along threshold'),
    tag_along_rights: z
      .boolean()
      .nullable()
      .describe('Whether tag-along rights exist'),
    reserved_matters: z
      .array(
        z.object({
          matter: z.string().describe('Description of the reserved matter'),
          category: z
            .enum(['corporate', 'financial', 'equity', 'operational', 'other'])
            .describe('Category of the reserved matter'),
          consent_threshold: z
            .string()
            .nullable()
            .describe('Consent threshold required'),
        }),
      )
      .nullable()
      .describe(
        'Reserved matters requiring investor consent. UK/EU agreements often have longer lists than US protective provisions.',
      ),
  })
  .nullable()
  .describe(
    'Extract governance provisions from this Investment Agreement. Cover investor board seats, total board size, drag-along threshold, tag-along rights, and reserved matters (each with description, category, and consent threshold). UK/EU agreements often have longer reserved matters lists than US protective provisions. Look in "Board", "Governance", and "Reserved Matters" sections. If not found, return null.',
  );

export const iaInvestorProtectionsSchema = z
  .object({
    anti_dilution_type: z
      .string()
      .nullable()
      .describe('Anti-dilution protection type'),
    pre_emption_rights: z
      .boolean()
      .nullable()
      .describe('Whether pre-emption rights exist'),
    pre_emption_notice_period: z
      .string()
      .nullable()
      .describe('Notice period for pre-emption'),
    drag_along_threshold: z
      .string()
      .nullable()
      .describe('Drag-along trigger threshold'),
    tag_along_rights: z
      .boolean()
      .nullable()
      .describe('Whether tag-along rights exist'),
    exit_provisions: z
      .string()
      .nullable()
      .describe('Forced exit or liquidity provisions'),
    leaver_provisions: z
      .object({
        good_leaver: z.string().nullable().describe('Good leaver treatment'),
        bad_leaver: z.string().nullable().describe('Bad leaver treatment'),
      })
      .nullable()
      .describe('Leaver provisions for founder/employee shareholders'),
  })
  .nullable()
  .describe(
    'Extract investor protections from this Investment Agreement. Cover anti-dilution, pre-emption rights and notice period, drag-along and tag-along, exit provisions, and leaver provisions (good vs bad leaver). Leaver provisions are common in UK/EU deals. Look in "Investor Protections", "Pre-emption", and "Leaver" sections. If not found, return null.',
  );

export const iaWarrantyLimitationsSchema = z
  .object({
    warranty_cap: z
      .number()
      .nullable()
      .describe('Maximum liability cap for warranty claims'),
    cap_as_pct_of_investment: z
      .number()
      .nullable()
      .describe('Cap as percentage of investment amount'),
    basket_type: z
      .enum(['deductible', 'first_dollar', 'tipping'])
      .nullable()
      .describe('Basket type'),
    basket_amount: z.number().nullable().describe('Basket/threshold amount'),
    survival_period: z
      .string()
      .nullable()
      .describe('Survival period for warranty claims'),
    fundamental_warranties_period: z
      .string()
      .nullable()
      .describe('Extended period for fundamental warranties'),
    tax_warranty_period: z
      .string()
      .nullable()
      .describe('Period for tax warranty claims'),
    fraud_carve_out: z
      .boolean()
      .nullable()
      .describe('Whether fraud is carved out from limitations'),
  })
  .nullable()
  .describe(
    'Extract warranty limitation provisions from this Investment Agreement. Cover the cap (amount and percentage), basket type and amount, survival periods (general, fundamental, tax), and fraud carve-out. Look in "Limitations on Liability", "Warranty Claims", and "Indemnification" sections. If not found, return null.',
  );

export const amdOriginalDocumentSchema = z
  .object({
    original_document_name: z
      .string()
      .nullable()
      .describe('Name of the original document being amended'),
    original_document_date: z
      .string()
      .nullable()
      .describe('Date of the original document (ISO 8601)'),
    original_parties: z
      .array(z.string())
      .nullable()
      .describe('Parties to the original document'),
    amendment_number: z
      .string()
      .nullable()
      .describe('Amendment number (e.g., "First", "Second", "Third")'),
    effective_date: z
      .string()
      .nullable()
      .describe('Effective date of this amendment (ISO 8601)'),
    amendment_type: z
      .enum(['amendment', 'amendment_and_restatement', 'waiver', 'consent'])
      .nullable()
      .describe('Type of modification'),
  })
  .nullable()
  .describe(
    'Identify the original document being amended. Extract the original document name, date, parties, amendment number, effective date, and type (amendment, amendment and restatement, waiver, or consent). Look in the Preamble and Recitals. If not found, return null.',
  );

export const amdChangedProvisionsSchema = z
  .array(
    z.object({
      section_reference: z.string().describe('Section reference being amended'),
      change_type: z
        .enum(['addition', 'deletion', 'modification', 'replacement'])
        .describe('Type of change'),
      original_language: z
        .string()
        .nullable()
        .describe('Original provision language (summarized)'),
      amended_language: z
        .string()
        .nullable()
        .describe('Amended provision language (summarized)'),
      effective_date: z
        .string()
        .nullable()
        .describe('Effective date if different from amendment date (ISO 8601)'),
    }),
  )
  .nullable()
  .describe(
    'Extract all changed provisions from this Amendment. For each change, return the section reference, change type (addition, deletion, modification, replacement), summary of original and amended language, and effective date if different from the amendment date. If not found, return null.',
  );

export const amdConsentThresholdSchema = z
  .object({
    required_threshold: z
      .string()
      .nullable()
      .describe('Required consent threshold (e.g., "majority of Preferred")'),
    consenting_parties: z
      .array(z.string())
      .nullable()
      .describe('List of parties who have consented'),
    shares_voting: z
      .number()
      .nullable()
      .describe('Number of shares voting in favor'),
    shares_outstanding: z
      .number()
      .nullable()
      .describe('Total shares outstanding for this class'),
    pct_achieved: z
      .number()
      .nullable()
      .describe('Percentage of consent achieved'),
    threshold_met: z
      .boolean()
      .nullable()
      .describe('Whether the required threshold is met'),
  })
  .nullable()
  .describe(
    'Extract consent/threshold information from this Amendment. Return the required threshold, consenting parties, shares voting and outstanding, percentage achieved, and whether the threshold is met. Look in "Consent", "Recitals", and attached consent forms. If not found, return null.',
  );

export const amdEconomicImpactSchema = z
  .array(
    z.object({
      term_changed: z.string().describe('The economic term that changed'),
      value_before: z
        .string()
        .nullable()
        .describe('Value before the amendment'),
      value_after: z.string().nullable().describe('Value after the amendment'),
      directional_impact: z
        .enum(['investor_favorable', 'company_favorable', 'neutral'])
        .nullable()
        .describe('Directional impact of the change'),
      cap_table_impact: z
        .string()
        .nullable()
        .describe('Description of impact on cap table if any'),
    }),
  )
  .nullable()
  .describe(
    'Analyze the economic impact of this Amendment. For each changed economic term, return the term, before/after values, directional impact (investor-favorable, company-favorable, or neutral), and any cap table impact. If no economic terms are changed, return null.',
  );

export const amdRelatedAmendmentsSchema = z
  .object({
    referenced_documents: z
      .array(z.string())
      .nullable()
      .describe('Other documents referenced in this amendment'),
    confirmed_amended: z
      .array(z.string())
      .nullable()
      .describe('Documents confirmed as also being amended'),
    should_have_been_amended: z
      .array(z.string())
      .nullable()
      .describe(
        'Documents that should have been amended but were not (risk flag)',
      ),
  })
  .nullable()
  .describe(
    'Identify related amendments from this Amendment document. List referenced documents, documents confirmed as also being amended, and flag any documents that logically should have been amended simultaneously but were not (e.g., an IRA amendment without a corresponding voting agreement amendment). If not found, return null.',
  );

export const jndUnderlyingAgreementSchema = z
  .object({
    joining_party_legal_name: z
      .string()
      .nullable()
      .describe('Legal name of the joining party'),
    joining_party_entity_type: z
      .string()
      .nullable()
      .describe('Entity type of the joining party'),
    joining_party_jurisdiction: z
      .string()
      .nullable()
      .describe('Jurisdiction of the joining party'),
    underlying_agreement_name: z
      .string()
      .nullable()
      .describe('Name of the agreement being joined'),
    underlying_agreement_date: z
      .string()
      .nullable()
      .describe('Date of the underlying agreement (ISO 8601)'),
    original_parties: z
      .array(z.string())
      .nullable()
      .describe('Original parties to the underlying agreement'),
    effective_date: z
      .string()
      .nullable()
      .describe('Effective date of the joinder (ISO 8601)'),
  })
  .nullable()
  .describe(
    'Extract the underlying agreement details from this Joinder. Identify the joining party (name, entity type, jurisdiction), the agreement being joined (name, date, original parties), and the effective date. Look in the Preamble and Recitals. If not found, return null.',
  );

export const jndScopeObligationsSchema = z
  .object({
    full_agreement: z
      .boolean()
      .nullable()
      .describe('Whether the joining party is bound by the full agreement'),
    specific_sections: z
      .array(z.string())
      .nullable()
      .describe(
        'Specific sections the joinder applies to if not the full agreement',
      ),
    rights_granted: z
      .array(z.string())
      .nullable()
      .describe('Rights granted to the joining party'),
    obligations_imposed: z
      .array(z.string())
      .nullable()
      .describe('Obligations imposed on the joining party'),
    asymmetry_flag: z
      .boolean()
      .nullable()
      .describe(
        'Whether the joinder creates asymmetric rights/obligations vs existing parties',
      ),
  })
  .nullable()
  .describe(
    'Extract the scope of obligations from this Joinder. Determine whether the joining party is bound by the full agreement or specific sections, list the rights granted and obligations imposed, and flag any asymmetry with existing parties. If not found, return null.',
  );

export const jndJoiningCapacitySchema = z
  .object({
    capacity_term: z
      .string()
      .nullable()
      .describe(
        'The quoted capacity term from the document (e.g., "Investor", "Key Holder", "Stockholder")',
      ),
    associated_rights: z
      .array(z.string())
      .nullable()
      .describe('Rights associated with this capacity'),
    associated_obligations: z
      .array(z.string())
      .nullable()
      .describe('Obligations associated with this capacity'),
    ambiguity_flag: z
      .boolean()
      .nullable()
      .describe('Whether the capacity designation is ambiguous'),
  })
  .nullable()
  .describe(
    'Extract the joining capacity from this Joinder. Return the exact capacity term used (e.g., "Investor", "Key Holder"), associated rights and obligations for that capacity, and flag any ambiguity in the designation. Look in the operative sections where the party agrees to be bound. If not found, return null.',
  );

export const jndTriggerContextSchema = z
  .object({
    trigger_type: z
      .enum([
        'share_purchase',
        'share_transfer',
        'new_issuance',
        'requirement_of_agreement',
        'other',
      ])
      .nullable()
      .describe('What triggered the joinder'),
    related_transaction_document: z
      .string()
      .nullable()
      .describe('Related transaction document (e.g., SPA reference)'),
    shares_acquired: z
      .number()
      .nullable()
      .describe('Number of shares acquired in the triggering transaction'),
    consideration: z
      .number()
      .nullable()
      .describe('Consideration for the triggering transaction'),
  })
  .nullable()
  .describe(
    'Extract the trigger context for this Joinder. Determine what triggered the joinder (share purchase, transfer, new issuance, contractual requirement), identify the related transaction document, and extract the shares and consideration involved. Look in the Recitals and "WHEREAS" clauses. If not found, return null.',
  );

export const jndAuthorizationSchema = z
  .object({
    joining_party_signatory_name: z
      .string()
      .nullable()
      .describe('Name of the joining party signatory'),
    joining_party_signatory_title: z
      .string()
      .nullable()
      .describe('Title of the joining party signatory'),
    joining_party_signatory_date: z
      .string()
      .nullable()
      .describe('Date signed by joining party (ISO 8601)'),
    countersignature_required: z
      .boolean()
      .nullable()
      .describe('Whether a company countersignature is required'),
    countersignature_present: z
      .boolean()
      .nullable()
      .describe('Whether the countersignature is present'),
    company_signatory: z
      .string()
      .nullable()
      .describe('Name and title of company signatory'),
    date_consistency: z
      .boolean()
      .nullable()
      .describe('Whether all dates are consistent'),
  })
  .nullable()
  .describe(
    'Extract authorization details from this Joinder. Return the joining party signatory (name, title, date), whether countersignature is required and present, company signatory, and whether dates are consistent. Look in signature blocks. If not found, return null.',
  );
