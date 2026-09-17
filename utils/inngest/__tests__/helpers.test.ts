import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { mapErrorToCode } from '../utils';
import { INVESTOR_DOCUMENT_ERROR_CODES } from '@/constants/investorDocumentErrors';

const singleResult = () => ({ data: { metadata: {} }, error: null });
const selectChain = () => ({ eq: () => ({ single: singleResult }) });
const mockUpdate = jest.fn(() => ({ eq: () => ({ error: null }) }));
const mockFrom = jest.fn(() => ({ select: selectChain, update: mockUpdate }));

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: jest.fn(() => ({ from: mockFrom })),
}));

const mockLogAlert = jest.fn();
jest.mock('@/utils/logging/alert', () => ({
  logAlert: (...args: unknown[]) => mockLogAlert(...args),
}));

const mockSendResendEmail = jest.fn();
jest.mock('@/app/lib/actions', () => ({
  sendResendEmail: (...args: unknown[]) => mockSendResendEmail(...args),
}));

jest.mock('@/utils/pino', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// eslint-disable-next-line import/first
import { handleContractProcessingFailure } from '../helpers';

const buildEvent = () => ({
  data: {
    event: {
      name: 'contracts/extractcontract',
      data: { fileName: 'deal.pdf', contractId: 42 },
      user: { id: 'user-1', organizationId: 'org-1' },
    },
    run_id: 'run-1',
  },
});

const buildEventWithoutUser = () => {
  const { user: _user, ...eventWithoutUser } = buildEvent().data.event;
  return { data: { event: eventWithoutUser, run_id: 'run-1' } };
};

const expectedContext = {
  processName: 'contracts/extractcontract',
  contractId: 42,
  fileName: 'deal.pdf',
  userId: 'user-1',
  organizationId: 'org-1',
  runId: 'run-1',
};

describe('handleContractProcessingFailure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emits exactly one contract-processing-failure alert with full context', async () => {
    const error = new Error('boom');

    await handleContractProcessingFailure({ error, event: buildEvent() });

    expect(mockLogAlert).toHaveBeenCalledTimes(1);
    expect(mockLogAlert).toHaveBeenCalledWith(
      'contract-processing-failure',
      error,
      expectedContext,
      'Contract processing failed',
    );
  });

  it('emits the alert without user context when the event has no user', async () => {
    const error = new Error('boom');

    await handleContractProcessingFailure({
      error,
      event: buildEventWithoutUser(),
    });

    expect(mockLogAlert).toHaveBeenCalledTimes(1);
    expect(mockLogAlert).toHaveBeenCalledWith(
      'contract-processing-failure',
      error,
      { ...expectedContext, userId: undefined, organizationId: undefined },
      'Contract processing failed',
    );
  });

  it('does not send any email', async () => {
    await handleContractProcessingFailure({
      error: new Error('boom'),
      event: buildEvent(),
    });

    expect(mockSendResendEmail).not.toHaveBeenCalled();
  });

  it('still persists failure metadata to the contract', async () => {
    await handleContractProcessingFailure({
      error: new Error('boom'),
      event: buildEvent(),
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [updatePayload] = mockUpdate.mock.calls[0] as unknown as [
      { metadata: { failure: unknown } },
    ];
    expect(updatePayload.metadata).toHaveProperty('failure');
  });
});

describe('Inngest helpers', () => {
  describe('mapErrorToCode', () => {
    describe('ValidationError mapping', () => {
      it('maps AI extraction errors to AI_EXTRACTION_FAILED', () => {
        const error = new Error('AI extraction failed for document');
        error.name = 'ValidationError';
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.AI_EXTRACTION_FAILED,
        );
      });

      it('maps extraction failed message to AI_EXTRACTION_FAILED', () => {
        const error = new Error('Extraction failed during processing');
        error.name = 'ValidationError';
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.AI_EXTRACTION_FAILED,
        );
      });

      it('maps Vertex AI configuration errors to AI_NOT_CONFIGURED', () => {
        const error = new Error('Vertex AI is not configured');
        error.name = 'ValidationError';
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.AI_NOT_CONFIGURED,
        );
      });

      it('maps document type errors to DOCUMENT_TYPE_NOT_FOUND', () => {
        const error = new Error('Document type could not be determined');
        error.name = 'ValidationError';
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.DOCUMENT_TYPE_NOT_FOUND,
        );
      });

      it('maps schema errors to SCHEMA_NOT_FOUND', () => {
        const error = new Error('Schema not found for type code');
        error.name = 'ValidationError';
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.SCHEMA_NOT_FOUND,
        );
      });

      it('maps module errors to MODULE_NOT_FOUND', () => {
        const error = new Error('Module not found in configuration');
        error.name = 'ValidationError';
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.MODULE_NOT_FOUND,
        );
      });
    });

    describe('DatabaseError mapping', () => {
      it('maps download errors to FILE_DOWNLOAD_FAILED', () => {
        const error = new Error('Failed to download file from storage');
        error.name = 'DatabaseError';
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.FILE_DOWNLOAD_FAILED,
        );
      });

      it('maps upload errors to FILE_UPLOAD_FAILED', () => {
        const error = new Error('Failed to upload file to storage');
        error.name = 'DatabaseError';
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.FILE_UPLOAD_FAILED,
        );
      });

      it('maps company creation errors to COMPANY_CREATION_FAILED', () => {
        const error = new Error('Failed to create company record');
        error.name = 'DatabaseError';
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.COMPANY_CREATION_FAILED,
        );
      });

      it('maps entity link errors to ENTITY_LINKING_FAILED', () => {
        const error = new Error('Failed to link entity to document');
        error.name = 'DatabaseError';
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.ENTITY_LINKING_FAILED,
        );
      });

      it('maps entity creation errors to ENTITY_CREATION_FAILED', () => {
        const error = new Error('Failed to create entity record');
        error.name = 'DatabaseError';
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.ENTITY_CREATION_FAILED,
        );
      });

      it('maps document creation errors to DOCUMENT_CREATION_FAILED', () => {
        const error = new Error('Failed to create module document');
        error.name = 'DatabaseError';
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.DOCUMENT_CREATION_FAILED,
        );
      });
    });

    describe('message-based mapping (any error type)', () => {
      it('maps ZIP errors to ZIP_EXTRACTION_FAILED', () => {
        const error = new Error('Failed to extract ZIP archive');
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.ZIP_EXTRACTION_FAILED,
        );
      });

      it('maps PDF sanitization errors to PDF_SANITIZATION_FAILED', () => {
        const error = new Error('PDF sanitization failed');
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.PDF_SANITIZATION_FAILED,
        );
      });

      it('maps PDF processing errors to PDF_SANITIZATION_FAILED', () => {
        const error = new Error('Failed to process PDF file');
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.PDF_SANITIZATION_FAILED,
        );
      });

      it('maps unsupported file type errors to UNSUPPORTED_FILE_TYPE', () => {
        const error = new Error('Unsupported file type: image/png');
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.UNSUPPORTED_FILE_TYPE,
        );
      });
    });

    describe('fallback cases', () => {
      it('returns UNKNOWN_ERROR for non-Error objects', () => {
        expect(mapErrorToCode('string error')).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.UNKNOWN_ERROR,
        );
        expect(mapErrorToCode(null)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.UNKNOWN_ERROR,
        );
        expect(mapErrorToCode(undefined)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.UNKNOWN_ERROR,
        );
        expect(mapErrorToCode({ message: 'object error' })).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.UNKNOWN_ERROR,
        );
      });

      it('returns UNKNOWN_ERROR for generic errors', () => {
        const error = new Error('Something went wrong');
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.UNKNOWN_ERROR,
        );
      });

      it('returns UNKNOWN_ERROR for unrecognized error types', () => {
        const error = new Error('Random error message');
        error.name = 'CustomError';
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.UNKNOWN_ERROR,
        );
      });
    });

    describe('case insensitivity', () => {
      it('handles uppercase error names', () => {
        const error = new Error('AI extraction failed');
        error.name = 'VALIDATIONERROR';
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.AI_EXTRACTION_FAILED,
        );
      });

      it('handles uppercase error messages', () => {
        const error = new Error('ZIP EXTRACTION FAILED');
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.ZIP_EXTRACTION_FAILED,
        );
      });

      it('handles mixed case', () => {
        const error = new Error('Failed to Process PDF Document');
        expect(mapErrorToCode(error)).toBe(
          INVESTOR_DOCUMENT_ERROR_CODES.PDF_SANITIZATION_FAILED,
        );
      });
    });
  });
});
