import { userRoles } from '@/constants/data';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';

const invoiceIntegrationRoles = [
  userRoles.clientAdmin,
  userRoles.clientSupervisor,
];

export async function canManageInvoiceIntegrations(
  userId: string,
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('user_roles2')
    .select('role_id')
    .eq('user_id', userId)
    .in('role_id', invoiceIntegrationRoles)
    .limit(1)
    .maybeSingle();

  return Boolean(data?.role_id);
}
