import type { InvestorDocumentTypeCode } from '../investorQueries';

/**
 * Maps variant document names to their parent document type codes.
 * Used to normalize sub-type classifications back to the canonical type.
 */
export const investorDocumentSubTypes: Record<
  string,
  InvestorDocumentTypeCode
> = {
  preferred_share_purchase_agreement: 'spa',
  disclosure_schedules_spa: 'spa',
  certificate_articles_of_amendment: 'coi',
  canadian_accredited_investor_cert: 'subscription',
  us_accredited_investor_cert: 'subscription',
  receipt_payment_subscription: 'subscription',
  management_rights_letter: 'side_letter',
  board_observer_agreement: 'side_letter',
  inter_fund_transfer: 'affiliate_transfer',
  restated_voting_agreement: 'ira',
  noteholder_conversion_acknowledgement: 'cpn',
  amended_option_plan: 'amendment',
  shareholder_consent_waiver: 'amendment',
} as const;
