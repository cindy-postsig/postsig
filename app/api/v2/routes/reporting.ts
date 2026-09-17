import { Hono } from 'hono';
import {
  addReportingRecipientHandler,
  createReportingRequestHandler,
  getPortcoUsersHandler,
  getReportingRequestHandler,
  sendReportingReminderHandler,
} from '@/app/api/v2/handlers/reporting/requests';
import {
  createCustomKpiHandler,
  customKpiUsageHandler,
  deactivateCustomKpiHandler,
  listCustomKpisHandler,
  setKpiValueHandler,
} from '@/app/api/v2/handlers/reporting/custom-kpis';
import { listKpiEventsHandler } from '@/app/api/v2/handlers/reporting/events';
import { updateKpiSettingsHandler } from '@/app/api/v2/handlers/reporting/kpi-settings';
import { portcoKpisMiddleware } from '@/app/api/v2/middleware/auth';

export const reportingRouter = new Hono();

reportingRouter.use('*', portcoKpisMiddleware);

reportingRouter.post('/requests', createReportingRequestHandler);
reportingRouter.get('/requests/:publicId', getReportingRequestHandler);
reportingRouter.post(
  '/requests/:publicId/recipients',
  addReportingRecipientHandler,
);
reportingRouter.post(
  '/requests/:publicId/reminder',
  sendReportingReminderHandler,
);
reportingRouter.get('/portco-users', getPortcoUsersHandler);

reportingRouter.get('/kpi-events', listKpiEventsHandler);
reportingRouter.get('/custom-kpis', listCustomKpisHandler);
reportingRouter.post('/custom-kpis', createCustomKpiHandler);
reportingRouter.get('/custom-kpis/:publicId/usage', customKpiUsageHandler);
reportingRouter.put('/custom-kpis/:publicId/value', setKpiValueHandler);
reportingRouter.delete('/custom-kpis/:publicId', deactivateCustomKpiHandler);

reportingRouter.put('/kpi-settings', updateKpiSettingsHandler);
