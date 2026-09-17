import { Context } from 'hono';
import {
  getInvPortfolioCompanies,
  getInvPortfolioCompany,
} from '@/lib/v2/inv/service';
import logger from '@/utils/pino';
import { NotFoundError } from '@/lib/errors';

/**
 * GET /api/v2/investor/inv/companies
 * List all portfolio companies from inv_* schema.
 */
export async function listInvCompanies(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const organizationId = userMetadata.organizationId;
    const result = await getInvPortfolioCompanies();

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId,
        count: result.count,
      },
      'Inv portfolio companies listed',
    );

    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to list inv portfolio companies');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}

/**
 * GET /api/v2/investor/inv/companies/:id
 * Get a single portfolio company by public_id from inv_* schema.
 */
export async function getInvCompanyHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const publicId = c.req.param('id');

    if (!publicId) {
      return c.json({ error: 'Company ID is required' }, 400);
    }

    const result = await getInvPortfolioCompany(publicId);

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: userMetadata.organizationId,
        publicId,
        companyName: result.company.name,
      },
      'Inv portfolio company fetched',
    );

    return c.json(result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }

    logger.error({ error }, 'Failed to get inv portfolio company');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
