import { z } from 'zod';

export const atTransferDetailsSchema = z
  .object({
    source_fund: z
      .string()
      .nullable()
      .describe('Full legal name of the fund transferring the position'),
    destination_fund: z
      .string()
      .nullable()
      .describe(
        'Full legal name of the fund receiving the transferred position',
      ),
    instrument: z
      .string()
      .nullable()
      .describe(
        'Instrument or stage being transferred (e.g., "Series A Preferred", "Common Stock", "SAFE")',
      ),
    quantity: z
      .number()
      .nullable()
      .describe('Number of shares or units being transferred'),
    transfer_date: z
      .string()
      .nullable()
      .describe(
        'Effective date of the transfer (ISO 8601 format, e.g., 2024-03-15)',
      ),
  })
  .nullable()
  .describe(
    'Extract transfer details from this Affiliate Transfer document. Identify the source fund transferring the position, the destination fund receiving it, the instrument or share class being transferred, the quantity of shares or units, and the effective transfer date. Look in the recitals, definitions, and transfer/assignment sections. If not found, return null.',
  );
