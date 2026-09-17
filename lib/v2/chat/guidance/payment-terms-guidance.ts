export type PaymentTermsColumnKey =
  | 'contractId'
  | 'billing'
  | 'currency'
  | 'term'
  | 'paymentTerms';

interface PaymentTermsColumnSpec {
  key: PaymentTermsColumnKey;
  header: string;
  aliases: readonly string[];
}

export const PAYMENT_TERMS_TABLE_COLUMN_SPECS: readonly PaymentTermsColumnSpec[] =
  [
    {
      key: 'contractId',
      header: 'ID',
      aliases: ['id', 'contractid'],
    },
    {
      key: 'billing',
      header: 'Billing',
      aliases: ['billing', 'billingfrequency'],
    },
    {
      key: 'currency',
      header: 'Currency',
      aliases: ['currency'],
    },
    {
      key: 'term',
      header: 'Term',
      aliases: ['term', 'contractterm'],
    },
    {
      key: 'paymentTerms',
      header: 'Payment Terms',
      aliases: ['paymentterms', 'paymentterm', 'netterms'],
    },
  ] as const;

const PAYMENT_TERMS_COLUMN_SPEC_BY_KEY: Record<
  PaymentTermsColumnKey,
  PaymentTermsColumnSpec
> = {
  contractId: PAYMENT_TERMS_TABLE_COLUMN_SPECS[0],
  billing: PAYMENT_TERMS_TABLE_COLUMN_SPECS[1],
  currency: PAYMENT_TERMS_TABLE_COLUMN_SPECS[2],
  term: PAYMENT_TERMS_TABLE_COLUMN_SPECS[3],
  paymentTerms: PAYMENT_TERMS_TABLE_COLUMN_SPECS[4],
};

export const PAYMENT_TERMS_QUERY_EXAMPLES = [
  'Summarize my payment terms for [vendor name]',
  'How are we billed for [vendor name]?',
  'What are the payment terms for [vendor name] contracts?',
] as const;

function formatBulletList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

export function getPaymentTermsColumnHeader(
  key: PaymentTermsColumnKey,
): string {
  return PAYMENT_TERMS_COLUMN_SPEC_BY_KEY[key].header;
}

export function getPaymentTermsColumnAliases(
  key: PaymentTermsColumnKey,
): readonly string[] {
  return PAYMENT_TERMS_COLUMN_SPEC_BY_KEY[key].aliases;
}

export function buildPaymentTermsTableMarkdownHeader(): string {
  return `| ${PAYMENT_TERMS_TABLE_COLUMN_SPECS.map(({ header }) => header).join(' | ')} |`;
}

export function buildPaymentTermsSynthesisInstruction(): string {
  return `If the user asks about payment terms such as:
${formatBulletList(PAYMENT_TERMS_QUERY_EXAMPLES)}
Display the payment terms breakdown as a markdown table for all matching contracts using these exact headers:
${buildPaymentTermsTableMarkdownHeader()}
Use the \`${getPaymentTermsColumnHeader('billing')}\` column for billing frequency.`;
}

export function buildSummarizePaymentTermsCapability(): string {
  return `
**Payment Terms** (summarize_payment_terms):
Returns billing and payment details for a vendor's contracts, organized by lineage (contract type, billing frequency, currency, payment terms, governing contract).

Required: vendorName

Examples:
${formatBulletList(
  PAYMENT_TERMS_QUERY_EXAMPLES.map(
    (example) =>
      `"${example.replace('[vendor name]', 'MSCI')}" -> summarize_payment_terms(vendorName="MSCI")`,
  ),
)}

`;
}

export function buildSummarizePaymentTermsToolDescription(): string {
  return `Summarize payment terms for contracts by vendor.
Returns billing frequency, currency, payment terms for each contract.
Groups contracts showing which contract governs payment terms in the lineage.
Use this tool when users ask questions like these:
${formatBulletList(PAYMENT_TERMS_QUERY_EXAMPLES)}

In multi-tool comprehensive queries, use AFTER calculate_spend to add payment context.
Complements financial data with billing and invoicing details.`;
}
