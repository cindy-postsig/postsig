import { z } from 'zod';

export const spTransactionEconomicsSchema = z
  .array(
    z.object({
      seller: z.string().describe('Name of the selling shareholder'),
      buyer: z.string().describe('Name of the buyer'),
      share_class: z.string().nullable().describe('Class of shares being sold'),
      shares: z.number().nullable().describe('Number of shares being sold'),
      price_per_share: z.number().nullable().describe('Price per share'),
      total_consideration: z
        .number()
        .nullable()
        .describe('Total purchase price'),
      closing_date: z.string().describe('Closing date (ISO 8601)'),
      instrument_type: z
        .enum(['shares', 'safe', 'convertible_note', 'warrant', 'option'])
        .describe(
          'Type of instrument being transferred: shares, safe, convertible_note, warrant, or option',
        ),
      instrument_reference: z
        .string()
        .nullable()
        .describe(
          'Reference description of the instrument (e.g., "SAFE dated 2024-01-15", "Series A Convertible Note")',
        ),
      instrument_issue_date: z
        .string()
        .nullable()
        .describe('Issue date of the underlying instrument (ISO 8601)'),
      principal_amount: z
        .number()
        .nonnegative()
        .nullable()
        .describe('Principal amount of the instrument for convertibles/SAFEs'),
    }),
  )
  .nullable()
  .describe(
    'Extract transaction economics from this Secondary Purchase Agreement. Identify the seller, buyer, share class, number of shares, price per share, total consideration, closing date, and instrument details (type, reference, issue date, principal amount). Supports non-share instruments such as SAFEs, convertible notes, warrants, and options. Look in the Preamble, Recitals, and "Purchase and Sale" sections. If not found, return null.',
  );

export const spRofrWaiverSchema = z
  .object({
    waiver_obtained: z
      .boolean()
      .nullable()
      .describe('Whether ROFR waiver has been obtained'),
    from_company: z
      .boolean()
      .nullable()
      .describe('Whether company waived its ROFR'),
    from_investors: z
      .array(z.string())
      .nullable()
      .describe('List of investors who waived ROFR'),
    attached_as_exhibit: z
      .boolean()
      .nullable()
      .describe('Whether waiver is attached as exhibit'),
    co_sale_waived: z
      .boolean()
      .nullable()
      .describe('Whether co-sale rights are also waived'),
    board_consent: z
      .boolean()
      .nullable()
      .describe('Whether board consent was obtained'),
  })
  .nullable()
  .describe(
    'Extract ROFR waiver details from this Secondary Purchase Agreement. Determine if waivers were obtained from the company and investors, whether they are attached as exhibits, whether co-sale rights are also waived, and whether board consent was obtained. Look in "Waivers", "Consents", and "Conditions" sections. If not found, return null.',
  );

export const spSellerRepresentationsSchema = z
  .array(
    z.object({
      description: z.string().describe('Description of the representation'),
      materiality_qualifier: z
        .boolean()
        .describe('Whether the rep has a materiality qualifier'),
      knowledge_qualifier: z
        .boolean()
        .describe('Whether the rep has a knowledge qualifier'),
    }),
  )
  .nullable()
  .describe(
    'Extract seller representations from this Secondary Purchase Agreement. For each representation, return its description and whether it has materiality or knowledge qualifiers. Pay attention to title, ownership, authority, and no-encumbrance reps. Look in "Seller Representations" section. If not found, return null.',
  );

export const spBuyerRepresentationsSchema = z
  .object({
    accredited_investor: z
      .boolean()
      .nullable()
      .describe('Whether buyer represents as accredited investor'),
    accreditation_basis: z
      .string()
      .nullable()
      .describe('Basis for accredited investor status'),
    investment_intent: z
      .boolean()
      .nullable()
      .describe('Whether buyer represents investment intent (not for resale)'),
    access_to_information: z
      .boolean()
      .nullable()
      .describe('Whether buyer had access to information about the company'),
    no_public_market: z
      .boolean()
      .nullable()
      .describe('Whether buyer acknowledges no public market for shares'),
    non_us_person: z
      .boolean()
      .nullable()
      .describe('Whether buyer represents as non-US person'),
  })
  .nullable()
  .describe(
    'Extract buyer representations from this Secondary Purchase Agreement. Cover accredited investor status and basis, investment intent, access to information, acknowledgement of no public market, and non-US person status. Look in "Buyer Representations" and "Purchaser Representations" sections. If not found, return null.',
  );

export const spPostClosingSchema = z
  .object({
    cap_table_update_party: z
      .string()
      .nullable()
      .describe('Who is responsible for updating the cap table'),
    update_timeline: z
      .string()
      .nullable()
      .describe('Timeline for cap table update'),
    new_certificate_issued: z
      .boolean()
      .nullable()
      .describe('Whether a new share certificate will be issued'),
    transfer_agent_notification: z
      .boolean()
      .nullable()
      .describe('Whether transfer agent must be notified'),
    legends_required: z
      .array(z.string())
      .nullable()
      .describe('Required legends on new certificates'),
    stock_ledger_update: z
      .boolean()
      .nullable()
      .describe('Whether stock ledger update is required'),
  })
  .nullable()
  .describe(
    'Extract post-closing obligations from this Secondary Purchase Agreement. Cover cap table update responsibility and timeline, new certificate issuance, transfer agent notification, required legends, and stock ledger updates. Look in "Post-Closing", "Further Assurances", and "Conditions" sections. If not found, return null.',
  );
