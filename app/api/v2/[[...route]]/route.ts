import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { productsRouter } from '../routes/products';
import { inventoryRouter } from '../routes/inventory';
import { contractsRouter } from '../routes/contracts';
import { exchangeRatesRouter } from '../routes/exchange-rates';
import { reportsRouter } from '../routes/reports';
import { spendRouter } from '../routes/spend';
import { calendarRouter } from '../routes/calendar';
import { groupsRouter } from '../routes/groups';
import { organizationPreferencesRouter } from '../routes/organization-preferences';
import { employeeImportRouter } from '../routes/employee-import';
import { chatRouter } from '../routes/chat';
import { errorHandler } from '@/app/api/v2/middleware/error-handler';
import {
  authMiddleware,
  postsigApiKeyMiddleware,
  postsigAuthMiddleware,
} from '@/app/api/v2/middleware/auth';
import { foldersRouter } from '../routes/folders';
import { usersRouter } from '../routes/users';
import { tagsRouter } from '../routes/tags';
import { investorRouter } from '../routes/investor';
import { archivesRouter } from '../routes/archives';
import { integrationsRouter } from '../routes/integrations';
import { costAllocationRouter } from '../routes/cost-allocation';
import { orgUnitsRouter } from '../routes/org-units';
import { assignmentsRouter } from '../routes/assignments';
import { integrationsAuthMiddleware } from '@/app/api/v2/middleware/integrations-auth';
import { viewerWriteGuard } from '@/app/api/v2/middleware/write-guard';

export const maxDuration = 180;

const app = new Hono().basePath('/api/v2');

app.use('*', errorHandler);
app.use('/products/*', authMiddleware);
app.use('/inventory/*', authMiddleware);
app.use('/contracts/*', authMiddleware);
app.use('/exchange-rates/*', authMiddleware);
app.use('/reports/*', authMiddleware);
app.use('/spend/*', authMiddleware);
app.use('/calendar/*', authMiddleware);
app.use('/groups/*', authMiddleware);
app.use('/folders/*', authMiddleware);
app.use('/organization-preferences/*', authMiddleware);
app.use('/employee-import/*', authMiddleware);
app.use('/users/*', authMiddleware);
app.use('/tags/*', authMiddleware);
app.use('/archives/*', authMiddleware);
app.use('/integrations/*', authMiddleware, integrationsAuthMiddleware);
app.use('/cost-allocation/*', authMiddleware);
app.use('/org-units/*', authMiddleware);
app.use('/assignments/*', authMiddleware);
app.use('/chat/*', authMiddleware, postsigAuthMiddleware);
app.use('/investor/extraction-fields', postsigApiKeyMiddleware);
app.use('/investor/*', async (c, next) => {
  if (c.req.path === '/api/v2/investor/extraction-fields') {
    return next();
  }
  return authMiddleware(c, next);
});

// Last, so every route's resolved userMetadata is in place before it runs.
app.use('*', viewerWriteGuard);

app.route('/products', productsRouter);
app.route('/inventory', inventoryRouter);
app.route('/contracts', contractsRouter);
app.route('/exchange-rates', exchangeRatesRouter);
app.route('/reports', reportsRouter);
app.route('/spend', spendRouter);
app.route('/calendar', calendarRouter);
app.route('/groups', groupsRouter);
app.route('/folders', foldersRouter);
app.route('/organization-preferences', organizationPreferencesRouter);
app.route('/employee-import', employeeImportRouter);
app.route('/users', usersRouter);
app.route('/tags', tagsRouter);
app.route('/archives', archivesRouter);
app.route('/chat', chatRouter);
app.route('/integrations', integrationsRouter);
app.route('/cost-allocation', costAllocationRouter);
app.route('/org-units', orgUnitsRouter);
app.route('/assignments', assignmentsRouter);
app.route('/investor', investorRouter);

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);
