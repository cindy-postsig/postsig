import { Hono } from 'hono';
import { listReportData } from '../handlers/reports/list';
import { getReportSummaryHandler } from '../handlers/reports/summary';
import { getReportSummariesHandler } from '../handlers/reports/summaries';

export const reportsRouter = new Hono();

// GET /api/v2/reports/summaries?types=unconfirmed,dora,...
reportsRouter.get('/summaries', getReportSummariesHandler);

// GET /api/v2/reports/:type/summary
reportsRouter.get('/:type/summary', getReportSummaryHandler);

// GET /api/v2/reports/:type
reportsRouter.get('/:type', listReportData);
