import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import type { ModuleInfo } from '@/constants/types';
import { DatabaseError } from '@/lib/errors';
import { MODULE_IDS } from '@/lib/settings/config';

export interface InvestorModuleSettings {
  trial_enabled?: boolean;
}

// Default module code for users with no explicit access
const DEFAULT_MODULE_CODE = 'cpm';

export interface ModuleAccessResult {
  modules: ModuleInfo[];
  defaultModule: ModuleInfo | null;
}

/**
 * Fetches user's accessible modules from user_module_access joined with app_modules.
 * If user has no entries, returns CPM module as default.
 *
 * @param userId - The user's ID
 * @param organizationId - The user's organization ID
 * @returns Object containing accessible modules and the default module
 */
export async function getUserModuleAccess(
  userId: string,
  organizationId: string,
): Promise<ModuleAccessResult> {
  const supabase = await createClient();

  try {
    // Query user_module_access joined with app_modules
    const { data: userModules, error } = await supabase
      .from('user_module_access')
      .select(
        `
          is_active,
          is_default,
          app_modules!inner (
            code,
            name,
            base_path,
            is_active
          )
        `,
      )
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (error) {
      logger.error(
        { error, userId, organizationId },
        'Failed to fetch user module access',
      );
      throw error;
    }

    // If user has no module access entries, provide default CPM access
    if (!userModules || userModules.length === 0) {
      logger.info(
        { userId, organizationId },
        'No module access entries found, returning default CPM access',
      );
      return await getDefaultModuleAccess();
    }

    // Transform to ModuleInfo array, filtering out inactive modules
    const modules: ModuleInfo[] = userModules
      .filter(
        (uma) =>
          uma.app_modules &&
          typeof uma.app_modules === 'object' &&
          'is_active' in uma.app_modules &&
          uma.app_modules.is_active,
      )
      .map((uma) => {
        const appModule = uma.app_modules as {
          code: string;
          name: string;
          base_path: string;
        };
        return {
          code: appModule.code,
          name: appModule.name,
          basePath: appModule.base_path,
        };
      });

    // Find default module (first with is_default=true, or first module)
    const defaultEntry = userModules.find((uma) => {
      const appModule = uma.app_modules as { is_active: boolean } | null;
      return uma.is_default && appModule?.is_active;
    });

    let defaultModule: ModuleInfo | null = null;
    if (defaultEntry && defaultEntry.app_modules) {
      const appModule = defaultEntry.app_modules as {
        code: string;
        name: string;
        base_path: string;
      };
      defaultModule = {
        code: appModule.code,
        name: appModule.name,
        basePath: appModule.base_path,
      };
    } else if (modules.length > 0) {
      defaultModule = modules[0];
    }

    logger.info(
      {
        userId,
        organizationId,
        moduleCount: modules.length,
        defaultModuleCode: defaultModule?.code,
      },
      'User module access retrieved',
    );

    return { modules, defaultModule };
  } catch (error) {
    logger.error(
      { error, userId, organizationId },
      'Error in getUserModuleAccess',
    );
    // Fallback to default CPM access on error
    return await getDefaultModuleAccess();
  }
}

/**
 * Returns default CPM module access for users with no explicit entries.
 * Fetches CPM module from database, with hardcoded fallback if not found.
 */
async function getDefaultModuleAccess(): Promise<ModuleAccessResult> {
  const supabase = await createClient();

  const { data: cpmModule, error } = await supabase
    .from('app_modules')
    .select('code, name, base_path')
    .eq('code', DEFAULT_MODULE_CODE)
    .eq('is_active', true)
    .single();

  if (error || !cpmModule) {
    logger.warn({ error }, 'CPM module not found, using hardcoded defaults');
    // Hardcoded fallback if DB query fails
    const fallback: ModuleInfo = {
      code: 'cpm',
      name: 'PostSig CPM',
      basePath: '/dashboard',
    };
    return { modules: [fallback], defaultModule: fallback };
  }

  const moduleInfo: ModuleInfo = {
    code: cpmModule.code,
    name: cpmModule.name,
    basePath: cpmModule.base_path,
  };

  return { modules: [moduleInfo], defaultModule: moduleInfo };
}

/**
 * Check if user has access to a specific module by code.
 *
 * @param modules - Array of modules the user has access to
 * @param moduleCode - The module code to check (e.g., 'cpm', 'investor')
 * @returns True if user has access to the module
 */
export function hasModuleAccess(
  modules: ModuleInfo[],
  moduleCode: string,
): boolean {
  return modules.some((m) => m.code === moduleCode);
}

/**
 * Get module info by code from user's accessible modules.
 *
 * @param modules - Array of modules the user has access to
 * @param moduleCode - The module code to find
 * @returns The module info if found, undefined otherwise
 */
export function getModuleByCode(
  modules: ModuleInfo[],
  moduleCode: string,
): ModuleInfo | undefined {
  return modules.find((m) => m.code === moduleCode);
}

/**
 * Fetches module settings for an organization from organization_modules table.
 *
 * @param organizationId - The organization's ID
 * @param moduleId - The module ID (use MODULE_IDS from config)
 * @returns The module settings or null if not found
 */
export async function getOrganizationModuleSettings<T>(
  organizationId: string,
  moduleId: number,
): Promise<T | null> {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('organization_modules')
      .select('settings')
      .eq('organization_id', organizationId)
      .eq('module_id', moduleId)
      .maybeSingle();

    if (error) {
      logger.error(
        { error, organizationId, moduleId },
        'Failed to fetch organization module settings',
      );
      return null;
    }

    if (!data || !data.settings) {
      return null;
    }

    return data.settings as T;
  } catch (error) {
    logger.error(
      { error, organizationId, moduleId },
      'Error in getOrganizationModuleSettings',
    );
    return null;
  }
}

/**
 * Checks if investor trial mode is enabled for an organization.
 *
 * @param organizationId - The organization's ID
 * @returns True if trial mode is enabled, false otherwise
 */
export async function isInvestorTrialEnabled(
  organizationId: string,
): Promise<boolean> {
  const settings = await getOrganizationModuleSettings<InvestorModuleSettings>(
    organizationId,
    MODULE_IDS.investor,
  );

  return settings?.trial_enabled === true;
}

export async function updateModuleDocumentStatus(
  moduleDocumentId: number,
  statusId: number,
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('module_documents')
    .update({ status_id: statusId })
    .eq('id', moduleDocumentId);
  if (error) {
    logger.error(
      { error, moduleDocumentId, statusId },
      'Failed to update module document status',
    );
    throw new DatabaseError('Failed to update module document status');
  }
}
