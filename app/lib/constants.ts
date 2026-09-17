import { ModelParams } from '@google/generative-ai';

export function addDefaultOption(options: any) {
  return [{ name: 'Select an option / not selected', value: '' }, ...options];
}

export const internalTesters = [
  'cindy@postsig.com',
  'ziya@postsig.com',
  'sadiqa@postsig.com',
  'phil@postsig.com',
  'mike@postsig.com',
  'faith@postsig.com',
  'hendrik@postsig.com',
  'tiff@postsig.com',
  'derk@postsig.com',
];

export const dateFieldMap: {
  [key: string]: string;
} = {
  start: 'term_start_date',
  end: 'term_end_date',
  cancel: 'cancel_date',
};

export const dateTypeColorMap: {
  [key: string]: string;
} = {
  start: '#00a86b',
  end: '#545B75',
  cancel: '#c52e50',
};

export type AIExtractionStatus =
  | null
  | 'ai_success'
  | 'ai_failed'
  | 'h_success'
  | 'h_failed';

export type EventType = 'start' | 'end' | 'cancel';

export const eventTypeDescriptions: Record<EventType, string> = {
  start: 'Starts on',
  end: 'Ending',
  cancel: 'Cancel by',
};

export const userRoleMap: {
  [key: string]: string;
} = {
  admin: 'admin',
  developer: 'developer',
  user: 'user',
  extractor: 'extractor',
  reviewer: 'reviewer',
  demo: 'demo',
  trial: 'trial',
};

export const contractTypes = {
  MSA: 1,
  SO: 2,
  Addendum: 3,
  Other: 4,
  TOS: 5,
  Invoice: 6,
  Trial: 7,
  NDA: 8,
  Operational: 9,
  EAFeeSchedule: 10,
  Lease: 11,
  EASO: 12,
  EAINV: 13,
};

export const reverseContractTypeMap = Object.fromEntries(
  Object.entries(contractTypes).map(([key, value]) => [value, key]),
);

/**
 * Exchange Agreement documents are separate contract types so
 * their extraction and permission rules stay off regular Service Orders and
 * Invoices. Everywhere else in the app they must behave like their base type, so
 * branch on these groups rather than on a bare type id: a literal `type_id === 6`
 * silently drops Exchange Agreement Invoices out of reports, filters and folders.
 */
export const INVOICE_TYPE_IDS: readonly number[] = [
  contractTypes.Invoice,
  contractTypes.EAINV,
];

export const SERVICE_ORDER_TYPE_IDS: readonly number[] = [
  contractTypes.SO,
  contractTypes.EASO,
];

export const EXCHANGE_AGREEMENT_TYPE_IDS: readonly number[] = [
  contractTypes.EAFeeSchedule,
  contractTypes.EASO,
  contractTypes.EAINV,
];

/**
 * The agreements proper: master service agreements, service orders and
 * amendments — what a vendor is actually contracted under. Everything else is
 * a billing record, boilerplate (TOS, NDA), a trial, or the classifier's
 * fallback.
 */
export const AGREEMENT_TYPE_IDS: readonly number[] = [
  contractTypes.MSA,
  ...SERVICE_ORDER_TYPE_IDS,
  contractTypes.Addendum,
];

export const isInvoiceType = (typeId?: number | null): boolean =>
  typeId != null && INVOICE_TYPE_IDS.includes(typeId);

export const isServiceOrderType = (typeId?: number | null): boolean =>
  typeId != null && SERVICE_ORDER_TYPE_IDS.includes(typeId);

export const isExchangeAgreementType = (typeId?: number | null): boolean =>
  typeId != null && EXCHANGE_AGREEMENT_TYPE_IDS.includes(typeId);

export const isAgreementType = (typeId?: number | null): boolean =>
  typeId != null && AGREEMENT_TYPE_IDS.includes(typeId);

/**
 * Types kept out of the Unexecuted Contracts report. None of these carry a
 * signature worth chasing: a TOS has no commercial terms, invoices and fee
 * schedules are billing records rather than agreements, and `Other` is what the
 * classifier falls back to when it cannot identify the document at all (see
 * contract-processing.ts). Signed documents of these types keep every field they
 * record -- this list only governs report inclusion, never extraction.
 *
 * Add the Exchange Agreement MSA id here when that contract type is introduced.
 */
export const UNEXECUTED_EXCLUDED_TYPE_IDS: readonly number[] = [
  contractTypes.Other,
  contractTypes.TOS,
  ...INVOICE_TYPE_IDS,
  contractTypes.EAFeeSchedule,
];

export const isUnexecutedExcludedType = (typeId?: number | null): boolean =>
  typeId == null || UNEXECUTED_EXCLUDED_TYPE_IDS.includes(typeId);

/** Renders a type-id list for a PostgREST `in` filter, e.g. `(6,12)`. */
export const typeIdInList = (typeIds: readonly number[]): string =>
  `(${typeIds.join(',')})`;

/**
 * The base type whose field set, viewer config and lineage rules an Exchange
 * Agreement type inherits. Lets per-type registries keyed on the original ids
 * keep working without duplicating every entry.
 */
export const baseContractTypeId = (typeId: number): number => {
  if (typeId === contractTypes.EASO) return contractTypes.SO;
  if (typeId === contractTypes.EAINV) return contractTypes.Invoice;
  return typeId;
};

export const contractStatuses = {
  uploaded: 5,
  new: 1,
  inProgress: 2,
  submitted: 3,
  published: 4,
};

export const vendorFields = [
  { elementType: 'header', title: 'Vendor Details' },
  {
    label: 'Vendor Name',
    placeholder: 'Vendor Name',
    fieldName: 'vendors.name',
    elementType: 'input',
  },
  {
    label: 'Vendor Address',
    placeholder: 'Vendor Address',
    fieldName: 'vendors.address',
    elementType: 'textarea',
  },
];

export const productFields = [{ elementType: 'header', title: 'Products' }];

export const contractTypeFields = [
  {
    label: 'Contract Type',
    placeholder: 'Enter contract type',
    fieldName: 'type_id',
    elementType: 'dropdown',
    options: [
      { name: 'MSA / Master Service Agreement', value: 1 },
      { name: 'SO / Service Order', value: 2 },
      { name: 'Addendum', value: 3 },
      { name: 'TOS / Terms Of Service', value: 5 },
      { name: 'Invoice', value: 6 },
      { name: 'Unknown', value: 4 },
    ],
    dataType: 'number',
  },
  { elementType: 'hr' },
];

export const specialTermsFields = [
  { elementType: 'hr' },
  { elementType: 'header', title: 'Special Terms' },
  {
    label: 'Permissions',
    placeholder: '',
    fieldName: 'permissions',
    elementType: 'textarea',
  },
  {
    label: 'Payment Terms',
    placeholder: '',
    fieldName: 'payment_terms',
    elementType: 'textarea',
  },
  {
    label: 'Scope of Use',
    placeholder: '',
    fieldName: 'scope_of_use',
    elementType: 'textarea',
  },
  {
    label: 'Suspension of Service',
    placeholder: '',
    fieldName: 'suspension_of_service',
    elementType: 'textarea',
  },
  {
    label: 'Renewal Period',
    placeholder: '',
    fieldName: 'renewal_period',
    elementType: 'textarea',
  },
  {
    label: 'Cancellation Process',
    placeholder: '',
    fieldName: 'cancellation_process',
    elementType: 'textarea',
  },
  {
    label: 'Marketing Rights',
    placeholder: '',
    fieldName: 'marketing_rights',
    elementType: 'textarea',
  },
  { elementType: 'hr' },
];

export const currencyOptions = [
  {
    name: 'USD',
    value: 'usd',
  },
  {
    name: 'EUR',
    value: 'eur',
  },
  {
    name: 'Japanese Yen',
    value: 'jpy',
  },
  {
    name: 'British Pound',
    value: 'gbp',
  },
  {
    name: 'Swiss Franc',
    value: 'chf',
  },
  {
    name: 'Canadian Dollar',
    value: 'cad',
  },
  {
    name: 'Australian/NZ Dollar',
    value: 'aud',
  },
  {
    name: 'Other',
    value: 'Other',
  },
];

export const cancelByDateOptions = [
  {
    name: '30 days',
    value: '30',
  },
  {
    name: '60 days',
    value: '60',
  },
  {
    name: '90 days',
    value: '90',
  },
  {
    name: 'Other',
    value: 'Other',
  },
];

export const subscriptionTermOptions = ['Quarterly', 'Annually', 'Other'].map(
  (value) => ({ name: value, value }),
);

export const annualIncreaseOptions = [
  {
    name: '3 %',
    value: '3',
  },
  {
    name: '5 %',
    value: '5',
  },
  {
    name: 'Other',
    value: 'Other',
  },
];

export const distributionRights = [
  'N/A',
  'Internal Only',
  'External',
  'Redistribution',
  'Other',
].map((value) => ({
  name: value,
  value,
}));

export const geoRestrictions = ['N/A', 'USA', 'Other'].map((value) => ({
  name: value,
  value,
}));

export const keyTermsFields = [
  {
    elementType: 'header',
    title: 'Key Terms',
  },
  {
    label: 'Cancellation By Date Range',
    placeholder: 'Enter date range',
    fieldName: 'cancel_by_date',
    elementType: 'dropdown',
    options: addDefaultOption(cancelByDateOptions),
    dataType: 'string',
    otherFieldName: 'other_cancel_by_date',
    otherInputType: 'number',
  },
  {
    label: 'Subscription Term',
    placeholder: 'Enter subscription term',
    fieldName: 'subscription_term',
    elementType: 'dropdown',
    options: addDefaultOption(subscriptionTermOptions),
    dataType: 'string',
    otherFieldName: 'other_subscription_term',
  },
  {
    label: 'Billing Frequency',
    placeholder: 'Enter billing frequency',
    fieldName: 'billing_frequency',
    elementType: 'dropdown',
    options: addDefaultOption(
      ['Monthly', 'Quarterly', 'Annually', 'Bi-annually'].map((value) => ({
        name: value,
        value,
      })),
    ),
    dataType: 'string',
  },
  {
    label: 'Annual Increase',
    placeholder: 'Enter other % amount',
    fieldName: 'annual_increase',
    elementType: 'dropdown',
    options: addDefaultOption(annualIncreaseOptions),
    dataType: 'string',
    otherFieldName: 'other_annual_increase',
    otherInputType: 'number',
  },
  {
    label: 'Currency',
    placeholder: 'Enter currency',
    fieldName: 'currency',
    elementType: 'dropdown',
    options: addDefaultOption(currencyOptions),
    dataType: 'string',
    otherFieldName: 'other_currency',
  },
  {
    label: 'Geographic Restrictions',
    placeholder: 'Enter geographic restrictions',
    fieldName: 'geo_restrictions',
    elementType: 'dropdown',
    options: addDefaultOption(geoRestrictions),
    dataType: 'string',
    otherFieldName: 'other_geo_restrictions',
  },
  {
    label: 'Distribution Rights',
    placeholder: 'Enter distribution rights',
    fieldName: 'distribution_rights',
    elementType: 'dropdown',
    options: addDefaultOption(distributionRights),
    dataType: 'string',
    otherFieldName: 'other_distribution_rights',
  },
  {
    label: 'Exclusivity Terms',
    placeholder: 'Select an option',
    fieldName: 'exclusivity_terms',
    elementType: 'dropdown',
    options: addDefaultOption(
      ['Exclusive', 'Non-Exclusive'].map((value) => ({
        name: value,
        value,
      })),
    ),
    dataType: 'string',
    fieldInfo: 'No AI Extraction',
  },
  {
    label: 'Multi-Year Agreement',
    placeholder: 'Select an option',
    fieldName: 'multi_year',
    elementType: 'dropdown',
    options: addDefaultOption(
      ['Yes', 'No'].map((value) => ({
        name: value,
        value,
      })),
    ),
    dataType: 'string',
    fieldInfo: 'No AI Extraction',
  },
  {
    label: 'Auto Renewal',
    placeholder: 'Select an option',
    fieldName: 'auto_renewal',
    elementType: 'dropdown',
    options: addDefaultOption(
      ['Yes', 'No'].map((value) => ({
        name: value,
        value,
      })),
    ),
    dataType: 'string',
    fieldInfo: 'No AI Extraction',
  },
  { elementType: 'hr' },
];

export const keyDatesFields = [
  {
    elementType: 'header',
    title: 'Key Dates',
  },
  {
    label: 'Term Start Date or Commencement Date',
    placeholder: 'dd.mm.yyyy',
    fieldName: 'term_start_date',
    elementType: 'date',
    pattern: '\\d{2}.\\d{2}.\\d{4}',
  },
  {
    label: 'Term End Date',
    placeholder: 'dd.mm.yyyy',
    fieldName: 'term_end_date',
    elementType: 'date',
    pattern: '\\d{2}.\\d{2}.\\d{4}',
  },
  {
    label: 'Contract Execution Date',
    placeholder: 'dd.mm.yyyy',
    fieldName: 'execution_date',
    elementType: 'date',
    pattern: '\\d{2}.\\d{2}.\\d{4}',
  },
];

export const feedbackField = {
  label: 'Extractor Feedback',
  placeholder: 'Enter feedback here regarding the process or the contract',
  fieldName: 'extractorFeedback',
  elementType: 'textarea',
};

export const contractTypeIdMap: any = {
  'Master Service Agreement': 1,
  'Service Order': 2,
  'Statement of Work': 2,
  'License Agreement': 1,
  Other: 3,
};

export const contractTypeMap: any = {
  MSA: 'Master Service Agreement',
  SO: 'Service Order',
  Addendum: 'Addendum',
  Invoice: 'Invoice',
  Other: 'Other',
};

export const AI_FAILED = 'ai_failed';
export const AI_SUCCESS = 'ai_success';

export const generalAssistantInstructions = `
**TASK: Extract contract data and return ONLY valid JSON with the specified keys.**

You are a contract data extraction specialist. Your sole objective is to analyze the provided contract files and output structured JSON data using only the keys and descriptions provided to you.

**CONSTRAINTS:**
- Use ONLY the information in the provided contract files - no external knowledge
- Return ONLY valid JSON - no explanations, comments, or additional text
- Use empty string ("") for any field where data is not found in the document
- Keep extracted text concise and summarized - maximum 2-3 sentences per field
- Never nest objects within the JSON response - flat structure only
- Reproduce proper nouns exactly as written in the document. Product, vendor and party names must be copied verbatim, character for character. Never transliterate, spell-correct, abbreviate, expand, drop or ASCII-ify them: "BØRS" stays "BØRS" - not "BORS", not "B RS". Preserve every non-ASCII letter and diacritic exactly as printed (Ø ø Æ æ Å å ß Þ ð é ü ö)

**EXTRACTION WORKFLOW:**

**Step 1: ANALYZE**
- Read through all provided contract files completely
- Identify document structure (contract type, sections, parties, etc.)

**Step 2: EXTRACT**
- For each required key, locate relevant information in the document
- Extract exact text passages that match the field descriptions
- If multiple relevant passages exist, summarize into concise text. Summarisation applies to prose only; never to names, identifiers, codes or numbers
- Remove any duplicate text

**Step 3: FORMAT**
- Create flat JSON object with only the specified keys
- Use exact key names as provided - no modifications
- Apply empty string ("") for missing data
- Ensure all values are strings unless specified otherwise

**Step 4: VALIDATE**
- Verify JSON syntax is valid
- Confirm all required keys are present
- Check that no nested objects exist
- Ensure no extraneous keys were added

**OUTPUT REQUIREMENTS:**
Return format: Valid JSON object only
If any field lacks data in the document: Use ""
Maximum length per text field: 250 characters - except fields whose description asks for a list, array or JSON structure, which must be returned complete and untruncated
Stop immediately after outputting the JSON

**REMEMBER: Output ONLY the JSON object - no other text, explanations, or formatting.**
`;

type Usage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type ContractBasicsResponse = {
  data: Record<string, any>;
  usage: Usage | null | undefined;
};

export const geminiModelConfig: ModelParams = {
  model: 'models/gemini-3.8-flash',
  generationConfig: {
    temperature: 0,
    topP: 0.2,
    responseMimeType: 'application/json',
    responseSchema: undefined,
  },
} as const;

export const geminiCitationModelConfig: ModelParams = {
  model: 'models/gemini-3.8-flash',
  generationConfig: {
    temperature: 0.1,
    topP: 0.4,
    responseMimeType: 'application/json',
    responseSchema: undefined,
  },
} as const;

export const isLocal = process.env.ENV === 'local';

export const DEFAULT_URL = process.env.APP_URL
  ? `https://${process.env.APP_URL}`
  : 'http://localhost:3000';
