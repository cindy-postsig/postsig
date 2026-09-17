import { z } from 'zod';

// Ownership & Share Fields
export const percentOfIssuedSharesViaConversionSchema = z
  .number()
  .nullable()
  .describe(
    "Extract '% of Issued Shares via Conversion' from this document. If it is not explicitly stated, return null.",
  );

export const percentOfPreferredSharesHeldSchema = z
  .number()
  .nullable()
  .describe(
    "Extract '% of Preferred Shares Held' from this document. If it is not explicitly stated, return null.",
  );

export const sharesSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Shares' from this document. If it is not explicitly stated, return null.",
  );

export const sharesConvertedSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Shares Converted' from this document. If it is not explicitly stated, return null.",
  );

export const sharesHeldSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Shares Held' from this document. If it is not explicitly stated, return null. Use this definition: Computed/aggregated (not a single clause).",
  );

export const sharesHeldAsFullyDilutedPercentSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Shares Held as Fully-diluted %' from this document. If it is not explicitly stated, return null.",
  );

export const sharesPurchasedSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Shares Purchased' from this document. If it is not explicitly stated, return null.",
  );

export const mySharesSchema = (
  investorNames: string[] | null,
  investorFunds: string[] | null,
) =>
  z
    .number()
    .nullable()
    .describe(
      `Extract 'My Shares' from this document. "My" refers to the following investor(s): ${JSON.stringify(investorNames ?? [])} and fund(s): ${JSON.stringify(investorFunds ?? [])}. If it is not explicitly stated, return null.`,
    );

export const myWarrantSharesSchema = (
  investorNames: string[] | null,
  investorFunds: string[] | null,
) =>
  z
    .number()
    .nullable()
    .describe(
      `Extract 'My Warrant Shares' from this document. "My" refers to the following investor(s): ${JSON.stringify(investorNames ?? [])} and fund(s): ${JSON.stringify(investorFunds ?? [])}. If it is not explicitly stated, return null. Use this definition: Requires warrant doc (not in the 7-doc set).`,
    );

export const totalSharesSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Total Shares' from this document. If it is not explicitly stated, return null.",
  );

export const warrantsOutstandingSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Warrants' from this document. If it is not explicitly stated, return null.",
  );

export const optionsOutsideOfPoolOutstandingSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Options Outside of Pool Outstanding' from this document. If it is not explicitly stated, return null.",
  );

export const outstandingAndReservedOptionsSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Outstanding and Reserved Options' from this document. If it is not explicitly stated, return null.",
  );

export const commonStockSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Common Stock' from this document. If it is not explicitly stated, return null.",
  );

export const preferredStockAllClassesSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Preferred Stock (All Classes)' from this document. If it is not explicitly stated, return null.",
  );

export const fullyDilutedSharesSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Fully Diluted Shares' from this document. If it is not explicitly stated, return null.",
  );

export const optionPoolReservedSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Option Pool Reserved' from this document. If it is not explicitly stated, return null.",
  );

// Valuation & Financials
export const aggLiqPrefSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Agg. Liq Pref' from this document. If it is not explicitly stated, return null.",
  );

export const aggregateCostSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Aggregate Cost' from this document. If it is not explicitly stated, return null.",
  );

export const myAggregateCostSchema = (
  investorNames: string[] | null,
  investorFunds: string[] | null,
) =>
  z
    .number()
    .nullable()
    .describe(
      `Extract 'My Aggregate Cost (My Cost)' from this document. "My" refers to the following investor(s): ${JSON.stringify(investorNames ?? [])} and fund(s): ${JSON.stringify(investorFunds ?? [])}. If it is not explicitly stated, return null.`,
    );

export const myTotalAggregateCostSchema = (
  investorNames: string[] | null,
  investorFunds: string[] | null,
) =>
  z
    .number()
    .nullable()
    .describe(
      `Extract 'My Total Aggregate Cost' from this document. "My" refers to the following investor(s): ${JSON.stringify(investorNames ?? [])} and fund(s): ${JSON.stringify(investorFunds ?? [])}. If it is not explicitly stated, return null.`,
    );

export const conversionRatioSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Conversion Ratio' from this document. If it is not explicitly stated, return null.",
  );

export const convertingIntoEquityClassSchema = z
  .string()
  .nullable()
  .describe(
    "Extract 'Converting Into Equity Class' from this document. If it is not explicitly stated, return null.",
  );

export const currentPricePerUnitSchema = z
  .number()
  .describe(
    "From this Stock Purchase Agreement, extract 'current Price Per Unit' value. If not found, return null.",
  );

export const discountSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Discount' from this document. If it is not explicitly stated, return null.",
  );

export const effectivePricePerShareSchema = z
  .number()
  .describe(
    "Extract 'Effective Price Per Share' from this document. If it is not explicitly stated, return null.",
  );

export const equityClassSchema = z
  .string()
  .describe(
    "Extract 'Equity Class' from this document. If it is not explicitly stated, return null.",
  );

export const equityFinancingNewMoneySchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Equity Financing New Money' from this document. If it is not explicitly stated, return null.",
  );

export const highestNewMoneyPricePerShareSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Highest New Money Price Per Share' from this document. If it is not explicitly stated, return null.",
  );

export const multiplierSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Multiplier' from this document. If it is not explicitly stated, return null.",
  );

export const preMoneyValuationSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Pre Money Valuation' from this document. If it is not explicitly stated, return null.",
  );

export const postMoneyAtEntrySchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Post Money at Entry' from this document. If it is not explicitly stated, return null.",
  );

export const latestPostMoneyValuationSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Latest Post Money Valuation' from this document. If it is not explicitly stated, return null.",
  );

export const totalAggregateLiqPrefSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Total Aggregate Liq Pref' from this document. If it is not explicitly stated, return null.",
  );

export const totalLiquidationPreferenceSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Total Liquidation Preference' from this document. If it is not explicitly stated, return null.",
  );

export const totalNewMoneySchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Total New Money' from this document. If it is not explicitly stated, return null.",
  );

export const totalNewMoneyInvestedSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Total New Money Invested' from this document. If it is not explicitly stated, return null.",
  );

export const totalNewMoneySharesSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Total New Money Shares' from this document. If it is not explicitly stated, return null.",
  );

export const valuationCapSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Valuation Cap' from this document. If it is not explicitly stated, return null.",
  );

// Legal & Governance
export const auditedFinancialStatementsSchema = z
  .boolean()
  .nullable()
  .describe(
    "Extract 'Audited Financial Statements' from this document. If it is not explicitly stated, return null.",
  );

export const balanceSheetSchema = z
  .boolean()
  .nullable()
  .describe(
    "Extract 'Balance Sheet' from this document. If it is not explicitly stated, return null.",
  );

export const milestoneClosingsSchema = z
  .boolean()
  .nullable()
  .describe(
    "Extract 'Milestone Closings' from this document. If it is not explicitly stated, return null.",
  );

export const requiredClosingPaymentsSchema = z
  .boolean()
  .nullable()
  .describe(
    "Extract 'Required Closing Payments' from this document. If it is not explicitly stated, return null.",
  );

export const issuerPaysInvestorCounselFeesSchema = z
  .boolean()
  .nullable()
  .describe(
    "Extract 'Issuer Pays Investor Counsel Fees' from this document. If it is not explicitly stated, return null.",
  );

export const capitalizationTableSchema = z
  .boolean()
  .nullable()
  .describe(
    "Extract 'Capitalization Table' from this document. If it is not explicitly stated, return null.",
  );

export const coInvestorSchema = z
  .string()
  .nullable()
  .describe(
    "Extract 'Co-Investor' from this document. If it is not explicitly stated, return null.",
  );

export const corporateJurisdictionSchema = z
  .string()
  .nullable()
  .describe(
    "Extract 'Corporate Jurisdiction' from this document. If it is not explicitly stated, return null.",
  );

export const informationRightsSchema = z
  .boolean()
  .nullable()
  .describe(
    "Extract 'Information Rights' from this document. If it is not explicitly stated, return null.",
  );

export const initialClosingSchema = z
  .string()
  .nullable()
  .describe(
    "Extract 'Initial Closing' from this document. If it is not explicitly stated, return null.",
  );

export const investorFieldSchema = z
  .string()
  .nullable()
  .describe(
    "Extract 'Investor' from this document. If it is not explicitly stated, return null.",
  );

export const leadInvestorSchema = z
  .string()
  .nullable()
  .describe(
    "Extract 'Lead Investor' from this document. If it is not explicitly stated, return null.",
  );

export const majorInvestorStatusSchema = z
  .boolean()
  .nullable()
  .describe(
    "Extract 'Major Investor' from this document. If it is not explicitly stated, return null.",
  );

export const majorInvestorByThresholdSchema = z
  .boolean()
  .nullable()
  .describe(
    "Extract 'Major Investor By Threshold' from this document. If it is not explicitly stated, return null.",
  );

export const majorInvestorThresholdAmountSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Major Investor Threshold Amount' from this document. If it is not explicitly stated, return null.",
  );

export const majorInvestorThresholdPercentSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Major Investor Threshold Ownership Percent' from this document. If it is not explicitly stated, return null.",
  );

export const majorInvestorThresholdSharesSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Major Investor Threshold Shares' from this document. If it is not explicitly stated, return null.",
  );

export const investorCounselFeeCapSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Investor Counsel Fee Cap' from this document. If it is not explicitly stated, return null.",
  );

export const majorInvestorThresholdSideLetterSchema = z
  .string()
  .nullable()
  .describe(
    "Search for side letter / management rights language related to 'Major Investor Threshold: Side Letter / Management Rights Letter'. If not present, return null and note it is typically documented in a side letter/MRL.",
  );

export const namedMajorInvestorsSchema = z
  .string()
  .nullable()
  .describe(
    "Extract 'Named Major Investor' from this document. If it is not explicitly stated, return null.",
  );

export const participatingSchema = z
  .boolean()
  .nullable()
  .describe(
    "Extract 'Participating' from this document. If it is not explicitly stated, return null.",
  );

export const preferenceOrderSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Preference Order' from this document. If it is not explicitly stated, return null.",
  );

export const qsbsCovenantGivenSchema = z
  .boolean()
  .nullable()
  .describe(
    "Extract 'QSBS Covenant Given' from this document. If it is not explicitly stated, return null.",
  );

export const qsbsRepMadeSchema = z
  .boolean()
  .nullable()
  .describe(
    "Extract 'QSBS Rep Made' from this document. If it is not explicitly stated, return null.",
  );

export const stateOfNoticeSchema = z
  .string()
  .nullable()
  .describe(
    "Extract 'State of Notice' from this document. If it is not explicitly stated, return null.",
  );

export const statementOfIncomeCashFlowsSchema = z
  .boolean()
  .nullable()
  .describe(
    "Extract 'Statement of Income / Cash Flows' from this document. If it is not explicitly stated, return null.",
  );

export const statementOfStockholdersEquitySchema = z
  .boolean()
  .nullable()
  .describe(
    "Extract 'Statement of Stockholder's Equity' from this document. If it is not explicitly stated, return null.",
  );

export const subsequentClosingWindowDaysSchema = z
  .string()
  .nullable()
  .describe(
    "Extract 'Subsequent Closing Window' from this document. If it is not explicitly stated, return null.",
  );

export const fundingRoundParticipatingSchema = z
  .string()
  .describe(
    "Extract 'Funding Round Participating' from this document. If it is not explicitly stated, return null.",
  );

export const fundsRecentClosingSchema = z
  .string()
  .nullable()
  .describe(
    "Extract 'Fund's Recent Closing' from this document. If it is not explicitly stated, return null.",
  );

// Core & Document Metadata
export const portfolioCompanySchema = z
  .string()
  .nullable()
  .describe(
    "Extract 'Portfolio Company' from this document. If it is not explicitly stated, return null.",
  );

export const fundSchema = z
  .string()
  .nullable()
  .describe(
    "Extract 'Fund' from this document. If it is not explicitly stated, return null.",
  );

export const cashPositionSchema = z
  .enum(['0-3 months', '4-6 months', '7-12 months', '12+ months'])
  .nullable()
  .describe(
    "Extract 'Cash Position' from this document. If it is not explicitly stated, return null.",
  );

export const entityTypeSchema = z
  .string()
  .nullable()
  .describe(
    "Extract 'Entity Form' from this document. If it is not explicitly stated, return null.",
  );

export const foundedYearSchema = z
  .number()
  .nullable()
  .describe(
    "Extract 'Founded Year' from this document. If it is not explicitly stated, return null.",
  );

export const closingDateSchema = z
  .string()
  .nullable()
  .describe(
    "Extract 'Closing' from this document. If it is not explicitly stated, return null.",
  );

export const postMoneyValuationSchema = z
  .number()
  .nullable()
  .describe(
    'From this document, extract the post-money valuation if explicitly stated. If not stated directly, note that it must be calculated as: price_per_share × fully diluted post-money share count (requires cap table). Return explicit_value if found, or return null with calculation_required: true.',
  );
