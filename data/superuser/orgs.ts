import { createClient } from '@/utils/supabase/service_server';

export async function getOrganizationById(organizationId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .single();
  return { data, error };
}
