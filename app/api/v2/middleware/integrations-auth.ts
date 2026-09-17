import { Context, Next } from 'hono';
import { userRoles } from '@/constants/data';

const invoiceIntegrationRoles = [
  userRoles.clientAdmin,
  userRoles.clientSupervisor,
];

export async function integrationsAuthMiddleware(c: Context, next: Next) {
  const userMetadata = c.get('userMetadata');
  if (!invoiceIntegrationRoles.includes(userMetadata?.userRole)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
}
