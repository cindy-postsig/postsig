import { z } from 'zod';

export const ctRoundStatusSchema = z
  .object({
    as_of_date: z
      .string()
      .nullable()
      .describe('As-of date for the cap table (ISO 8601)'),
    round_status: z
      .enum(['pre_money', 'post_money', 'fully_diluted'])
      .nullable()
      .describe('Basis of the cap table presentation'),
    total_authorized_shares: z
      .number()
      .nullable()
      .describe('Total authorized shares'),
    total_issued_shares: z
      .number()
      .nullable()
      .describe('Total issued and outstanding shares'),
    total_fully_diluted_shares: z
      .number()
      .nullable()
      .describe('Total fully diluted shares'),
  })
  .nullable()
  .describe(
    'Extract the round status and share totals from this Cap Table. Determine the as-of date, whether it is presented on a pre-money, post-money, or fully diluted basis, and the authorized, issued, and fully diluted share counts. If not found, return null.',
  );

export const ctShareholdersSchema = z
  .array(
    z.object({
      name: z.string().describe('Shareholder name'),
      share_class: z.string().describe('Share class held'),
      shares_held: z.number().describe('Number of shares held'),
      ownership_pct_undiluted: z
        .number()
        .nullable()
        .describe('Ownership percentage on undiluted basis'),
      ownership_pct_fully_diluted: z
        .number()
        .nullable()
        .describe('Ownership percentage on fully diluted basis'),
    }),
  )
  .nullable()
  .describe(
    'Extract the shareholder list from this Cap Table. For each shareholder, return name, share class, shares held, and ownership percentage on both undiluted and fully diluted bases. If not found, return null.',
  );

export const ctOptionPoolDetailsSchema = z
  .object({
    total_pool: z
      .number()
      .nullable()
      .describe('Total option pool size (shares)'),
    granted: z.number().nullable().describe('Number of options granted'),
    vested: z.number().nullable().describe('Number of vested options'),
    unvested: z.number().nullable().describe('Number of unvested options'),
    unallocated: z.number().nullable().describe('Remaining unallocated pool'),
    pool_pct: z
      .number()
      .nullable()
      .describe('Option pool as percentage of fully diluted shares'),
    pre_or_post_money: z
      .enum(['pre_money', 'post_money'])
      .nullable()
      .describe('Whether pool is included in pre-money or post-money'),
  })
  .nullable()
  .describe(
    'Extract option pool details from this Cap Table. Include total pool size, granted, vested, unvested, unallocated shares, pool percentage of fully diluted, and whether the pool is included in pre-money or post-money calculations. If not found, return null.',
  );

export const ctRoundHistorySchema = z
  .array(
    z.object({
      round_name: z.string().describe('Round name (e.g., "Seed", "Series A")'),
      close_date: z.string().nullable().describe('Closing date (ISO 8601)'),
      shares_issued: z
        .number()
        .nullable()
        .describe('Number of shares issued in this round'),
      price_per_share: z.number().nullable().describe('Price per share'),
      amount_raised: z.number().nullable().describe('Total amount raised'),
      pre_money_valuation: z
        .number()
        .nullable()
        .describe('Pre-money valuation'),
      post_money_valuation: z
        .number()
        .nullable()
        .describe('Post-money valuation'),
    }),
  )
  .nullable()
  .describe(
    'Extract the funding round history from this Cap Table. For each round, return round name, close date, shares issued, price per share, amount raised, and pre/post-money valuations. If not found, return null.',
  );

export const ctWaterfallAnalysisSchema = z
  .array(
    z.object({
      exit_value_multiple: z
        .string()
        .describe('Exit scenario (e.g., "1x", "3x", "10x")'),
      distributions: z
        .array(
          z.object({
            shareholder_or_class: z
              .string()
              .describe('Shareholder name or share class'),
            proceeds: z.number().nullable().describe('Proceeds received'),
            effective_ownership_pct: z
              .number()
              .nullable()
              .describe('Effective ownership at this exit scenario'),
          }),
        )
        .nullable()
        .describe('Distribution to each stakeholder at this exit value'),
    }),
  )
  .nullable()
  .describe(
    'Extract waterfall analysis from this Cap Table. For each exit scenario (1x, 3x, 10x or similar), show the distribution to each shareholder/class including proceeds and effective ownership percentage. Look in "Waterfall", "Distribution Analysis", or "Exit Scenario" sections. If not found, return null.',
  );
