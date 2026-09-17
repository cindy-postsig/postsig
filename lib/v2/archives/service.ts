import { cache } from 'react';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { getUserMetadata } from '@/data/users';
import { DatabaseError, NotFoundError } from '@/lib/errors';
import logger from '@/utils/pino';

export interface ModuleArchiveRow {
  id: string;
  publicId: string | null;
  fileName: string;
  filePath: string;
  fileSize: number | null;
  fileType: string | null;
  source: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

export interface ModuleArchivesResult {
  archives: ModuleArchiveRow[];
}

interface CreateModuleArchiveParams {
  moduleCode: string;
  organizationId: string;
  userId: string;
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileHash?: string | null;
  source?: string;
  extraMetadata?: Record<string, unknown>;
}

async function lookupModuleId(moduleCode: string): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('app_modules')
    .select('id')
    .eq('code', moduleCode)
    .single();
  if (error || !data) {
    logger.error({ error, moduleCode }, 'Failed to look up module by code');
    throw new NotFoundError(`Module: ${moduleCode}`);
  }
  return data.id;
}

export async function createModuleArchive(
  params: CreateModuleArchiveParams,
): Promise<{ id: number }> {
  const moduleId = await lookupModuleId(params.moduleCode);
  const supabase = createServiceClient();

  const metadata = {
    ...(params.source ? { source: params.source } : {}),
    ...(params.extraMetadata ?? {}),
  };

  const { data, error } = await supabase
    .from('module_archives')
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      module_id: moduleId,
      file_path: params.filePath,
      file_name: params.fileName,
      file_type: params.fileType,
      file_size: params.fileSize,
      file_hash: params.fileHash ?? null,
      metadata,
    })
    .select('id')
    .single();

  if (error || !data) {
    logger.error({ error }, 'Failed to create module archive');
    throw new DatabaseError('Failed to create module archive');
  }

  return { id: data.id };
}

export const getModuleArchives = cache(
  async (moduleCode: string): Promise<ModuleArchivesResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata?.organizationId) {
      return { archives: [] };
    }

    const supabase = await createClient();

    const { data: moduleData, error: moduleError } = await supabase
      .from('app_modules')
      .select('id')
      .eq('code', moduleCode)
      .single();

    if (moduleError || !moduleData) {
      logger.warn(
        { error: moduleError, moduleCode },
        'Module not found for archives fetch',
      );
      return { archives: [] };
    }

    const { data, error } = await supabase
      .from('module_archives')
      .select(
        `
        id,
        public_id,
        file_name,
        file_path,
        file_size,
        file_type,
        metadata,
        created_at,
        users!module_archives_user_id_fkey (
          name
        )
      `,
      )
      .eq('organization_id', userMetadata.organizationId)
      .eq('module_id', moduleData.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error }, 'Failed to fetch module archives');
      throw new DatabaseError('Failed to fetch module archives');
    }

    type Raw = {
      id: number;
      public_id: string | null;
      file_name: string;
      file_path: string;
      file_size: number | null;
      file_type: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
      users: { name: string | null } | { name: string | null }[] | null;
    };

    const archives: ModuleArchiveRow[] = ((data ?? []) as Raw[]).map((row) => {
      const userRecord = Array.isArray(row.users) ? row.users[0] : row.users;
      const source =
        typeof row.metadata?.source === 'string'
          ? (row.metadata.source as string)
          : null;
      return {
        id: String(row.id),
        publicId: row.public_id,
        fileName: row.file_name,
        filePath: row.file_path,
        fileSize: row.file_size,
        fileType: row.file_type,
        source,
        uploadedBy: userRecord?.name ?? 'Unknown',
        uploadedAt: row.created_at,
      };
    });

    return { archives };
  },
);
