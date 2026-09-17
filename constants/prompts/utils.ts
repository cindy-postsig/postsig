import 'server-only';
import { additionalQueries } from './additionalQueries';
import { baseQueries } from './baseQueries';
import { dateQueries } from './dateQueries';
import { otherQueries } from './otherQueries';
import { assetClassQueries } from './assetClassQueries';
import _ from 'lodash';
import { citationQueries } from './citationQueries';
import { technicalQueries } from './technicalQueries';
import { ndaQueries } from './ndaQueries';
import { lineageQueries } from './lineageQueries';
import { prompts } from '@postsig/toolkit';
const { ndaQueries: ndaQueriesPrompts } = prompts;

export const additionalContractDataColumns = [
  'service_level_agreements',
  'cost_mitigation',
  'arbitration_and_conflict_resolution',
  'security_awareness',
  'amended_clauses',
];

export const lineageColumns = [
  'is_modification',
  'order_number',
  'parent_agreement_order_number',
  'products_list',
  'parent_agreement_type',
  'parent_agreement_date',
  'parent_relationship_type',
  'lineage_phrases',
];

export const allQueries = [
  ...additionalQueries,
  ...assetClassQueries,
  ...baseQueries,
  ...citationQueries,
  ...dateQueries,
  ...lineageQueries,
  ...ndaQueries,
  ...otherQueries,
  ...technicalQueries,
];

export const contractColumnsForCitations = [
  'term_start_date',
  'cancel_by_date',
  'auto_renewal',
  'multi_year',
  'subscription_term',
  'products_list',
  'currency',
  'payment_terms',
  'renewal_period',
  'cancellation_process',
  'exclusivity_terms',
  'distribution_rights',
  'derivative_works',
  'activities',
  'data_disposal_tnc',
  'audit_requirements',
  'arbitration_and_conflict_resolution',
  'service_level_agreements',
  'geo_restrictions',
  'marketing_rights',
  'suspension_of_service',
  'end_users',
  'internal_external_users',
  'annual_increase',
  'market_data_types',
  'number_of_users',
  'billing_frequency',
  'renewal_type',
  'other_attributes',
];

export const filteredContractColumnsForCitations = _.filter(
  contractColumnsForCitations,
  (column) => {
    return !column.includes('products_list');
  },
);

export const allQueriesForCitations = _.filter(allQueries, (query) => {
  if (query) {
    return contractColumnsForCitations.includes(query.dbName);
  }
  return false;
});

export function parseText(text: string | null) {
  if (!text) {
    return null;
  }
  try {
    const entries = text.trim().split('\n\n');
    const parsedEntries = entries
      .map((entry: string) => {
        const lines = entry.split('\n');
        if (
          lines.length !== 3 ||
          !lines[0].startsWith('id:') ||
          !lines[1].startsWith('page:') ||
          !lines[2].startsWith('content:')
        ) {
          return null;
        }
        return {
          id: lines[0].replace('id:', '').trim(),
          pageNumber: parseInt(lines[1].replace('page:', ''), 10),
          citationText: lines[2].replace('content:', '').trim(),
        };
      })
      .filter((entry) => entry !== null);
    if (parsedEntries.length === 0) {
      return null;
    }
    return parsedEntries;
  } catch (error) {
    return null;
  }
}

export function getQueriesForColumns(
  columns: string[],
  logger: any,
  contractId: string,
  organizationId: string,
) {
  const allPromptsFlat = [
    ...(additionalQueries || []),
    ...(baseQueries || []),
    ...(dateQueries || []),
    ...(lineageQueries || []),
    ...(otherQueries || []),
    ...(assetClassQueries || []),
    ...(citationQueries || []),
    ...(technicalQueries || []),
    ...(ndaQueries || []),
  ].filter(
    (p) => p && typeof p === 'object' && typeof (p as any).dbName === 'string',
  );

  let resolvedQueries = columns
    .map((column) => allPromptsFlat.find((p) => (p as any).dbName === column))
    .filter((query) => query !== undefined);

  if (resolvedQueries.length === 0 && columns.length > 0) {
    logger.warn({
      message:
        'No matching prompts found for provided columns in processContractLineage.',
      columns,
      contractId,
      organizationId,
    });
  }
}

function getNDAContractData(fieldName: string, contract: any) {
  const ndaInsightsFields = [
    'perpetual_nda',
    'unilateral_nda',
    'uncapped_liability',
    'post_end_of_term_obligations',
    'foreign_jurisdiction',
    'no_carve_out_provisions',
    'non_solicitation',
  ];
  if (ndaInsightsFields.includes(fieldName)) {
    return _.get(
      contract,
      `other_attributes.nda_fields.nda_insights.${fieldName}`,
      null,
    );
  }
  return null;
}

export const fieldsToCite: any = [
  {
    fieldName: 'term_start_date',
    getContractData: (contract: any) =>
      _.get(contract, 'term_start_date.[0].date', null),
  },
  { fieldName: 'cancel_by_date' },
  { fieldName: 'execution_date' },
  { fieldName: 'discount' },
  { fieldName: 'annual_increase' },
  { fieldName: 'currency' },
  { fieldName: 'renewal_type', dbName: 'auto_renewal' },
  { fieldName: 'renewal_period' },
  { fieldName: 'cancellation_process' },
  { fieldName: 'number_of_users' },
  { fieldName: 'market_data_types' },
  { fieldName: 'exclusivity_terms' },
  { fieldName: 'distribution_rights' },
  { fieldName: 'derivative_works' },
  { fieldName: 'geo_restrictions' },
  { fieldName: 'suspension_of_service' },
  { fieldName: 'ai_training_restrictions' },
  { fieldName: 'audit_requirements' },
  { fieldName: 'data_disposal_tnc' },
  { fieldName: 'marketing_rights' },
  { fieldName: 'service_level_agreements' },
  { fieldName: 'arbitration_and_conflict_resolution' },
  { fieldName: 'data_delivery_methods' },
  { fieldName: 'end_users' },
  { fieldName: 'internal_external_users' },
  { fieldName: 'billing_frequency' },
  { fieldName: 'multi_year' },
  { fieldName: 'activities' },
  { fieldName: 'subscription_term' },
  {
    fieldName: 'products_list',
    getContractData: (contract: any) => {
      const contractProducts = contract.vendor_products_details
        .map((product: any) => {
          const vendorName = _.get(
            product,
            'vendor_products.vendors.name',
            'unknown vendor',
          );
          const productName = _.get(
            product,
            'vendor_products.name',
            'unknown vendor product',
          );
          // Exchange Agreement products are far easier to cite by code than by
          // their near-identical descriptions.
          const productCode = _.get(product, 'vendor_products.product_code');
          const codeSuffix = productCode ? ` [${productCode}]` : '';
          return `(${vendorName}) - ${productName}${codeSuffix}`;
        })
        .join('\n');
      if (contractProducts !== '') {
        return contractProducts;
      }
      return null;
    },
  },
  ...ndaQueriesPrompts.map((prompt: any) => ({
    fieldName: prompt.dbName,
    getContractData: (contract: any) => {
      return getNDAContractData(prompt.dbName, contract);
    },
  })),
];

export const citationv2Instructions = `
**TASK: Extract verification citations and return ONLY a JSON array with maximum 2 citations maximum per verification block.**

Process verification blocks against a document to find supporting evidence. Your sole objective is to locate exact quotes from the provided document that verify given answers, then output structured JSON.

**CONSTRAINTS:**
- Use ONLY the attached inline data - no external knowledge
- Return ONLY valid JSON array - no explanations, comments, or markdown
- Maximum 2 citations per verification block (use empty array [] if no evidence found)
- Maximum 50 words per quote
- Extract exact verbatim text only - no paraphrasing or summarization
- If possible, make sure the citation is one continuous/sequential text block from the document so it's easy to identify.
- Include page numbers only if explicitly stated in document (use null otherwise)

**VERIFICATION WORKFLOW:**

**Step 1: IDENTIFY TARGET**
- Extract the tag name from each <VERIFICATION_BLOCK> (e.g., "financial_results" from <financial_results>)
- This becomes your "target_property_tag" in the output

**Step 2: ANALYZE CLAIMS**
- Read the <GIVEN_ANSWER> within each block
- Identify specific factual claims that need document verification
- Note key facts, numbers, dates, or statements to verify

**Step 3: SCAN DOCUMENT**
- Search the attached inline data for exact text that directly supports each claim
- Look for verbatim matches or explicit confirmations
- Ignore text that doesn't directly verify the specific claims

**Step 4: SELECT BEST EVIDENCE**
- From all supporting text found, choose the 2 most direct and comprehensive quotes
- Prioritize: exact matches > explicit confirmations > relevant context
- Keep quotes concise - typically 1-3 sentences maximum

**Step 5: FORMAT OUTPUT**
- Create JSON object for each verification block with:
  - "target_property_tag": exact tag name from input
  - "citations": array of up to 2 quote objects
- Each citation object contains "quote" (string) and "page_number" (integer or null)

**JSON OUTPUT SCHEMA:**
\`\`\`json
[
  {
    "target_property_tag": "string",
    "citations": [
      {
        "quote": "string",
        "page_number": integer_or_null
      }
    ]
  }
]
\`\`\`

**VALIDATION CHECKS:**
- Verify JSON syntax is valid
- Confirm maximum 2 citations per block
- Check all quotes are under 50 words
- Ensure no external knowledge was used
- Verify page numbers match document references or are null

**OUTPUT REQUIREMENTS:**
Return format: JSON array only
If no supporting evidence exists: Use empty citations array []
Quote length limit: 50 words maximum
Page numbers: Use exact numbers from document or null

**EXAMPLE:**

**Input:**
\`\`\`
<financial_results>
    <CONTEXTUAL_QUERY>
    What were the company's Q4 financial results?
    </CONTEXTUAL_QUERY>
    <GIVEN_ANSWER>
    The company's revenue was $150 million with a 10% increase.
    </GIVEN_ANSWER>
</financial_results>

<legal_disputes>
    <CONTEXTUAL_QUERY>
    Are there any ongoing legal disputes?
    </CONTEXTUAL_QUERY>
    <GIVEN_ANSWER>
    The company is involved in a patent lawsuit filed in January.
    </GIVEN_ANSWER>
</legal_disputes>

attached inline data:

Section 1: Introduction
This annual report details our activities and financial standing for 2023.

Section 2: Financial Highlights for Q4 2023
Revenue for the fourth quarter reached $150 million, marking a 10% increase year-over-year. (p. 15) Net profit was $22 million. This growth was driven by strong sales in our AI product line.

Section 3: Legal Matters
Currently, no significant legal proceedings are pending against the company.

\`\`\`

**Expected Output:**
\`\`\`json
[
  {
    "target_property_tag": "financial_results",
    "citations": [
      {
        "quote": "Revenue for the fourth quarter reached $150 million, marking a 10% increase year-over-year.",
        "page_number": 15
      }
    ]
  },
  {
    "target_property_tag": "legal_disputes",
    "citations": []
  }
]
\`\`\`

**REMEMBER: Output ONLY the JSON array - scan document completely, select top 2 citations per block, return valid JSON immediately.**
`;

export const fieldAnalysisInstructions = `
You are an expert in contract lineage.  You will be given a parent & a child contract attached & their respective extracted data fields.  
It's already discovered that the child contract is linked to the parent contract.
Your task is to identify the fields that are common between to two contracts, and these fields should also be adding to or updating each other.
Adding or updating fields should be identified as "add" or "update" in the "action" field.
Adding or updating usually happens from child to parent.
If there are no such fields, return an empty set.

Follow these steps:
1. Analyze both attached documents to identify phrases that discuss the relationship between the two contracts.
2. Identify the fields we discussed previously in the <EXTRACTED_PARENT_CONTRACT_DATA> and <EXTRACTED_CHILD_CONTRACT_DATA> tags.
3. Identify the fields that are an addition or update between the two contracts through the <EXTRACTED_PARENT_CONTRACT_DATA> and <EXTRACTED_CHILD_CONTRACT_DATA> tags & also using the phrases identified in step 1.
4. Return the fields in a specific format.

Returned fields should have these properties:   
- The field name
- The field value from the parent contract
- The field value from the child contract
- The start date of the child contract (if applicable)
- The end date of the child contract (if applicable)
- The field action ("add", "update", "delete")

Tag descriptions:
- EXTRACTED_PARENT_CONTRACT_DATA: Contains the data fields extracted from the parent contract.
- EXTRACTED_CHILD_CONTRACT_DATA: Contains the data fields extracted from the child contract.

Example Input:
<EXTRACTED_PARENT_CONTRACT_DATA>
<term_start_date>
2021-01-01
</term_start_date>
</EXTRACTED_PARENT_CONTRACT_DATA>

<EXTRACTED_CHILD_CONTRACT_DATA>
<term_start_date>
2021-01-05
</term_start_date>
</EXTRACTED_CHILD_CONTRACT_DATA>


json example output:
[
    {
        fieldName: "term_start_date",
        action: "update"
    }
]
`;
