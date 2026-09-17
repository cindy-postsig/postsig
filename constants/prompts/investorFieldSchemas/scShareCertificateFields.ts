import { z } from 'zod';

export const scIssuanceDetailsSchema = z
  .object({
    certificate_number: z.string().nullable().describe('Certificate number'),
    issue_date: z.string().nullable().describe('Date of issuance (ISO 8601)'),
    shareholder_name: z.string().nullable().describe('Name of the shareholder'),
    share_class: z
      .string()
      .nullable()
      .describe('Share class (e.g., "Common", "Series A Preferred")'),
    series: z.string().nullable().describe('Series designation if applicable'),
    number_of_shares: z
      .number()
      .nullable()
      .describe('Number of shares represented'),
  })
  .nullable()
  .describe(
    'Extract issuance details from this Share Certificate. Return the certificate number, issue date, shareholder name, share class, series, and number of shares. These are typically on the face of the certificate. If not found, return null.',
  );

export const scAuthorizedSignaturesSchema = z
  .object({
    signatory_1_name: z
      .string()
      .nullable()
      .describe('Name of first authorized signatory'),
    signatory_1_title: z
      .string()
      .nullable()
      .describe('Title of first signatory'),
    signatory_2_name: z
      .string()
      .nullable()
      .describe('Name of second authorized signatory'),
    signatory_2_title: z
      .string()
      .nullable()
      .describe('Title of second signatory'),
    date_signed: z.string().nullable().describe('Date signed (ISO 8601)'),
  })
  .nullable()
  .describe(
    'Extract authorized signature details from this Share Certificate. Return the names and titles of both signatories and the date signed. Look at the bottom of the certificate. If not found, return null.',
  );

export const scLegendsSchema = z
  .array(
    z.object({
      legend_type: z
        .string()
        .describe(
          'Type of legend (e.g., "securities act", "transfer restriction", "ROFR")',
        ),
      legend_text_summary: z.string().describe('Summary of the legend text'),
    }),
  )
  .nullable()
  .describe(
    'Extract all legends from this Share Certificate. For each legend, return its type and a summary of the text. Common legends include Securities Act restrictions, transfer restrictions, ROFR, and co-sale. Look at the back or bottom of the certificate. If not found, return null.',
  );

export const scCapTableCrossRefSchema = z
  .object({
    name_matches_cap_table: z
      .boolean()
      .nullable()
      .describe('Whether the shareholder name matches cap table records'),
    share_count_matches: z
      .boolean()
      .nullable()
      .describe('Whether the share count matches cap table records'),
    class_matches: z
      .boolean()
      .nullable()
      .describe('Whether the share class matches cap table records'),
    date_consistent: z
      .boolean()
      .nullable()
      .describe('Whether the date is consistent with cap table records'),
    cert_number_in_cap_table: z
      .boolean()
      .nullable()
      .describe('Whether the certificate number appears in cap table records'),
    discrepancy_notes: z
      .string()
      .nullable()
      .describe('Description of any discrepancies found'),
  })
  .nullable()
  .describe(
    'Cross-reference this Share Certificate against cap table data if available in the document. Check if the shareholder name, share count, class, date, and certificate number are consistent. Note any discrepancies. If no cross-reference data is available, return null.',
  );
