import type { ModuleInfo } from '@/constants/types';
import { APP_MODULE_CODES } from '@/constants/data';

export interface ModuleAccessEntry {
  is_default: boolean | null;
  app_modules: {
    code: string;
    name: string;
    base_path: string;
    is_active: boolean;
  } | null;
}

/**
 * Picks the module the user should land on. Only modules this app serves are
 * eligible: a grant for another app (e.g. portco, whose base_path is '/')
 * would make the root route redirect to itself (PSK-1862). When no eligible
 * grant is marked is_default, prefer cpm over relying on row order, which the
 * database does not guarantee.
 */
export function resolveDefaultModule(
  entries: ModuleAccessEntry[],
  modules: ModuleInfo[],
): ModuleInfo | null {
  const defaultEntry = entries.find(
    (uma) =>
      uma.is_default &&
      uma.app_modules?.is_active &&
      APP_MODULE_CODES.includes(uma.app_modules.code),
  );
  if (defaultEntry?.app_modules) {
    return {
      code: defaultEntry.app_modules.code,
      name: defaultEntry.app_modules.name,
      basePath: defaultEntry.app_modules.base_path,
    };
  }
  return (
    modules.find((m) => m.code === 'cpm') ??
    modules.find((m) => APP_MODULE_CODES.includes(m.code)) ??
    null
  );
}
