/**
 * Module Document Status constants and types.
 * Maps to the module_document_status_types lookup table.
 */

export const MODULE_DOCUMENT_STATUS_IDS = {
  UPLOADED: 1,
  READY_FOR_EXTRACTION: 2,
  PROCESSING: 3,
  NEEDS_APPROVAL: 4,
  PUBLISHED: 5,
  FAILED: 6,
} as const;

export const MODULE_DOCUMENT_STATUS_CODES = {
  UPLOADED: 'uploaded',
  READY_FOR_EXTRACTION: 'ready_for_extraction',
  PROCESSING: 'processing',
  NEEDS_APPROVAL: 'needs_approval',
  PUBLISHED: 'published',
  FAILED: 'failed',
} as const;

export const MODULE_DOCUMENT_STATUS_NAMES: Record<number, string> = {
  [MODULE_DOCUMENT_STATUS_IDS.UPLOADED]: 'Uploaded',
  [MODULE_DOCUMENT_STATUS_IDS.READY_FOR_EXTRACTION]: 'Ready for extraction',
  [MODULE_DOCUMENT_STATUS_IDS.PROCESSING]: 'Processing',
  [MODULE_DOCUMENT_STATUS_IDS.NEEDS_APPROVAL]: 'Needs approval',
  [MODULE_DOCUMENT_STATUS_IDS.PUBLISHED]: 'Published',
  [MODULE_DOCUMENT_STATUS_IDS.FAILED]: 'Failed',
};

export type ModuleDocumentStatusId =
  (typeof MODULE_DOCUMENT_STATUS_IDS)[keyof typeof MODULE_DOCUMENT_STATUS_IDS];

export type ModuleDocumentStatusCode =
  (typeof MODULE_DOCUMENT_STATUS_CODES)[keyof typeof MODULE_DOCUMENT_STATUS_CODES];
