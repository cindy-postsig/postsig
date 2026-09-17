import { DatabaseError } from '@/lib/errors';
import { SupabaseClient } from '@supabase/supabase-js';
import { buildSafePath, PathTraversalError } from '@/utils/helpers';

export async function downloadFile(
  supabase: SupabaseClient,
  bucket: string,
  filePath: string,
): Promise<number[]> {
  const segments = filePath.split('/').filter(Boolean);
  let safePath: string;
  try {
    safePath = buildSafePath(segments);
  } catch (error) {
    if (error instanceof PathTraversalError) {
      throw new DatabaseError('Invalid file path');
    }
    throw error;
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .download(safePath);

  if (error) {
    throw new DatabaseError(`Failed to download file: ${error.message}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Array.from(new Uint8Array(arrayBuffer));
}
