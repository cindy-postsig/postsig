import { z } from 'zod';

export const soiMetadataSchema = z
  .object({
    fund_name: z.string().nullable().describe('Fund name'),
    as_of_date: z.string().nullable().describe('Reporting date (ISO 8601)'),
    currency: z.string().nullable().describe('Reporting currency'),
    audited: z
      .boolean()
      .nullable()
      .describe('Whether the schedule is from audited financials'),
    portfolio_count: z
      .number()
      .nullable()
      .describe('Total number of portfolio companies'),
    realized_count: z
      .number()
      .nullable()
      .describe('Number of fully realized/exited investments'),
    active_count: z
      .number()
      .nullable()
      .describe('Number of active investments'),
  })
  .nullable()
  .describe(
    'Extract metadata from this Schedule of Investments. Include fund name, as-of date, currency, whether audited, and counts of total, realized, and active portfolio companies. Look in headers, footnotes, and title sections. If not found, return null.',
  );

export const soiCostFairValueSchema = z
  .object({
    positions: z
      .array(
        z.object({
          company_name: z.string().describe('Portfolio company name'),
          instrument_type: z
            .string()
            .nullable()
            .describe(
              'Type of instrument (e.g., "Series A Preferred", "SAFE", "Convertible Note")',
            ),
          cost: z.number().nullable().describe('Cost basis'),
          fair_value: z.number().nullable().describe('Current fair value'),
          unrealized_gain_loss: z
            .number()
            .nullable()
            .describe('Unrealized gain or loss'),
        }),
      )
      .nullable()
      .describe('Per-company cost and fair value positions'),
    total_cost: z.number().nullable().describe('Total portfolio cost'),
    total_fair_value: z
      .number()
      .nullable()
      .describe('Total portfolio fair value'),
  })
  .nullable()
  .describe(
    'Extract cost and fair value data from this Schedule of Investments. For each portfolio company, return the company name, instrument type, cost basis, fair value, and unrealized gain/loss. Also extract portfolio totals. If not found, return null.',
  );

export const soiInstrumentDetailsSchema = z
  .array(
    z.object({
      company_name: z.string().describe('Portfolio company name'),
      instrument_type: z.string().describe('Type of instrument'),
      series: z.string().nullable().describe('Series designation'),
      shares_or_units: z
        .number()
        .nullable()
        .describe('Number of shares or units held'),
      principal: z
        .number()
        .nullable()
        .describe('Principal amount for debt instruments'),
      conversion_price: z
        .number()
        .nullable()
        .describe('Conversion price if applicable'),
    }),
  )
  .nullable()
  .describe(
    'Extract instrument-level details from this Schedule of Investments. For each position, return company name, instrument type, series, shares/units, principal (for debt), and conversion price. Look in the detailed schedule and footnotes. If not found, return null.',
  );

export const soiValuationMethodologySchema = z
  .array(
    z.object({
      company_name: z.string().describe('Portfolio company name'),
      methodology: z
        .string()
        .describe(
          'Valuation methodology used (e.g., "recent transaction", "market comparables", "discounted cash flow")',
        ),
      asc820_level: z
        .enum(['Level 1', 'Level 2', 'Level 3'])
        .nullable()
        .describe('ASC 820 fair value hierarchy level'),
      key_assumptions: z
        .string()
        .nullable()
        .describe('Key assumptions used in valuation'),
      independent_valuation: z
        .boolean()
        .nullable()
        .describe('Whether an independent valuation was obtained'),
    }),
  )
  .nullable()
  .describe(
    'Extract valuation methodology from this Schedule of Investments. For each position, return the methodology, ASC 820 level, key assumptions, and whether an independent valuation was obtained. Look in valuation footnotes and accounting policy notes. If not found, return null.',
  );

export const soiFundAggregatesSchema = z
  .object({
    total_cost: z
      .number()
      .nullable()
      .describe('Total invested capital (cost basis)'),
    total_fair_value: z
      .number()
      .nullable()
      .describe('Total current fair value'),
    tvpi: z
      .number()
      .nullable()
      .describe('Total Value to Paid-In multiple (TVPI)'),
    dpi: z
      .number()
      .nullable()
      .describe('Distributions to Paid-In multiple (DPI)'),
    rvpi: z
      .number()
      .nullable()
      .describe('Residual Value to Paid-In multiple (RVPI)'),
    top_5_concentration_pct: z
      .number()
      .nullable()
      .describe('Percentage of portfolio in top 5 holdings'),
    zero_value_count: z
      .number()
      .nullable()
      .describe('Number of positions marked at zero value'),
  })
  .nullable()
  .describe(
    'Extract fund-level aggregate metrics from this Schedule of Investments. Include total cost, total fair value, TVPI, DPI, RVPI, top-5 concentration percentage, and count of zero-value positions. Look in summary tables and performance sections. If not found, return null.',
  );

export const soiExitsSchema = z
  .object({
    exits: z
      .array(
        z.object({
          company_name: z.string().describe('Portfolio company name'),
          exit_date: z.string().nullable().describe('Exit date (ISO 8601)'),
          exit_type: z
            .string()
            .nullable()
            .describe(
              'Type of exit (e.g., "M&A", "IPO", "secondary sale", "write-off")',
            ),
          cost: z.number().nullable().describe('Original cost basis'),
          proceeds: z.number().nullable().describe('Total proceeds received'),
          gain_loss: z.number().nullable().describe('Realized gain or loss'),
          moic: z.number().nullable().describe('Multiple on invested capital'),
        }),
      )
      .nullable()
      .describe('List of realized exits'),
    aggregate_irr: z
      .number()
      .nullable()
      .describe('Aggregate IRR on realized exits if stated'),
  })
  .nullable()
  .describe(
    'Extract realized exit data from this Schedule of Investments. For each exit, return company name, date, type, cost, proceeds, gain/loss, and MOIC. Also extract aggregate IRR on realized exits if available. Look in "Realized Investments" and exit summary sections. If not found, return null.',
  );
