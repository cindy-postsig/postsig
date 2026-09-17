import { Hono } from 'hono';
import { connectHandler } from '../handlers/integrations/connect';
import { callbackHandler } from '../handlers/integrations/callback';
import { disconnectHandler } from '../handlers/integrations/disconnect';
import { statusHandler } from '../handlers/integrations/status';
import { summaryHandler } from '../handlers/integrations/summary';
import { detailHandler } from '../handlers/integrations/detail';
import { runsHandler } from '../handlers/integrations/runs';
import { updateSettingsHandler } from '../handlers/integrations/settings';
import { syncHandler } from '../handlers/integrations/sync';

export const integrationsRouter = new Hono();

integrationsRouter.post('/nango/connect', connectHandler);
integrationsRouter.post('/nango/callback', callbackHandler);
integrationsRouter.post('/nango/disconnect', disconnectHandler);
integrationsRouter.get('/status', statusHandler);
integrationsRouter.get('/summary', summaryHandler);
integrationsRouter.get('/:provider/detail', detailHandler);
integrationsRouter.get('/:provider/runs', runsHandler);
integrationsRouter.patch('/:provider/settings', updateSettingsHandler);
integrationsRouter.post('/:provider/sync', syncHandler);
