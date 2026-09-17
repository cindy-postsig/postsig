import { Context } from 'hono';
import { z } from 'zod';
import { verifyAbility } from '@/data/user-permissions';
import { commitImport, previewImport } from '@/lib/v2/employee-import/service';
import { ImportParseError } from '@/lib/v2/employee-import/parse-file';
import { saveImportMapping } from '@/lib/v2/employee-import/mapping-store';
import {
  ImportFileError,
  validateImportFile,
} from '@/lib/v2/employee-import/validate-file';
import {
  EmployeeImportMappingSchema,
  type EmployeeImportMapping,
} from '@/lib/v2/employee-import/types';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';

function readFile(c: Context, formData: FormData): File | null {
  const file = formData.get('file');
  return file instanceof File ? file : null;
}

function readMapping(formData: FormData): EmployeeImportMapping | undefined {
  const raw = formData.get('mapping');
  if (raw === null || raw === '') return undefined;
  return EmployeeImportMappingSchema.parse(JSON.parse(String(raw)));
}

function errorResponse(c: Context, error: unknown, message: string) {
  if (
    error instanceof ImportFileError ||
    error instanceof ImportParseError ||
    error instanceof SyntaxError
  ) {
    return c.json({ error: error.message }, 400);
  }

  if (error instanceof z.ZodError) {
    return c.json(
      { error: 'Invalid column mapping', details: error.issues },
      400,
    );
  }

  logger.error({ error: sanitizeForLogging(error) }, message);

  const isAuth =
    error instanceof Error &&
    /not authenticated|unauthorized/i.test(error.message);
  return c.json(
    { error: isAuth ? 'Not authorized' : 'Failed to process the import file' },
    isAuth ? 401 : 500,
  );
}

export async function previewEmployeeImport(c: Context) {
  try {
    await verifyAbility('manage', 'Group');
    const userMetadata = c.get('userMetadata');

    const formData = await c.req.formData();
    const file = readFile(c, formData);
    if (!file) return c.json({ error: 'No file provided' }, 400);
    validateImportFile(file);

    const response = await previewImport(
      userMetadata.organizationId,
      file,
      readMapping(formData),
      formData.get('includeAllRows') === 'true',
    );

    return c.json(response);
  } catch (error) {
    return errorResponse(c, error, 'Failed to preview employee import');
  }
}

/** Saves the mapping without importing anything — the mapping-editor path. */
export async function saveEmployeeImportMapping(c: Context) {
  try {
    await verifyAbility('manage', 'Group');
    const userMetadata = c.get('userMetadata');

    const body = await c.req.json();
    const mapping = EmployeeImportMappingSchema.parse(body?.mapping);
    const saved = await saveImportMapping(mapping, userMetadata.userId);

    return c.json({ mapping: saved });
  } catch (error) {
    return errorResponse(c, error, 'Failed to save employee import mapping');
  }
}

export async function commitEmployeeImport(c: Context) {
  try {
    await verifyAbility('manage', 'Group');
    const userMetadata = c.get('userMetadata');

    const formData = await c.req.formData();
    const file = readFile(c, formData);
    if (!file) return c.json({ error: 'No file provided' }, 400);
    validateImportFile(file);

    const mapping = readMapping(formData);
    if (!mapping) return c.json({ error: 'No column mapping provided' }, 400);

    const result = await commitImport(
      userMetadata.organizationId,
      file,
      mapping,
    );

    logger.info(
      {
        organizationId: userMetadata.organizationId,
        inserted: result.inserted,
        updated: result.updated,
        errors: result.errors.length,
      },
      'Employee import completed',
    );

    return c.json(result);
  } catch (error) {
    return errorResponse(c, error, 'Failed to import employees');
  }
}
