/**
 * Error codes and user-friendly messages for investor document processing failures.
 * These codes are stored in module_documents.metadata.failure.error.code
 * and mapped to user-friendly messages for display in the UI.
 */

export const INVESTOR_DOCUMENT_ERROR_CODES = {
  // Processing stage errors
  ZIP_EXTRACTION_FAILED: 'ZIP_EXTRACTION_FAILED',
  PDF_SANITIZATION_FAILED: 'PDF_SANITIZATION_FAILED',
  FILE_DOWNLOAD_FAILED: 'FILE_DOWNLOAD_FAILED',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  FILE_SIZE_EXCEEDED: 'FILE_SIZE_EXCEEDED',
  FILE_UPLOAD_FAILED: 'FILE_UPLOAD_FAILED',

  // Document creation errors
  MODULE_NOT_FOUND: 'MODULE_NOT_FOUND',
  DOCUMENT_CREATION_FAILED: 'DOCUMENT_CREATION_FAILED',
  DUPLICATE_FILE: 'DUPLICATE_FILE',

  // Extraction stage errors
  AI_EXTRACTION_FAILED: 'AI_EXTRACTION_FAILED',
  AI_NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
  DOCUMENT_TYPE_NOT_FOUND: 'DOCUMENT_TYPE_NOT_FOUND',
  SCHEMA_NOT_FOUND: 'SCHEMA_NOT_FOUND',
  AIEVALUATION_FAILED: 'AIEVALUATION_FAILED',

  // Company matching errors
  COMPANY_CREATION_FAILED: 'COMPANY_CREATION_FAILED',

  // Entity linking errors
  ENTITY_CREATION_FAILED: 'ENTITY_CREATION_FAILED',
  ENTITY_LINKING_FAILED: 'ENTITY_LINKING_FAILED',

  // Generic
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type InvestorDocumentErrorCode =
  (typeof INVESTOR_DOCUMENT_ERROR_CODES)[keyof typeof INVESTOR_DOCUMENT_ERROR_CODES];

/**
 * User-friendly error messages for each error code.
 * These are displayed to users in the UI tooltip.
 */
export const INVESTOR_DOCUMENT_ERROR_MESSAGES: Record<string, string> = {
  [INVESTOR_DOCUMENT_ERROR_CODES.ZIP_EXTRACTION_FAILED]:
    'Unable to extract files from the ZIP archive',
  [INVESTOR_DOCUMENT_ERROR_CODES.PDF_SANITIZATION_FAILED]:
    'The PDF file could not be processed',
  [INVESTOR_DOCUMENT_ERROR_CODES.FILE_DOWNLOAD_FAILED]:
    'The file could not be retrieved',
  [INVESTOR_DOCUMENT_ERROR_CODES.UNSUPPORTED_FILE_TYPE]:
    'This file type is not supported',
  [INVESTOR_DOCUMENT_ERROR_CODES.FILE_SIZE_EXCEEDED]:
    'File exceeds the 50MB size limit',
  [INVESTOR_DOCUMENT_ERROR_CODES.FILE_UPLOAD_FAILED]:
    'The file could not be uploaded',
  [INVESTOR_DOCUMENT_ERROR_CODES.MODULE_NOT_FOUND]:
    'System configuration error occurred',
  [INVESTOR_DOCUMENT_ERROR_CODES.DOCUMENT_CREATION_FAILED]:
    'Unable to save the document',
  [INVESTOR_DOCUMENT_ERROR_CODES.DUPLICATE_FILE]:
    'This file has already been uploaded',
  [INVESTOR_DOCUMENT_ERROR_CODES.AI_EXTRACTION_FAILED]:
    'Unable to analyze document contents',
  [INVESTOR_DOCUMENT_ERROR_CODES.AI_NOT_CONFIGURED]:
    'Document analysis service is not available',
  [INVESTOR_DOCUMENT_ERROR_CODES.DOCUMENT_TYPE_NOT_FOUND]:
    'Could not determine document type',
  [INVESTOR_DOCUMENT_ERROR_CODES.SCHEMA_NOT_FOUND]:
    'This document type is not supported for extraction',
  [INVESTOR_DOCUMENT_ERROR_CODES.COMPANY_CREATION_FAILED]:
    'Unable to create company record',
  [INVESTOR_DOCUMENT_ERROR_CODES.ENTITY_CREATION_FAILED]:
    'Unable to create investment record',
  [INVESTOR_DOCUMENT_ERROR_CODES.ENTITY_LINKING_FAILED]:
    'Unable to link document to investment',
  [INVESTOR_DOCUMENT_ERROR_CODES.UNKNOWN_ERROR]: 'An unexpected error occurred',
  [INVESTOR_DOCUMENT_ERROR_CODES.AIEVALUATION_FAILED]:
    'AI evaluation failed - no portfolio company or fund found',
};

/**
 * Returns a user-friendly error message for the given error code.
 * Falls back to "An unexpected error occurred" for unknown codes.
 *
 * @param errorCode - The error code from failure metadata
 * @returns User-friendly error message
 */
export function getUserFriendlyErrorMessage(errorCode?: string | null): string {
  if (!errorCode) {
    return INVESTOR_DOCUMENT_ERROR_MESSAGES[
      INVESTOR_DOCUMENT_ERROR_CODES.UNKNOWN_ERROR
    ];
  }
  return (
    INVESTOR_DOCUMENT_ERROR_MESSAGES[errorCode] ??
    INVESTOR_DOCUMENT_ERROR_MESSAGES[
      INVESTOR_DOCUMENT_ERROR_CODES.UNKNOWN_ERROR
    ]
  );
}

/**
 * Failure stages in the investor document processing pipeline.
 */
export const INVESTOR_DOCUMENT_FAILURE_STAGES = {
  PROCESSING: 'processing',
  DOCUMENT_CREATION: 'document_creation',
  EXTRACTION: 'extraction',
  COMPANY_MATCHING: 'company_matching',
  ENTITY_LINKING: 'entity_linking',
} as const;

export type InvestorDocumentFailureStage =
  (typeof INVESTOR_DOCUMENT_FAILURE_STAGES)[keyof typeof INVESTOR_DOCUMENT_FAILURE_STAGES];
