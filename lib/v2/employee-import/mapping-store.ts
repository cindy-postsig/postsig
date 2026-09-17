import {
  getOrganizationPreference,
  upsertOrganizationPreference,
} from '@/lib/v2/organization-preferences/service';
import logger from '@/utils/pino';
import {
  EMPLOYEE_IMPORT_MAPPING_KEY,
  EmployeeImportMappingSchema,
  type EmployeeImportMapping,
} from './types';

/**
 * The stored value is untyped jsonb, so a mapping written by an older shape can
 * be present and invalid. Treat that as "no saved mapping" rather than throwing
 * — the user can still import by mapping the file by hand.
 */
export async function getSavedImportMapping(): Promise<EmployeeImportMapping | null> {
  const preference = await getOrganizationPreference<unknown>(
    EMPLOYEE_IMPORT_MAPPING_KEY,
  );
  if (!preference?.preferenceValue) return null;

  const parsed = EmployeeImportMappingSchema.safeParse(
    preference.preferenceValue,
  );
  if (!parsed.success) {
    logger.warn(
      { issues: parsed.error.issues },
      'Stored employee import mapping is not valid, ignoring it',
    );
    return null;
  }

  return parsed.data;
}

export async function saveImportMapping(
  mapping: EmployeeImportMapping,
  updatedBy: string,
): Promise<EmployeeImportMapping> {
  // Validate on the way in as well as on the way out: the column is untyped
  // jsonb, so an invalid mapping would persist silently and only surface as a
  // "no saved mapping" on the next read.
  const toStore = EmployeeImportMappingSchema.parse({
    ...mapping,
    updatedAt: new Date().toISOString(),
    updatedBy,
  });

  await upsertOrganizationPreference(EMPLOYEE_IMPORT_MAPPING_KEY, toStore);
  return toStore;
}
