import {
  INVESTOR_DOCUMENT_ERROR_CODES,
  type InvestorDocumentErrorCode,
} from '@/constants/investorDocumentErrors';

/**
 * Maps an error to an appropriate error code based on error type and message.
 */
export function mapErrorToCode(error: unknown): InvestorDocumentErrorCode {
  if (!(error instanceof Error)) {
    return INVESTOR_DOCUMENT_ERROR_CODES.UNKNOWN_ERROR;
  }

  const errorName = error.name.toLowerCase();
  const errorMessage = error.message.toLowerCase();

  // Check for specific error types
  if (errorName === 'validationerror') {
    if (
      errorMessage.includes('ai extraction') ||
      errorMessage.includes('extraction failed')
    ) {
      return INVESTOR_DOCUMENT_ERROR_CODES.AI_EXTRACTION_FAILED;
    }
    if (
      errorMessage.includes('vertex ai') ||
      errorMessage.includes('not configured')
    ) {
      return INVESTOR_DOCUMENT_ERROR_CODES.AI_NOT_CONFIGURED;
    }
    if (errorMessage.includes('document type')) {
      return INVESTOR_DOCUMENT_ERROR_CODES.DOCUMENT_TYPE_NOT_FOUND;
    }
    if (errorMessage.includes('schema') || errorMessage.includes('type code')) {
      return INVESTOR_DOCUMENT_ERROR_CODES.SCHEMA_NOT_FOUND;
    }
    if (errorMessage.includes('module')) {
      return INVESTOR_DOCUMENT_ERROR_CODES.MODULE_NOT_FOUND;
    }
  }

  if (errorName === 'databaseerror') {
    if (errorMessage.includes('download')) {
      return INVESTOR_DOCUMENT_ERROR_CODES.FILE_DOWNLOAD_FAILED;
    }
    if (errorMessage.includes('upload')) {
      return INVESTOR_DOCUMENT_ERROR_CODES.FILE_UPLOAD_FAILED;
    }
    if (
      errorMessage.includes('company') ||
      errorMessage.includes('create company')
    ) {
      return INVESTOR_DOCUMENT_ERROR_CODES.COMPANY_CREATION_FAILED;
    }
    if (errorMessage.includes('entity')) {
      if (errorMessage.includes('link')) {
        return INVESTOR_DOCUMENT_ERROR_CODES.ENTITY_LINKING_FAILED;
      }
      return INVESTOR_DOCUMENT_ERROR_CODES.ENTITY_CREATION_FAILED;
    }
    if (errorMessage.includes('document')) {
      return INVESTOR_DOCUMENT_ERROR_CODES.DOCUMENT_CREATION_FAILED;
    }
    if (errorMessage.includes('evaluation')) {
      return INVESTOR_DOCUMENT_ERROR_CODES.AIEVALUATION_FAILED;
    }
  }

  // Check message patterns regardless of error type
  if (errorMessage.includes('zip')) {
    return INVESTOR_DOCUMENT_ERROR_CODES.ZIP_EXTRACTION_FAILED;
  }
  if (
    errorMessage.includes('pdf') &&
    (errorMessage.includes('sanitiz') || errorMessage.includes('process'))
  ) {
    return INVESTOR_DOCUMENT_ERROR_CODES.PDF_SANITIZATION_FAILED;
  }
  if (
    errorMessage.includes('unsupported') &&
    errorMessage.includes('file type')
  ) {
    return INVESTOR_DOCUMENT_ERROR_CODES.UNSUPPORTED_FILE_TYPE;
  }

  return INVESTOR_DOCUMENT_ERROR_CODES.UNKNOWN_ERROR;
}
