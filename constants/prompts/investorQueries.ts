import { z } from 'zod';

import { fundNameSchema } from './investorFieldSchemas';
import { glossaryPrompts } from './glossaryPrompts';
import { glossaryExtractionSchema } from './glossaryExtractionSchema';

import type { GlossaryField } from './glossaryPrompts';

export {
  investorBasicsQuery,
  investorSystemPrompt,
} from './investorFieldSchemas';

export { glossaryPrompts } from './glossaryPrompts';
export type {
  GlossaryField,
  GlossaryEntry,
  FieldCategory,
} from './glossaryPrompts';
export { glossaryExtractionSchema } from './glossaryExtractionSchema';
export type { GlossaryExtraction } from './glossaryExtractionSchema';

// IDs match document_types table where module_id = 2 (investor)
export const investorDocumentTypes = {
  coi: 1,
  ira: 2,
  voting: 3,
  rofr_cosale: 4,
  safe: 5,
  side_letter: 6,
  amendment: 7,
  spa: 8,
  warrant: 9,
  cpn: 10,
  subscription: 11,
  kiss: 12,
  promissory_note: 13,
  merger_agreement: 14,
  letter_of_transmittal: 15,
  secondary_purchase: 16,
  schedule_of_investments: 17,
  share_certificate: 18,
  investment_agreement: 19,
  joinder: 20,
  term_sheet: 21,
  cap_table: 22,
  pitch_deck: 23,
  due_diligence_package: 24,
  venture_debt: 25,
  lpa: 26,
  disclosure_schedule: 37,
  board_observer_agreement: 38,
  management_rights_letter: 39,
  affiliate_transfer: 40,
  stock_option_plan: 41,
  repurchase_agreement: 42,
} as const;

export const documentTypeCodes = Object.keys(investorDocumentTypes) as [
  InvestorDocumentTypeCode,
  ...InvestorDocumentTypeCode[],
];

export type InvestorDocumentTypeCode = keyof typeof investorDocumentTypes;

export const investorExtractionSchema = (
  investorFundNames: string[] | null,
  organizationName: string | null = null,
) =>
  z.object({
    portfolioCompany: z
      .string()
      .nullable()
      .describe(
        'Extract "Portfolio Company" from this document. If it is not explicitly stated, return null.',
      ),
    documentType: z.enum(documentTypeCodes).describe('Document type code...'),
    fund: fundNameSchema(investorFundNames, organizationName),
  });

export const DOCUMENT_TYPES = [
  'spa',
  'coi',
  'ira',
  'side_letter',
  'safe',
  'cpn',
  'warrant',
  'voting',
  'rofr_cosale',
  'amendment',
  'subscription',
  'kiss',
  'promissory_note',
  'merger_agreement',
  'letter_of_transmittal',
  'secondary_purchase',
  'schedule_of_investments',
  'share_certificate',
  'investment_agreement',
  'joinder',
  'term_sheet',
  'cap_table',
  'pitch_deck',
  'due_diligence_package',
  'venture_debt',
  'lpa',
  'disclosure_schedule',
  'board_observer_agreement',
  'management_rights_letter',
  'affiliate_transfer',
  'stock_option_plan',
  'repurchase_agreement',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const referenceSchema = glossaryExtractionSchema(null, null);
type ExtractableField = keyof typeof referenceSchema.shape;

function getFieldsForType(docType: DocumentType): ExtractableField[] {
  return (
    Object.entries(glossaryPrompts) as [
      GlossaryField,
      (typeof glossaryPrompts)[GlossaryField],
    ][]
  )
    .filter(([, config]) => config.types.includes(docType))
    .map(([key]) => key)
    .filter(
      (key): key is GlossaryField & ExtractableField =>
        key in referenceSchema.shape,
    );
}

function buildPickMask<T extends ExtractableField>(
  fields: T[],
): { [K in T]: true } {
  return fields.reduce(
    (acc, field) => {
      acc[field] = true;
      return acc;
    },
    {} as { [K in T]: true },
  );
}

export function createSchemaForType<T extends DocumentType>(
  docType: T,
  investorNames: string[] | null,
  investorFunds: string[] | null,
) {
  const fields = getFieldsForType(docType);
  const mask = buildPickMask(fields);
  return glossaryExtractionSchema(investorNames, investorFunds).pick(mask);
}

// Static schemas for type inference (using null for investorNames)
export const spaExtractionSchema = createSchemaForType('spa', null, null);
export type SpaExtraction = z.infer<typeof spaExtractionSchema>;

export const coiExtractionSchema = createSchemaForType('coi', null, null);
export type CoiExtraction = z.infer<typeof coiExtractionSchema>;

export const iraExtractionSchema = createSchemaForType('ira', null, null);
export type IraExtraction = z.infer<typeof iraExtractionSchema>;

export const sideLetterExtractionSchema = createSchemaForType(
  'side_letter',
  null,
  null,
);
export type SideLetterExtraction = z.infer<typeof sideLetterExtractionSchema>;

export const safeExtractionSchema = createSchemaForType('safe', null, null);
export type SafeExtraction = z.infer<typeof safeExtractionSchema>;

export const cpnExtractionSchema = createSchemaForType('cpn', null, null);
export type CpnExtraction = z.infer<typeof cpnExtractionSchema>;

export const warrantExtractionSchema = createSchemaForType(
  'warrant',
  null,
  null,
);
export type WarrantExtraction = z.infer<typeof warrantExtractionSchema>;

export const termSheetExtractionSchema = createSchemaForType(
  'term_sheet',
  null,
  null,
);
export type TermSheetExtraction = z.infer<typeof termSheetExtractionSchema>;

export const capTableExtractionSchema = createSchemaForType(
  'cap_table',
  null,
  null,
);
export type CapTableExtraction = z.infer<typeof capTableExtractionSchema>;

export const pitchDeckExtractionSchema = createSchemaForType(
  'pitch_deck',
  null,
  null,
);
export type PitchDeckExtraction = z.infer<typeof pitchDeckExtractionSchema>;

export const dueDiligencePackageExtractionSchema = createSchemaForType(
  'due_diligence_package',
  null,
  null,
);
export type DueDiligencePackageExtraction = z.infer<
  typeof dueDiligencePackageExtractionSchema
>;

export const ventureDebtExtractionSchema = createSchemaForType(
  'venture_debt',
  null,
  null,
);
export type VentureDebtExtraction = z.infer<typeof ventureDebtExtractionSchema>;

export const lpaExtractionSchema = createSchemaForType('lpa', null, null);
export type LpaExtraction = z.infer<typeof lpaExtractionSchema>;

export const disclosureScheduleExtractionSchema = createSchemaForType(
  'disclosure_schedule',
  null,
  null,
);
export type DisclosureScheduleExtraction = z.infer<
  typeof disclosureScheduleExtractionSchema
>;

export const boardObserverAgreementExtractionSchema = createSchemaForType(
  'board_observer_agreement',
  null,
  null,
);
export type BoardObserverAgreementExtraction = z.infer<
  typeof boardObserverAgreementExtractionSchema
>;

export const managementRightsLetterExtractionSchema = createSchemaForType(
  'management_rights_letter',
  null,
  null,
);
export type ManagementRightsLetterExtraction = z.infer<
  typeof managementRightsLetterExtractionSchema
>;

export const affiliateTransferExtractionSchema = createSchemaForType(
  'affiliate_transfer',
  null,
  null,
);
export type AffiliateTransferExtraction = z.infer<
  typeof affiliateTransferExtractionSchema
>;

// Factory function to create schemas with investor names for runtime use
export const extractionSchemasByType = (
  investorNames: string[] | null,
  investorFunds: string[] | null,
) =>
  ({
    spa: createSchemaForType('spa', investorNames, investorFunds),
    coi: createSchemaForType('coi', investorNames, investorFunds),
    ira: createSchemaForType('ira', investorNames, investorFunds),
    side_letter: createSchemaForType(
      'side_letter',
      investorNames,
      investorFunds,
    ),
    safe: createSchemaForType('safe', investorNames, investorFunds),
    cpn: createSchemaForType('cpn', investorNames, investorFunds),
    warrant: createSchemaForType('warrant', investorNames, investorFunds),
    voting: createSchemaForType('voting', investorNames, investorFunds),
    rofr_cosale: createSchemaForType(
      'rofr_cosale',
      investorNames,
      investorFunds,
    ),
    amendment: createSchemaForType('amendment', investorNames, investorFunds),
    subscription: createSchemaForType(
      'subscription',
      investorNames,
      investorFunds,
    ),
    kiss: createSchemaForType('kiss', investorNames, investorFunds),
    promissory_note: createSchemaForType(
      'promissory_note',
      investorNames,
      investorFunds,
    ),
    merger_agreement: createSchemaForType(
      'merger_agreement',
      investorNames,
      investorFunds,
    ),
    letter_of_transmittal: createSchemaForType(
      'letter_of_transmittal',
      investorNames,
      investorFunds,
    ),
    secondary_purchase: createSchemaForType(
      'secondary_purchase',
      investorNames,
      investorFunds,
    ),
    schedule_of_investments: createSchemaForType(
      'schedule_of_investments',
      investorNames,
      investorFunds,
    ),
    share_certificate: createSchemaForType(
      'share_certificate',
      investorNames,
      investorFunds,
    ),
    investment_agreement: createSchemaForType(
      'investment_agreement',
      investorNames,
      investorFunds,
    ),
    joinder: createSchemaForType('joinder', investorNames, investorFunds),
    term_sheet: createSchemaForType('term_sheet', investorNames, investorFunds),
    cap_table: createSchemaForType('cap_table', investorNames, investorFunds),
    pitch_deck: createSchemaForType('pitch_deck', investorNames, investorFunds),
    due_diligence_package: createSchemaForType(
      'due_diligence_package',
      investorNames,
      investorFunds,
    ),
    venture_debt: createSchemaForType(
      'venture_debt',
      investorNames,
      investorFunds,
    ),
    lpa: createSchemaForType('lpa', investorNames, investorFunds),
    disclosure_schedule: createSchemaForType(
      'disclosure_schedule',
      investorNames,
      investorFunds,
    ),
    board_observer_agreement: createSchemaForType(
      'board_observer_agreement',
      investorNames,
      investorFunds,
    ),
    management_rights_letter: createSchemaForType(
      'management_rights_letter',
      investorNames,
      investorFunds,
    ),
    affiliate_transfer: createSchemaForType(
      'affiliate_transfer',
      investorNames,
      investorFunds,
    ),
    stock_option_plan: createSchemaForType(
      'stock_option_plan',
      investorNames,
      investorFunds,
    ),
    repurchase_agreement: createSchemaForType(
      'repurchase_agreement',
      investorNames,
      investorFunds,
    ),
  }) as const;
