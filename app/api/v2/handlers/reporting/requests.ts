import { Context } from 'hono';
import logger from '@/utils/pino';
import {
  createReportingRequest,
  addReportingRequestRecipient,
  sendReportingRequestReminder,
  type CreateReportingRequestInput,
} from '@/lib/v2/kpis/requests';
import {
  getOrgPortcoUsers,
  getReportingRequestDetails,
  getReportingRequestRecipients,
} from '@/lib/v2/kpis/service';
import { callerFrom, readJson } from './context';

export async function createReportingRequestHandler(c: Context) {
  try {
    const caller = callerFrom(c);
    if (!caller) return c.json({ error: 'Organization context required' }, 400);

    const body = await readJson<CreateReportingRequestInput>(c);
    if (!body) return c.json({ error: 'Invalid JSON body' }, 400);
    const result = await createReportingRequest(body, caller);
    if ('error' in result) return c.json(result, 400);
    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to create reporting request');
    return c.json({ error: 'Failed to create the request.' }, 500);
  }
}

export async function getReportingRequestHandler(c: Context) {
  try {
    const caller = callerFrom(c);
    if (!caller) return c.json({ error: 'Organization context required' }, 400);

    const publicId = c.req.param('publicId');
    if (!publicId) return c.json({ error: 'Invalid request ID' }, 400);
    const [details, recipients] = await Promise.all([
      getReportingRequestDetails(publicId),
      getReportingRequestRecipients(publicId),
    ]);
    if (!details) return c.json({ error: 'Request not found.' }, 404);
    return c.json({ details, recipients });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch reporting request');
    return c.json({ error: 'Failed to load the request.' }, 500);
  }
}

export async function addReportingRecipientHandler(c: Context) {
  try {
    const caller = callerFrom(c);
    if (!caller) return c.json({ error: 'Organization context required' }, 400);

    const publicId = c.req.param('publicId');
    if (!publicId) return c.json({ error: 'Invalid request ID' }, 400);
    const body = await readJson<{ email?: string }>(c);
    if (!body) return c.json({ error: 'Invalid JSON body' }, 400);
    const result = await addReportingRequestRecipient(
      publicId,
      body.email ?? '',
      caller,
    );
    if ('error' in result) return c.json(result, 400);
    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to add reporting recipient');
    return c.json({ error: 'Failed to add the recipient.' }, 500);
  }
}

export async function sendReportingReminderHandler(c: Context) {
  try {
    const caller = callerFrom(c);
    if (!caller) return c.json({ error: 'Organization context required' }, 400);

    const publicId = c.req.param('publicId');
    if (!publicId) return c.json({ error: 'Invalid request ID' }, 400);
    const result = await sendReportingRequestReminder(publicId, caller);
    if ('error' in result) return c.json(result, 400);
    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to send reporting reminder');
    return c.json({ error: 'Failed to send the reminder.' }, 500);
  }
}

export async function getPortcoUsersHandler(c: Context) {
  try {
    const caller = callerFrom(c);
    if (!caller) return c.json({ error: 'Organization context required' }, 400);

    const companyId = parseInt(c.req.query('companyId') ?? '', 10);
    if (isNaN(companyId)) {
      return c.json({ error: 'Invalid company ID' }, 400);
    }

    const users = await getOrgPortcoUsers(companyId, caller.organizationId);
    return c.json({ users });
  } catch (error) {
    logger.error({ error }, 'Failed to list portco users');
    return c.json({ error: 'Failed to load recipients.' }, 500);
  }
}
