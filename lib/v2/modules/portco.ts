export interface OrgModuleRow {
  is_enabled: boolean | null;
  app_modules: { code: string } | null;
}

/**
 * Shared by `getUserMetadata` (web) and `loadUserMetadataById` (MCP) so the two
 * contexts cannot drift on who sees KPIs. `is_enabled` is nullable with a
 * `default true`, matching the `om.is_enabled = true` predicate the admin
 * activity views use — a null or false row is not enabled.
 */
export function isPortcoModuleEnabled(orgModules: OrgModuleRow[]): boolean {
  return orgModules.some(
    (om) => om.app_modules?.code === 'portco' && om.is_enabled === true,
  );
}
