import { Context } from 'hono';
import {
  getVendorWhitelist as getWhitelistService,
  addVendorToWhitelist,
  removeVendorFromWhitelist,
  replaceVendorWhitelist,
  mergeVendorsToWhitelist,
} from '@/lib/v2/organization-preferences/service';
import {
  parseVendorWhitelistCSV,
  validateCSVFile,
  formatCSVErrors,
  CSVParseError,
} from '@/lib/v2/organization-preferences/csv-parser';
import {
  VendorWhitelistEntrySchema,
  VendorWhitelistSchema,
} from '@/lib/v2/organization-preferences/types';
import logger from '@/utils/pino';
import { verifyAbility } from '@/data/user-permissions';
import { logVendorWhitelistUploaded } from '@/data/superuser/activities';

export async function getVendorWhitelist(c: Context) {
  try {
    await verifyAbility('manage', 'Organization');
    const userMetadata = c.get('userMetadata');

    const whitelist = await getWhitelistService();

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: userMetadata.organizationId,
        count: whitelist.length,
      },
      'Vendor whitelist retrieved',
    );

    return c.json({ whitelist });
  } catch (error) {
    logger.error({ error }, 'Failed to get vendor whitelist');
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      error instanceof Error && error.message.includes('not authenticated')
        ? 401
        : 500,
    );
  }
}

export async function addVendor(c: Context) {
  try {
    await verifyAbility('manage', 'Organization');
    const userMetadata = c.get('userMetadata');

    const body = await c.req.json();
    const parseResult = VendorWhitelistEntrySchema.safeParse({
      ...body,
      addedAt: new Date().toISOString(),
    });

    if (!parseResult.success) {
      return c.json(
        {
          error: 'Invalid vendor entry',
          details: parseResult.error.issues,
        },
        400,
      );
    }

    const whitelist = await addVendorToWhitelist(parseResult.data);

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: userMetadata.organizationId,
      },
      'Vendor added to whitelist',
    );

    return c.json({ whitelist });
  } catch (error) {
    logger.error({ error }, 'Failed to add vendor to whitelist');
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
}

export async function removeVendor(c: Context) {
  try {
    await verifyAbility('manage', 'Organization');
    const userMetadata = c.get('userMetadata');

    const email = c.req.param('email');
    if (!email) {
      return c.json({ error: 'Email parameter is required' }, 400);
    }

    const decodedEmail = decodeURIComponent(email);
    const whitelist = await removeVendorFromWhitelist(decodedEmail);

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: userMetadata.organizationId,
        email: decodedEmail,
      },
      'Vendor removed from whitelist',
    );

    return c.json({ whitelist });
  } catch (error) {
    logger.error({ error }, 'Failed to remove vendor from whitelist');
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
}

export async function replaceWhitelist(c: Context) {
  try {
    await verifyAbility('manage', 'Organization');
    const userMetadata = c.get('userMetadata');

    const body = await c.req.json();
    const parseResult = VendorWhitelistSchema.safeParse(body.whitelist);

    if (!parseResult.success) {
      return c.json(
        {
          error: 'Invalid whitelist data',
          details: parseResult.error.issues,
        },
        400,
      );
    }

    const whitelist = await replaceVendorWhitelist(parseResult.data);

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: userMetadata.organizationId,
        count: whitelist.length,
      },
      'Vendor whitelist replaced',
    );

    return c.json({ whitelist });
  } catch (error) {
    logger.error({ error }, 'Failed to replace vendor whitelist');
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
}

export async function addVendors(c: Context) {
  try {
    await verifyAbility('manage', 'Organization');
    const userMetadata = c.get('userMetadata');

    const body = await c.req.json();

    if (!Array.isArray(body.vendors)) {
      return c.json({ error: 'vendors array is required' }, 400);
    }

    const now = new Date().toISOString();
    const entries = body.vendors.map(
      (v: { email: string; vendorName?: string }) => ({
        email: v.email,
        vendorName: v.vendorName,
        addedAt: now,
      }),
    );

    const parseResult = VendorWhitelistSchema.safeParse(entries);

    if (!parseResult.success) {
      return c.json(
        {
          error: 'Invalid vendor entries',
          details: parseResult.error.issues,
        },
        400,
      );
    }

    const mergeResult = await mergeVendorsToWhitelist(parseResult.data);

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: userMetadata.organizationId,
        added: mergeResult.added,
        updated: mergeResult.updated,
      },
      'Vendors added to whitelist',
    );

    return c.json({
      whitelist: mergeResult.whitelist,
      summary: {
        added: mergeResult.added,
        updated: mergeResult.updated,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to add vendors to whitelist');
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
}

export async function uploadCSV(c: Context) {
  try {
    await verifyAbility('manage', 'Organization');
    const userMetadata = c.get('userMetadata');

    const formData = await c.req.formData();
    const file = formData.get('file');
    const replaceExisting = formData.get('replace') === 'true';

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400);
    }

    validateCSVFile(file);

    const content = await file.text();
    const result = await parseVendorWhitelistCSV(content);

    if (result.valid.length === 0) {
      const details =
        result.invalid.length > 0 || result.duplicates.length > 0
          ? formatCSVErrors(result)
          : undefined;
      return c.json(
        {
          error: 'No valid vendor entries found in CSV',
          details,
          validCount: 0,
          invalidCount: result.invalid.length,
          duplicatesCount: result.duplicates.length,
        },
        400,
      );
    }

    let whitelist;
    let added = 0;
    let updated = 0;

    if (replaceExisting) {
      whitelist = await replaceVendorWhitelist(result.valid);
      added = result.valid.length;
    } else {
      const mergeResult = await mergeVendorsToWhitelist(result.valid);
      whitelist = mergeResult.whitelist;
      added = mergeResult.added;
      updated = mergeResult.updated;
    }

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: userMetadata.organizationId,
        totalEntries: result.valid.length,
        added,
        updated,
        replaced: replaceExisting,
        skippedInvalid: result.invalid.length,
        skippedDuplicates: result.duplicates.length,
      },
      'CSV vendor whitelist uploaded',
    );

    const skippedDetails =
      result.invalid.length > 0 || result.duplicates.length > 0
        ? formatCSVErrors(result)
        : undefined;

    logVendorWhitelistUploaded({
      totalEntries: result.valid.length,
      added,
      updated,
      replaced: replaceExisting,
      skippedInvalid: result.invalid.length,
      skippedDuplicates: result.duplicates.length,
      changedBy: userMetadata.userId,
      userId: userMetadata.userId,
    }).catch((err) =>
      logger.error(
        { error: err },
        'Failed to log vendor whitelist upload activity',
      ),
    );

    return c.json({
      whitelist,
      summary: {
        total: result.valid.length,
        added,
        updated,
        replaced: replaceExisting,
        skippedInvalid: result.invalid.length,
        skippedDuplicates: result.duplicates.length,
        skippedDetails,
      },
    });
  } catch (error) {
    if (error instanceof CSVParseError) {
      return c.json({ error: error.message }, 400);
    }

    logger.error({ error }, 'Failed to upload CSV vendor whitelist');
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
}
