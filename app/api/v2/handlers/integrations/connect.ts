import { Context } from 'hono';
import {
  getNangoClient,
  NANGO_PROVIDER_IDS,
  type NangoProvider,
} from '@/lib/api/nango';
import logger from '@/utils/pino';

export async function connectHandler(c: Context) {
  const userMetadata = c.get('userMetadata');
  const { userId } = userMetadata;
  const { email } = userMetadata.userProfile ?? {};

  const body = await c.req.json();
  const provider = body.provider as NangoProvider;

  if (!provider || !NANGO_PROVIDER_IDS[provider]) {
    return c.json({ error: 'Invalid provider' }, 400);
  }

  const nango = getNangoClient();
  const sessionToken = await nango.createConnectSession({
    end_user: {
      id: userId,
      email: email ?? undefined,
    },
    ...(NANGO_PROVIDER_IDS[provider]
      ? { allowed_integrations: [NANGO_PROVIDER_IDS[provider]] }
      : {}),
  });

  logger.info({ userId, provider }, 'Nango connect session created');
  return c.json({
    sessionToken: sessionToken.data.token,
    providerConfigKey: NANGO_PROVIDER_IDS[provider],
  });
}
