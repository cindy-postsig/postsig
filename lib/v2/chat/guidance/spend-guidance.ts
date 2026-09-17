export type SpendColumnKey =
  | 'contractId'
  | 'contractType'
  | 'vendorName'
  | 'currentBudget'
  | 'projectedBudget'
  | 'tcv';

interface SpendColumnSpec {
  key: SpendColumnKey;
  header: string;
  aliases: readonly string[];
}

export const SPEND_TABLE_COLUMN_SPECS: readonly SpendColumnSpec[] = [
  {
    key: 'contractId',
    header: 'ID',
    aliases: ['id', 'contractid'],
  },
  {
    key: 'vendorName',
    header: 'Vendor',
    aliases: ['vendor', 'vendorname'],
  },
  {
    key: 'contractType',
    header: 'Type',
    aliases: ['type', 'contracttype'],
  },
  {
    key: 'currentBudget',
    header: 'Current Spend',
    aliases: ['currentspend', 'currentbudget', 'currentannualspend'],
  },
  {
    key: 'projectedBudget',
    header: 'Projected Spend',
    aliases: ['projectedspend', 'projectedbudget', 'projectedannualspend'],
  },
  {
    key: 'tcv',
    header: 'TCV',
    aliases: ['tcv', 'totalcontractvalue'],
  },
] as const;

const SPEND_COLUMN_SPEC_BY_KEY: Record<SpendColumnKey, SpendColumnSpec> = {
  contractId: SPEND_TABLE_COLUMN_SPECS[0],
  vendorName: SPEND_TABLE_COLUMN_SPECS[1],
  contractType: SPEND_TABLE_COLUMN_SPECS[2],
  currentBudget: SPEND_TABLE_COLUMN_SPECS[3],
  projectedBudget: SPEND_TABLE_COLUMN_SPECS[4],
  tcv: SPEND_TABLE_COLUMN_SPECS[5],
};

export const SPEND_TOTAL_ROW_LABEL = 'Total';

export const SPEND_QUERY_EXAMPLES = [
  'How much do we spend on [vendor name]?',
  "What's my total spend for [vendor name]?",
  "What's my total spend on [tag name]?",
  "What's my total spend on contract #123?",
  "What's my total spend for all contracts?",
  "What's my total [tag name] spend?",
  'What is my total [tag name] spend?',
  'What is my total spend amortized?',
  'What is the actual cost for [vendor name]?',
  'What is my actual cost this month?',
  'What did we actually spend on [vendor name] in March?',
] as const;

const SPEND_DISAMBIGUATION_GUIDANCE = [
  '"tagged", "labeled", "categorized" -> Use tagName',
  '"total X spend", "my X spend", "spend on X" where X is NOT an obvious company name -> Try tagName first',
  'Company/vendor name (e.g., Bloomberg, MSCI, Salesforce) -> Use vendorName',
  'Ambiguous and no results with tagName? Retry with vendorName before asking the user',
  '"amortized", "amortized spend", "amortized monthly breakdown" -> Use spendView="amortized"',
  '"actual cost", "actual spend", "what did we actually spend", "cash flow", "billing cost", "cost for [month]", "spend this month" -> Use spendView="actual"',
  'If the user asks about cost for a specific month without specifying "amortized", default to spendView="actual" as it reflects real billing events',
] as const;

function formatBulletList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

export function getSpendColumnHeader(key: SpendColumnKey): string {
  return SPEND_COLUMN_SPEC_BY_KEY[key].header;
}

export function getSpendColumnAliases(key: SpendColumnKey): readonly string[] {
  return SPEND_COLUMN_SPEC_BY_KEY[key].aliases;
}

export function buildSpendTableMarkdownHeader(): string {
  return `| ${SPEND_TABLE_COLUMN_SPECS.map(({ header }) => header).join(' | ')} |`;
}

export function buildCalculateSpendToolDescription(): string {
  return `Calculate total spend for all contracts, a specific vendor, a tag, or a specific contract. Detect price escalators and include them in the spending breakdown.
Supports three spend views via the spendView parameter:
- "normal" (default): Returns TCV (Total Contract Value), current budget, and projected budget
- "amortized": Returns spend amortized evenly over the contract term as a monthly breakdown
- "actual": Returns actual cost based on billing frequency and billing dates as a monthly breakdown
If asked about price escalators, list contracts that have price escalator ranging from a-b%.  List those contracts in a table with expected escalator percentage.
All values are in USD.
Call with no parameters to get total spend across ALL contracts.
Use this tool when users ask questions like these:
${formatBulletList(SPEND_QUERY_EXAMPLES)}

IMPORTANT:
${formatBulletList(SPEND_DISAMBIGUATION_GUIDANCE)}`;
}

function formatSpendExample(example: string): string {
  if (example.includes('actual cost for [vendor name]')) {
    return `"${example.replace('[vendor name]', 'MSCI')}" -> calculate_spend(vendorName="MSCI", spendView="actual")`;
  }
  if (example.includes('actually spend on [vendor name]')) {
    return `"${example.replace('[vendor name]', 'MSCI')}" -> calculate_spend(vendorName="MSCI", spendView="actual")`;
  }
  if (example.includes('[vendor name]')) {
    return `"${example.replace('[vendor name]', 'MSCI')}" -> calculate_spend(vendorName="MSCI")`;
  }
  if (example.includes('[tag name]')) {
    return `"${example.replace('[tag name]', 'ESG')}" -> calculate_spend(tagName="ESG")`;
  }
  if (example.includes('contract #123')) {
    return `"${example}" -> calculate_spend(contractId=123)`;
  }
  if (example.includes('amortized')) {
    return `"${example}" -> calculate_spend(spendView="amortized")`;
  }
  if (example.includes('actual cost')) {
    return `"${example}" -> calculate_spend(spendView="actual")`;
  }
  return `"${example}" -> calculate_spend()`;
}

export function buildCalculateSpendCapability(): string {
  return `
**Financial Analysis** (calculate_spend):
Returns TCV (Total Contract Value), current budget, and projected budget in USD.
Use spendView="amortized" for amortized monthly spend breakdown.
Use spendView="actual" for actual cost based on billing frequency and billing dates.

Parameters: vendorName, vendorId, contractId, tagName, spendView. No params -> total across all contracts.

**Disambiguation (vendor vs tag):**
${formatBulletList(SPEND_DISAMBIGUATION_GUIDANCE)}

Examples:
${formatBulletList(SPEND_QUERY_EXAMPLES.map(formatSpendExample))}

`;
}

export function buildSpendSynthesisInstruction(): string {
  return `If the user asks a spend question such as:
${formatBulletList(SPEND_QUERY_EXAMPLES)}
Display the spend breakdown as a markdown table for all matching contracts using these exact headers:
${buildSpendTableMarkdownHeader()}
Then add a final totals row starting with \`${SPEND_TOTAL_ROW_LABEL}\`.`;
}
