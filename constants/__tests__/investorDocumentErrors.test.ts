import {
  getUserFriendlyErrorMessage,
  INVESTOR_DOCUMENT_ERROR_CODES,
  INVESTOR_DOCUMENT_ERROR_MESSAGES,
} from '../investorDocumentErrors';

describe('investorDocumentErrors', () => {
  describe('getUserFriendlyErrorMessage', () => {
    it('returns correct message for ZIP_EXTRACTION_FAILED', () => {
      expect(
        getUserFriendlyErrorMessage(
          INVESTOR_DOCUMENT_ERROR_CODES.ZIP_EXTRACTION_FAILED,
        ),
      ).toBe('Unable to extract files from the ZIP archive');
    });

    it('returns correct message for PDF_SANITIZATION_FAILED', () => {
      expect(
        getUserFriendlyErrorMessage(
          INVESTOR_DOCUMENT_ERROR_CODES.PDF_SANITIZATION_FAILED,
        ),
      ).toBe('The PDF file could not be processed');
    });

    it('returns correct message for FILE_DOWNLOAD_FAILED', () => {
      expect(
        getUserFriendlyErrorMessage(
          INVESTOR_DOCUMENT_ERROR_CODES.FILE_DOWNLOAD_FAILED,
        ),
      ).toBe('The file could not be retrieved');
    });

    it('returns correct message for UNSUPPORTED_FILE_TYPE', () => {
      expect(
        getUserFriendlyErrorMessage(
          INVESTOR_DOCUMENT_ERROR_CODES.UNSUPPORTED_FILE_TYPE,
        ),
      ).toBe('This file type is not supported');
    });

    it('returns correct message for AI_EXTRACTION_FAILED', () => {
      expect(
        getUserFriendlyErrorMessage(
          INVESTOR_DOCUMENT_ERROR_CODES.AI_EXTRACTION_FAILED,
        ),
      ).toBe('Unable to analyze document contents');
    });

    it('returns correct message for AI_NOT_CONFIGURED', () => {
      expect(
        getUserFriendlyErrorMessage(
          INVESTOR_DOCUMENT_ERROR_CODES.AI_NOT_CONFIGURED,
        ),
      ).toBe('Document analysis service is not available');
    });

    it('returns correct message for DOCUMENT_TYPE_NOT_FOUND', () => {
      expect(
        getUserFriendlyErrorMessage(
          INVESTOR_DOCUMENT_ERROR_CODES.DOCUMENT_TYPE_NOT_FOUND,
        ),
      ).toBe('Could not determine document type');
    });

    it('returns correct message for SCHEMA_NOT_FOUND', () => {
      expect(
        getUserFriendlyErrorMessage(
          INVESTOR_DOCUMENT_ERROR_CODES.SCHEMA_NOT_FOUND,
        ),
      ).toBe('This document type is not supported for extraction');
    });

    it('returns correct message for COMPANY_CREATION_FAILED', () => {
      expect(
        getUserFriendlyErrorMessage(
          INVESTOR_DOCUMENT_ERROR_CODES.COMPANY_CREATION_FAILED,
        ),
      ).toBe('Unable to create company record');
    });

    it('returns correct message for ENTITY_CREATION_FAILED', () => {
      expect(
        getUserFriendlyErrorMessage(
          INVESTOR_DOCUMENT_ERROR_CODES.ENTITY_CREATION_FAILED,
        ),
      ).toBe('Unable to create investment record');
    });

    it('returns correct message for ENTITY_LINKING_FAILED', () => {
      expect(
        getUserFriendlyErrorMessage(
          INVESTOR_DOCUMENT_ERROR_CODES.ENTITY_LINKING_FAILED,
        ),
      ).toBe('Unable to link document to investment');
    });

    it('returns correct message for MODULE_NOT_FOUND', () => {
      expect(
        getUserFriendlyErrorMessage(
          INVESTOR_DOCUMENT_ERROR_CODES.MODULE_NOT_FOUND,
        ),
      ).toBe('System configuration error occurred');
    });

    it('returns correct message for DOCUMENT_CREATION_FAILED', () => {
      expect(
        getUserFriendlyErrorMessage(
          INVESTOR_DOCUMENT_ERROR_CODES.DOCUMENT_CREATION_FAILED,
        ),
      ).toBe('Unable to save the document');
    });

    it('returns correct message for DUPLICATE_FILE', () => {
      expect(
        getUserFriendlyErrorMessage(
          INVESTOR_DOCUMENT_ERROR_CODES.DUPLICATE_FILE,
        ),
      ).toBe('This file has already been uploaded');
    });

    it('returns correct message for UNKNOWN_ERROR', () => {
      expect(
        getUserFriendlyErrorMessage(
          INVESTOR_DOCUMENT_ERROR_CODES.UNKNOWN_ERROR,
        ),
      ).toBe('An unexpected error occurred');
    });

    it('returns "An unexpected error occurred" for unknown error codes', () => {
      expect(getUserFriendlyErrorMessage('SOME_UNKNOWN_CODE')).toBe(
        'An unexpected error occurred',
      );
    });

    it('returns "An unexpected error occurred" for undefined input', () => {
      expect(getUserFriendlyErrorMessage(undefined)).toBe(
        'An unexpected error occurred',
      );
    });

    it('returns "An unexpected error occurred" for null input', () => {
      expect(getUserFriendlyErrorMessage(null)).toBe(
        'An unexpected error occurred',
      );
    });

    it('returns "An unexpected error occurred" for empty string', () => {
      expect(getUserFriendlyErrorMessage('')).toBe(
        'An unexpected error occurred',
      );
    });
  });

  describe('INVESTOR_DOCUMENT_ERROR_MESSAGES', () => {
    it('has a message for every error code', () => {
      const errorCodes = Object.values(INVESTOR_DOCUMENT_ERROR_CODES);
      errorCodes.forEach((code) => {
        expect(INVESTOR_DOCUMENT_ERROR_MESSAGES[code]).toBeDefined();
        expect(typeof INVESTOR_DOCUMENT_ERROR_MESSAGES[code]).toBe('string');
        expect(INVESTOR_DOCUMENT_ERROR_MESSAGES[code].length).toBeGreaterThan(
          0,
        );
      });
    });
  });
});
