'use server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import {
  ExternalServiceError,
  ValidationError,
  DatabaseError,
} from '@/lib/errors';

export async function insertContractVersion({
  contractId,
  filePath,
  fileName,
  userId,
  description,
}: {
  contractId: number;
  filePath: string;
  fileName: string;
  userId: string;
  description?: string | null;
}) {
  if (!contractId || !filePath || !fileName || !userId) {
    throw new ValidationError('Missing required fields for version insertion');
  }
  const supabase = await createClient();
  const { error } = await supabase.from('contract_docs_versions').insert({
    contract_id: contractId,
    file_path: filePath,
    file_name: fileName,
    user_id: userId,
    description: description ?? 'executed copy',
  });
  if (error)
    throw new DatabaseError('Failed to insert contract version', error as any);

  const supabaseService = createServiceClient();
  const { error: updateError } = await supabaseService
    .from('contracts')
    .update({ all_parties_signed: 'Yes' })
    .eq('id', contractId);

  if (updateError)
    throw new DatabaseError(
      'Failed to update contract after version upload',
      updateError as any,
    );

  return { success: true };
}

export async function getLatestContractVersion(contractId: number) {
  if (!contractId) throw new ValidationError('Contract ID required');
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('contract_docs_versions')
    .select('*')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error)
    throw new DatabaseError('Failed to fetch latest version', error as any);
  return data && data.length === 1 ? data[0] : null;
}

export async function getLatestVersionSignedUrl(contractId: number) {
  const latest = await getLatestContractVersion(contractId);
  if (!latest) return null;
  const supabase = createServiceClient();
  if (!latest.file_path) return null;
  const { data, error } = await supabase.storage
    .from('contract_docs')
    .createSignedUrl(latest.file_path as string, 3600);
  if (error || !data)
    throw new ExternalServiceError(
      'Supabase Storage',
      'Failed to generate signed URL',
      error as any,
    );
  return { signedUrl: data.signedUrl, version: latest };
}
