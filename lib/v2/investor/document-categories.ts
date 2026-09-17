export type VentureDocumentGroupType =
  | 'transaction'
  | 'cap_table'
  | 'supplemental';

const TRANSACTION_DOCUMENT_TYPE_CODES = new Set([
  'amendment',
  'charter',
  'coi',
  'convertible_note',
  'cpn',
  'ira',
  'promissory_note',
  'rofr_cosale',
  'safe',
  'safe_note',
  'side_letter',
  'spa',
  'voting',
  'warrant',
]);

const CAP_TABLE_DOCUMENT_TYPE_CODES = new Set([
  'cap_table',
  'capitalization_table',
]);

const GROUP_TYPE_ALIASES: Record<string, VentureDocumentGroupType> = {
  cap_table: 'cap_table',
  cap_tables: 'cap_table',
  captable: 'cap_table',
  cap_table_documents: 'cap_table',
  capitalization: 'cap_table',
  capitalization_table: 'cap_table',
  capitalization_tables: 'cap_table',
  supplemental: 'supplemental',
  supplemental_documents: 'supplemental',
  transaction: 'transaction',
  transaction_documents: 'transaction',
};

function normalizeDocumentValue(value: string | null | undefined): string {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_') ?? ''
  );
}

export function resolveVentureDocumentGroupType(
  metadataGroupType: string | null | undefined,
  documentTypeCode: string | null | undefined,
): VentureDocumentGroupType {
  const normalizedGroupType = normalizeDocumentValue(metadataGroupType);
  const groupType = GROUP_TYPE_ALIASES[normalizedGroupType];
  if (groupType) return groupType;

  const normalizedTypeCode = normalizeDocumentValue(documentTypeCode);
  if (CAP_TABLE_DOCUMENT_TYPE_CODES.has(normalizedTypeCode)) {
    return 'cap_table';
  }
  if (TRANSACTION_DOCUMENT_TYPE_CODES.has(normalizedTypeCode)) {
    return 'transaction';
  }

  return 'supplemental';
}
