import { cache } from 'react';
import { createClient } from '@/utils/supabase/server';
import { getUserMetadata } from '@/data/users';
import logger from '@/utils/pino';
import { ValidationError, DatabaseError } from '@/lib/errors';
import { v4 as uuidv4 } from 'uuid';
import { MODULE_DOCUMENT_STATUS_IDS } from '@/constants/moduleDocumentStatuses';
import { getUserFriendlyErrorMessage } from '@/constants/investorDocumentErrors';
import type { VentureDocumentFailureInfo } from '@/lib/v2/inv/types';
import { GRANULAR_STAGES } from '@/lib/v2/inv/stage-utils';
import {
  resolveVentureDocumentGroupType,
  type VentureDocumentGroupType,
} from './document-categories';

const INVESTOR_MODULE_CODE = 'investor';

export interface VentureDocumentSummary {
  hasDocuments: boolean;
  documentCount: number;
}

export interface VentureDocumentSummaryResult {
  summary: VentureDocumentSummary;
}

/**
 * Check if the organization has any venture module documents.
 * Returns a summary with document count for the venture module.
 * Cached per request for deduplication.
 */
export const getVentureDocumentSummary = cache(
  async (): Promise<VentureDocumentSummaryResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      logger.warn('No user metadata found for venture document summary');
      return { summary: { hasDocuments: false, documentCount: 0 } };
    }

    const supabase = await createClient();

    try {
      const { data: moduleData, error: moduleError } = await supabase
        .from('app_modules')
        .select('id')
        .eq('code', INVESTOR_MODULE_CODE)
        .single();

      if (moduleError || !moduleData) {
        logger.warn({ error: moduleError }, 'Venture module not found');
        return { summary: { hasDocuments: false, documentCount: 0 } };
      }

      const { count, error: countError } = await supabase
        .from('module_documents')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', userMetadata.organizationId)
        .eq('module_id', moduleData.id)
        .eq('is_deleted', false);

      if (countError) {
        logger.error(
          { error: countError, organizationId: userMetadata.organizationId },
          'Failed to count venture documents',
        );
        throw countError;
      }

      const documentCount = count ?? 0;

      logger.info(
        {
          organizationId: userMetadata.organizationId,
          moduleId: moduleData.id,
          documentCount,
        },
        'Venture document summary retrieved',
      );

      return {
        summary: {
          hasDocuments: documentCount > 0,
          documentCount,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Error fetching venture document summary');
      return { summary: { hasDocuments: false, documentCount: 0 } };
    }
  },
);

// =============================================================================
// VENTURE DOCUMENTS
// =============================================================================

const STAGE_DISPLAY: Record<string, string> = {
  pre_seed: 'Pre-Seed',
  seed: 'Seed',
  series_seed: 'Series Seed',
  series_a: 'Series A',
  series_b: 'Series B',
  series_c: 'Series C',
  series_d: 'Series D',
  series_e: 'Series E',
  series_f: 'Series F',
  series_g: 'Series G',
  post_ipo: 'IPO',
  convertible_note: 'Convertible',
  grant: 'Grant',
  private_equity: 'Private Equity',
  other: 'Other',
  ...Object.fromEntries(
    GRANULAR_STAGES.map(({ code, display }) => [code, display]),
  ),
};

function extractStageFromDocument(
  extractions: { raw_extraction: Record<string, unknown> }[] | null,
): string | null {
  if (!extractions || extractions.length === 0) return null;
  const raw = extractions[0].raw_extraction;
  const stageValue =
    (raw.funding_round_participating as string | null) ??
    (raw.stage as string | null);
  if (!stageValue) return null;
  return STAGE_DISPLAY[stageValue] ?? stageValue;
}

export interface VentureDocumentFile {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number | null;
  fileType: string | null;
}

export interface VentureDocumentRow {
  id: string;
  name: string;
  year: string | null;
  period: string;
  submittedOn: string;
  submittedBy: string;
  status: 'INVALID' | 'PROCESSING' | 'COMPLETE' | 'FAILED' | 'UPLOADED';
  isPublished: boolean;
  investment: {
    id: string;
    name: string;
    domain?: string;
  } | null;
  documentType: string;
  documentTypeCode: string;
  documentGroupType: VentureDocumentGroupType;
  stage: string | null;
  files: VentureDocumentFile[];
  failureInfo?: VentureDocumentFailureInfo; // Present when status is FAILED
}

export interface VentureDocumentsResult {
  documents: VentureDocumentRow[];
}

/**
 * Get venture documents for a specific portfolio company entity.
 * Returns documents linked to the entity via entity_id.
 */
export const getEntityDocuments = cache(
  async (entityPublicId: string): Promise<VentureDocumentsResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      logger.warn('No user metadata found for entity documents fetch');
      return { documents: [] };
    }

    const supabase = await createClient();

    try {
      const { data: entityData, error: entityError } = await supabase
        .from('module_entities')
        .select('id')
        .eq('public_id', entityPublicId)
        .eq('organization_id', userMetadata.organizationId)
        .single();

      if (entityError || !entityData) {
        logger.warn({ entityPublicId, error: entityError }, 'Entity not found');
        return { documents: [] };
      }

      const entityId = entityData.id;

      const { data: documentsData, error: docsError } = await supabase
        .from('module_documents')
        .select(
          `
          id,
          created_at,
          status_id,
          ai_extraction_status,
          metadata,
          user_id,
          users!module_documents_user_id_fkey (
            name
          ),
          document_types!module_documents_document_type_id_fkey (
            name,
            code
          ),
          module_document_status_types!module_documents_status_id_fkey (
            code
          ),
          module_document_files (
            id,
            public_id,
            file_name,
            file_path,
            file_size,
            file_type,
            is_deleted
          ),
          module_document_extractions (
            raw_extraction
          )
        `,
        )
        .eq('entity_id', entityId)
        .eq('organization_id', userMetadata.organizationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (docsError) {
        logger.error({ error: docsError }, 'Failed to fetch entity documents');
        throw docsError;
      }

      type RawDocumentFile = {
        id: number;
        public_id: string | null;
        file_name: string;
        file_path: string;
        file_size: number | null;
        file_type: string | null;
        is_deleted: boolean | null;
      };

      type RawDocument = {
        id: number;
        created_at: string;
        status_id: number | null;
        ai_extraction_status: string | null;
        metadata: { original_filename?: string } | null;
        user_id: string;
        users: { name: string } | null;
        document_types: { name: string; code: string } | null;
        module_document_status_types: { code: string } | null;
        module_document_files: RawDocumentFile[] | null;
        module_document_extractions:
          | { raw_extraction: Record<string, unknown> }[]
          | null;
      };

      const rawDocs = documentsData as unknown as RawDocument[] | null;

      const mapStatus = (
        statusCode: string | null,
        failureStage?: string,
      ): 'INVALID' | 'PROCESSING' | 'COMPLETE' | 'FAILED' | 'UPLOADED' => {
        switch (statusCode) {
          case 'published':
          case 'needs_approval':
            return 'COMPLETE';
          case 'uploaded':
          case 'ready_for_extraction':
          case 'processing':
            return 'UPLOADED';
          case 'failed':
            if (failureStage === 'document_creation') {
              return 'FAILED';
            }
            return 'UPLOADED';
          default:
            return 'UPLOADED';
        }
      };

      const documents: VentureDocumentRow[] =
        rawDocs?.map((doc) => {
          const metadata = doc.metadata as {
            original_filename?: string;
            year?: number;
            period?: string;
            document_group_type?: string;
            document_year?: number;
            failure?: {
              occurred_at?: string;
              stage?: string;
              error?: {
                code?: string;
              };
            };
          } | null;

          const files: VentureDocumentFile[] =
            doc.module_document_files
              ?.filter((f) => !f.is_deleted)
              .map((f) => ({
                id: f.public_id ?? String(f.id),
                fileName: f.file_name,
                filePath: f.file_path,
                fileSize: f.file_size,
                fileType: f.file_type,
              })) ?? [];

          // Use first file name if available, otherwise fall back to metadata or doc type
          const documentName =
            files[0]?.fileName ??
            metadata?.original_filename ??
            doc.document_types?.name ??
            'Untitled Document';

          const statusCode = doc.module_document_status_types?.code ?? null;

          // Extract failure info if present
          let failureInfo: VentureDocumentFailureInfo | undefined;
          if (metadata?.failure) {
            failureInfo = {
              message: getUserFriendlyErrorMessage(
                metadata.failure.error?.code,
              ),
              stage: metadata.failure.stage ?? 'unknown',
              occurredAt: metadata.failure.occurred_at ?? doc.created_at,
            };
          }

          return {
            id: String(doc.id),
            name: documentName,
            year:
              metadata?.document_year != null
                ? String(metadata.document_year)
                : metadata?.year != null
                  ? String(metadata.year)
                  : null,
            period: metadata?.period ?? '',
            submittedOn: doc.created_at,
            submittedBy: doc.users?.name ?? 'Unknown',
            status: mapStatus(statusCode, metadata?.failure?.stage),
            isPublished: statusCode === 'published',
            investment: null, // Not needed for entity-specific view
            documentType: doc.document_types?.name ?? 'Unknown',
            documentTypeCode: doc.document_types?.code ?? 'unknown',
            documentGroupType: resolveVentureDocumentGroupType(
              metadata?.document_group_type,
              doc.document_types?.code,
            ),
            stage: extractStageFromDocument(doc.module_document_extractions),
            files,
            failureInfo,
          };
        }) ?? [];

      logger.info(
        { entityPublicId, documentCount: documents.length },
        'Entity documents fetched successfully',
      );

      return { documents };
    } catch (error) {
      logger.error(
        { error, entityPublicId },
        'Error fetching entity documents',
      );
      return { documents: [] };
    }
  },
);

/**
 * Get venture documents for a specific portfolio company by inv_company.id.
 * Queries module_documents directly via company_id FK — no module_entities lookup needed.
 */
export const getCompanyDocuments = cache(
  async (companyId: number): Promise<VentureDocumentsResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      logger.warn('No user metadata found for company documents fetch');
      return { documents: [] };
    }

    const supabase = await createClient();

    try {
      const { data: documentsData, error: docsError } = await supabase
        .from('module_documents')
        .select(
          `
          id,
          created_at,
          status_id,
          ai_extraction_status,
          metadata,
          user_id,
          users!module_documents_user_id_fkey (
            name
          ),
          document_types!module_documents_document_type_id_fkey (
            name,
            code
          ),
          module_document_status_types!module_documents_status_id_fkey (
            code
          ),
          module_document_files (
            id,
            public_id,
            file_name,
            file_path,
            file_size,
            file_type,
            is_deleted
          ),
          module_document_extractions (
            raw_extraction
          )
        `,
        )
        .eq('company_id', companyId)
        .eq('organization_id', userMetadata.organizationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (docsError) {
        logger.error(
          { error: docsError, companyId },
          'Failed to fetch company documents',
        );
        throw docsError;
      }

      type RawDocumentFile = {
        id: number;
        public_id: string | null;
        file_name: string;
        file_path: string;
        file_size: number | null;
        file_type: string | null;
        is_deleted: boolean | null;
      };

      type RawDocument = {
        id: number;
        created_at: string;
        status_id: number | null;
        ai_extraction_status: string | null;
        metadata: { original_filename?: string } | null;
        user_id: string;
        users: { name: string } | null;
        document_types: { name: string; code: string } | null;
        module_document_status_types: { code: string } | null;
        module_document_files: RawDocumentFile[] | null;
        module_document_extractions:
          | { raw_extraction: Record<string, unknown> }[]
          | null;
      };

      const rawDocs = documentsData as unknown as RawDocument[] | null;

      const mapStatus = (
        statusCode: string | null,
        failureStage?: string,
      ): 'INVALID' | 'PROCESSING' | 'COMPLETE' | 'FAILED' | 'UPLOADED' => {
        switch (statusCode) {
          case 'published':
          case 'needs_approval':
            return 'COMPLETE';
          case 'uploaded':
          case 'ready_for_extraction':
          case 'processing':
            return 'UPLOADED';
          case 'failed':
            if (failureStage === 'document_creation') {
              return 'FAILED';
            }
            return 'UPLOADED';
          default:
            return 'UPLOADED';
        }
      };

      const documents: VentureDocumentRow[] =
        rawDocs?.map((doc) => {
          const metadata = doc.metadata as {
            original_filename?: string;
            year?: number;
            period?: string;
            document_group_type?: string;
            document_year?: number;
            failure?: {
              occurred_at?: string;
              stage?: string;
              error?: {
                code?: string;
              };
            };
          } | null;

          const files: VentureDocumentFile[] =
            doc.module_document_files
              ?.filter((f) => !f.is_deleted)
              .map((f) => ({
                id: f.public_id ?? String(f.id),
                fileName: f.file_name,
                filePath: f.file_path,
                fileSize: f.file_size,
                fileType: f.file_type,
              })) ?? [];

          const documentName =
            files[0]?.fileName ??
            metadata?.original_filename ??
            doc.document_types?.name ??
            'Untitled Document';

          const statusCode = doc.module_document_status_types?.code ?? null;

          let failureInfo: VentureDocumentFailureInfo | undefined;
          if (metadata?.failure) {
            failureInfo = {
              message: getUserFriendlyErrorMessage(
                metadata.failure.error?.code,
              ),
              stage: metadata.failure.stage ?? 'unknown',
              occurredAt: metadata.failure.occurred_at ?? doc.created_at,
            };
          }

          return {
            id: String(doc.id),
            name: documentName,
            year:
              metadata?.document_year != null
                ? String(metadata.document_year)
                : metadata?.year != null
                  ? String(metadata.year)
                  : null,
            period: metadata?.period ?? '',
            submittedOn: doc.created_at,
            submittedBy: doc.users?.name ?? 'Unknown',
            status: mapStatus(statusCode, metadata?.failure?.stage),
            isPublished: statusCode === 'published',
            investment: null,
            documentType: doc.document_types?.name ?? 'Unknown',
            documentTypeCode: doc.document_types?.code ?? 'unknown',
            documentGroupType: resolveVentureDocumentGroupType(
              metadata?.document_group_type,
              doc.document_types?.code,
            ),
            stage: extractStageFromDocument(doc.module_document_extractions),
            files,
            failureInfo,
          };
        }) ?? [];

      logger.info(
        { companyId, documentCount: documents.length },
        'Company documents fetched successfully',
      );

      return { documents };
    } catch (error) {
      logger.error({ error, companyId }, 'Error fetching company documents');
      return { documents: [] };
    }
  },
);

/**
 * Get all venture documents for the current organization.
 * Returns documents with their associated portfolio company (investment) info.
 * Cached per request for deduplication.
 */
export const getVentureDocuments = cache(
  async (): Promise<VentureDocumentsResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      logger.warn('No user metadata found for venture documents fetch');
      return { documents: [] };
    }

    const supabase = await createClient();

    try {
      const { data: moduleData, error: moduleError } = await supabase
        .from('app_modules')
        .select('id')
        .eq('code', INVESTOR_MODULE_CODE)
        .single();

      if (moduleError || !moduleData) {
        logger.warn({ error: moduleError }, 'Venture module not found');
        return { documents: [] };
      }

      const { data: documentsData, error: docsError } = await supabase
        .from('module_documents')
        .select(
          `
          id,
          public_id,
          created_at,
          status_id,
          ai_extraction_status,
          metadata,
          user_id,
          users!module_documents_user_id_fkey (
            name
          ),
          document_types!module_documents_document_type_id_fkey (
            name,
            code
          ),
          module_document_status_types!module_documents_status_id_fkey (
            code
          ),
          inv_company (
            public_id,
            inv_companies (
              name,
              domain
            )
          ),
          module_document_files (
            id,
            public_id,
            file_name,
            file_path,
            file_size,
            file_type,
            is_deleted
          )
        `,
        )
        .eq('organization_id', userMetadata.organizationId)
        .eq('module_id', moduleData.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (docsError) {
        logger.error({ error: docsError }, 'Failed to fetch venture documents');
        throw docsError;
      }

      type RawDocumentFile = {
        id: number;
        public_id: string | null;
        file_name: string;
        file_path: string;
        file_size: number | null;
        file_type: string | null;
        is_deleted: boolean | null;
      };

      type RawDocument = {
        id: number;
        public_id: string | null;
        created_at: string;
        status_id: number | null;
        ai_extraction_status: string | null;
        metadata: { original_filename?: string } | null;
        user_id: string;
        users: { name: string } | null;
        document_types: { name: string; code: string } | null;
        module_document_status_types: { code: string } | null;
        inv_company: {
          public_id: string;
          inv_companies: { name: string; domain: string | null } | null;
        } | null;
        module_document_files: RawDocumentFile[] | null;
      };

      const rawDocs = documentsData as unknown as RawDocument[] | null;

      const mapStatus = (
        statusCode: string | null,
        failureStage?: string,
      ): 'INVALID' | 'PROCESSING' | 'COMPLETE' | 'FAILED' | 'UPLOADED' => {
        switch (statusCode) {
          case 'published':
          case 'needs_approval':
            return 'COMPLETE';
          case 'uploaded':
          case 'ready_for_extraction':
          case 'processing':
            return 'UPLOADED';
          case 'failed':
            if (failureStage === 'document_creation') {
              return 'FAILED';
            }
            return 'UPLOADED';
          default:
            return 'UPLOADED';
        }
      };

      const documents: VentureDocumentRow[] =
        rawDocs?.map((doc) => {
          const metadata = doc.metadata as {
            original_filename?: string;
            year?: number;
            period?: string;
            document_group_type?: string;
            document_year?: number;
            failure?: {
              occurred_at?: string;
              stage?: string;
              error?: {
                code?: string;
              };
            };
          } | null;

          const files: VentureDocumentFile[] =
            doc.module_document_files
              ?.filter((f) => !f.is_deleted)
              .map((f) => ({
                id: f.public_id ?? String(f.id),
                fileName: f.file_name,
                filePath: f.file_path,
                fileSize: f.file_size,
                fileType: f.file_type,
              })) ?? [];

          // Use first file name if available, otherwise fall back to metadata or doc type
          const documentName =
            files[0]?.fileName ??
            metadata?.original_filename ??
            doc.document_types?.name ??
            'Untitled Document';

          const statusCode = doc.module_document_status_types?.code ?? null;

          // Extract failure info if present
          let failureInfo: VentureDocumentFailureInfo | undefined;
          if (metadata?.failure) {
            failureInfo = {
              message: getUserFriendlyErrorMessage(
                metadata.failure.error?.code,
              ),
              stage: metadata.failure.stage ?? 'unknown',
              occurredAt: metadata.failure.occurred_at ?? doc.created_at,
            };
          }

          return {
            id: doc.public_id ?? String(doc.id),
            name: documentName,
            year:
              metadata?.document_year != null
                ? String(metadata.document_year)
                : metadata?.year != null
                  ? String(metadata.year)
                  : null,
            period: metadata?.period ?? '',
            submittedOn: doc.created_at,
            submittedBy: doc.users?.name ?? 'Unknown',
            status: mapStatus(statusCode, metadata?.failure?.stage),
            isPublished: statusCode === 'published',
            investment: doc.inv_company
              ? {
                  id: doc.inv_company.public_id,
                  name: doc.inv_company.inv_companies?.name || 'Unknown',
                  domain: doc.inv_company.inv_companies?.domain ?? undefined,
                }
              : null,
            documentType: doc.document_types?.name ?? 'Unknown',
            documentTypeCode: doc.document_types?.code ?? 'unknown',
            documentGroupType: resolveVentureDocumentGroupType(
              metadata?.document_group_type,
              doc.document_types?.code,
            ),
            stage: null,
            files,
            failureInfo,
          };
        }) ?? [];

      return { documents };
    } catch (error) {
      logger.error({
        error,
        processName: 'get-venture-documents',
        userId: userMetadata.userId,
        organizationId: userMetadata.organizationId,
      });
      return { documents: [] };
    }
  },
);

interface CreateInvestorDocumentParams {
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  userId: string;
  organizationId: string;
}

interface CreateInvestorDocumentResult {
  documentId: string;
  moduleDocumentId: number;
}

/**
 * Creates module_documents and module_document_files records for an uploaded investor document.
 * Does not trigger async processing - that should be done by the caller.
 */
export async function createInvestorDocument(
  params: CreateInvestorDocumentParams,
): Promise<CreateInvestorDocumentResult> {
  const { fileName, filePath, fileType, fileSize, userId, organizationId } =
    params;

  const supabase = await createClient();

  const { data: moduleData, error: moduleError } = await supabase
    .from('app_modules')
    .select('id')
    .eq('code', INVESTOR_MODULE_CODE)
    .single();

  if (moduleError || !moduleData) {
    logger.error({ moduleError }, 'Investor module not found');
    throw new ValidationError('Module not found');
  }

  const documentPublicId = uuidv4();

  const { data: docData, error: docError } = await supabase
    .from('module_documents')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      module_id: moduleData.id,
      document_type_id: null,
      status_id: MODULE_DOCUMENT_STATUS_IDS.UPLOADED,
      public_id: documentPublicId,
      metadata: { original_filename: fileName },
    })
    .select('id, public_id')
    .single();

  if (docError) {
    logger.error({ docError }, 'Failed to create document record');
    throw new Error('Database error');
  }

  const { error: fileError } = await supabase
    .from('module_document_files')
    .insert({
      module_document_id: docData.id,
      file_path: filePath,
      file_name: fileName,
      file_size: fileSize,
      file_type: fileType,
    });

  if (fileError) {
    logger.error({ fileError }, 'Failed to create document file record');
    throw new DatabaseError('Failed to create document file record');
  }

  return {
    documentId: documentPublicId,
    moduleDocumentId: docData.id,
  };
}
