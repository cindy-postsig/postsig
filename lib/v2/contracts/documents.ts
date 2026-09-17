import { cache } from 'react';
import { createClient } from '@/utils/supabase/service_server';
import { getUserMetadata } from '@/data/users';
import logger from '@/utils/pino';

export interface ContractDocument {
  id: number;
  contract_id: number | null;
  file_path: string | null;
  type: string | null;
  description: string | null;
  created_at: string | null;
  signedUrl: string | null;
}

export interface DocumentsResult {
  documents: ContractDocument[];
  count: number;
}

export interface ContractVersion {
  id: number;
  contract_id: number;
  file_path: string;
  file_name: string;
  description: string | null;
  user_id: string;
  created_at: string;
  signedUrl: string | null;
}

export interface LatestVersionResult {
  version: ContractVersion | null;
  hasVersions: boolean;
}

/**
 * Get documents for a contract with signed URLs.
 * Returns contract documents with pre-signed URLs for viewing.
 * Cached per request for deduplication.
 */
export const getContractDocuments = cache(
  async (contractId: number): Promise<DocumentsResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return { documents: [], count: 0 };
    }

    const supabase = createClient();

    try {
      const { data: contractDocuments, error: documentsError } = await supabase
        .from('contract_docs')
        .select('*')
        .eq('contract_id', contractId);

      if (documentsError) {
        logger.error(
          { error: documentsError, contractId },
          'Error fetching contract documents',
        );
        throw new Error('Failed to fetch contract documents');
      }

      if (!contractDocuments || contractDocuments.length === 0) {
        return { documents: [], count: 0 };
      }

      const documentsWithSignedUrls: ContractDocument[] = await Promise.all(
        contractDocuments.map(async (document) => {
          if (!document.file_path) {
            return {
              id: document.id,
              contract_id: document.contract_id,
              file_path: document.file_path,
              type: document.type,
              description: document.description,
              created_at: document.created_at,
              signedUrl: null,
            };
          }

          const { data: signedUrlData, error: signedUrlError } =
            await supabase.storage
              .from('contract_docs')
              .createSignedUrl(document.file_path, 60 * 60); // 1 hour expiry

          if (signedUrlError) {
            logger.warn(
              { error: signedUrlError, documentId: document.id },
              'Error generating signed URL for document',
            );
            return {
              id: document.id,
              contract_id: document.contract_id,
              file_path: document.file_path,
              type: document.type,
              description: document.description,
              created_at: document.created_at,
              signedUrl: null,
            };
          }

          return {
            id: document.id,
            contract_id: document.contract_id,
            file_path: document.file_path,
            type: document.type,
            description: document.description,
            created_at: document.created_at,
            signedUrl: signedUrlData.signedUrl,
          };
        }),
      );

      return {
        documents: documentsWithSignedUrls,
        count: documentsWithSignedUrls.length,
      };
    } catch (error) {
      logger.error({ error, contractId }, 'Error fetching contract documents');
      throw error;
    }
  },
);

/**
 * Get the latest executed/signed version of a contract.
 * Returns the most recent entry from contract_docs_versions with a signed URL.
 * This is different from getContractDocuments which fetches original uploads.
 * Cached per request for deduplication.
 */
export const getLatestVersion = cache(
  async (contractId: number): Promise<LatestVersionResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return { version: null, hasVersions: false };
    }

    const supabase = createClient();

    try {
      const { count, error: countError } = await supabase
        .from('contract_docs_versions')
        .select('*', { count: 'exact', head: true })
        .eq('contract_id', contractId);

      if (countError) {
        logger.error(
          { error: countError, contractId },
          'Error checking contract versions',
        );
        return { version: null, hasVersions: false };
      }

      const hasVersions = (count ?? 0) > 0;

      if (!hasVersions) {
        return { version: null, hasVersions: false };
      }

      const { data: latestVersion, error: versionError } = await supabase
        .from('contract_docs_versions')
        .select('*')
        .eq('contract_id', contractId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (versionError || !latestVersion) {
        logger.error(
          { error: versionError, contractId },
          'Error fetching latest contract version',
        );
        return { version: null, hasVersions };
      }

      let signedUrl: string | null = null;
      if (latestVersion.file_path) {
        const { data: signedUrlData, error: signedUrlError } =
          await supabase.storage
            .from('contract_docs')
            .createSignedUrl(latestVersion.file_path, 60 * 60); // 1 hour expiry

        if (signedUrlError) {
          logger.warn(
            { error: signedUrlError, contractId },
            'Error generating signed URL for version',
          );
        } else {
          signedUrl = signedUrlData.signedUrl;
        }
      }

      return {
        version: {
          id: latestVersion.id,
          contract_id: latestVersion.contract_id,
          file_path: latestVersion.file_path,
          file_name: latestVersion.file_name,
          description: latestVersion.description,
          user_id: latestVersion.user_id,
          created_at: latestVersion.created_at,
          signedUrl,
        },
        hasVersions: true,
      };
    } catch (error) {
      logger.error(
        { error, contractId },
        'Error fetching latest contract version',
      );
      return { version: null, hasVersions: false };
    }
  },
);
