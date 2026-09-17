import { z } from 'zod';

export const lotShareholderIdentitySchema = z
  .object({
    legal_name: z.string().nullable().describe('Legal name of the shareholder'),
    entity_type: z
      .string()
      .nullable()
      .describe('Entity type (individual, corporation, trust, etc.)'),
    tax_id_type: z
      .string()
      .nullable()
      .describe('Type of tax ID provided (SSN, EIN, etc.)'),
    us_person: z
      .boolean()
      .nullable()
      .describe('Whether the shareholder is a US person for tax purposes'),
    w9_or_w8: z
      .enum(['W-9', 'W-8BEN', 'W-8BEN-E', 'other'])
      .nullable()
      .describe('Which tax form is required/submitted'),
    firpta_applicable: z
      .boolean()
      .nullable()
      .describe('Whether FIRPTA withholding applies'),
    backup_withholding: z
      .boolean()
      .nullable()
      .describe('Whether the shareholder is subject to backup withholding'),
  })
  .nullable()
  .describe(
    'Extract shareholder identity and tax information from this Letter of Transmittal. Include legal name, entity type, tax ID type (do NOT extract the actual tax ID number), US person status, tax form type, FIRPTA applicability, and backup withholding status. Look in "Shareholder Information" and tax certification sections. If not found, return null.',
  );

export const lotSharesSurrenderedSchema = z
  .object({
    certificates: z
      .array(
        z.object({
          certificate_number: z.string().describe('Certificate number'),
          share_class: z.string().describe('Share class'),
          series: z.string().nullable().describe('Series designation'),
          shares_surrendered: z
            .number()
            .describe('Number of shares surrendered'),
        }),
      )
      .nullable()
      .describe('List of certificates being surrendered'),
    total_shares: z
      .number()
      .nullable()
      .describe('Total shares being surrendered across all certificates'),
    discrepancy_flag: z
      .boolean()
      .nullable()
      .describe(
        'Whether there is a discrepancy between certificate totals and stated total',
      ),
  })
  .nullable()
  .describe(
    'Extract share surrender details from this Letter of Transmittal. For each certificate, return the certificate number, share class, series, and shares surrendered. Calculate the total and flag any discrepancy between individual certificate totals and the stated total. Look in "Shares Surrendered" and certificate schedule sections. If not found, return null.',
  );

export const lotConsiderationElectionSchema = z
  .object({
    election_type: z
      .enum(['all_cash', 'all_stock', 'mixed', 'default'])
      .nullable()
      .describe('Type of consideration elected'),
    cash_amount_or_pct: z
      .string()
      .nullable()
      .describe('Cash amount or percentage elected'),
    stock_amount_or_pct: z
      .string()
      .nullable()
      .describe('Stock amount or percentage elected'),
    election_deadline: z
      .string()
      .nullable()
      .describe('Deadline for making election (ISO 8601)'),
    pro_ration_risk: z
      .boolean()
      .nullable()
      .describe('Whether elections are subject to pro-ration'),
    default_treatment: z
      .string()
      .nullable()
      .describe('Default treatment if no election is made'),
  })
  .nullable()
  .describe(
    'Extract consideration election details from this Letter of Transmittal. Determine the election type (all cash, all stock, mixed, or default), amounts/percentages, election deadline, pro-ration risk, and default treatment. Look in "Election", "Consideration", and "Payment" sections. If not found, return null.',
  );

export const lotWireInstructionsSchema = z
  .object({
    bank_name: z.string().nullable().describe('Name of the receiving bank'),
    aba_routing: z.string().nullable().describe('ABA routing number'),
    account_last_four: z
      .string()
      .nullable()
      .describe(
        'Last 4 digits of account number ONLY — do NOT extract full account number',
      ),
    account_name: z.string().nullable().describe('Name on the account'),
    swift_code: z
      .string()
      .nullable()
      .describe('SWIFT/BIC code for international wires'),
    intermediary_bank: z
      .string()
      .nullable()
      .describe('Intermediary bank if applicable'),
  })
  .nullable()
  .describe(
    'Extract wire instruction details from this Letter of Transmittal. SECURITY: Extract ONLY the last 4 digits of the account number — NEVER store or return the full account number. Include bank name, ABA routing, account name, SWIFT code, and intermediary bank. Look in "Wire Instructions" and "Payment" sections. If not found, return null.',
  );

export const lotRepresentationsSchema = z
  .object({
    items: z
      .array(
        z.object({
          name: z
            .string()
            .describe(
              'Name of the representation (e.g., "Good Title", "No Liens", "Backup Withholding Exempt", "FIRPTA Compliant", "Authorized Signatory")',
            ),
          affirmed: z
            .boolean()
            .nullable()
            .describe('Whether this representation is affirmed'),
        }),
      )
      .nullable(),
    date_signed: z
      .string()
      .nullable()
      .describe(
        'Date the Letter of Transmittal was signed, in ISO 8601 format',
      ),
  })
  .nullable()
  .describe(
    'Extract the representations checklist from this Letter of Transmittal. For each representation (good title, no liens, backup withholding, FIRPTA, authorized signatory), return whether it is affirmed. Include the date signed in ISO 8601 format. Flag any incomplete item — incomplete transmittals delay payment. Look in "Representations", "Certifications", and signature blocks. If not found, return null.',
  );
