import { SupabaseClient } from '@supabase/supabase-js';

const isDocuSignEnabled = process.env.DOCUSIGN_ENABLED === 'true';

export const fetchDocuSignStatus = async (
  supabase: SupabaseClient<any, 'public', any>,
  userId: string,
): Promise<boolean> => {
  if (!isDocuSignEnabled) return false;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('docusign_connected')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return !!data?.docusign_connected;
  } catch (error: any) {
    console.error('Error checking DocuSign connection:', error);
    return false;
  }
};
