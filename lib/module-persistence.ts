import type { AppMode } from '@/contexts/ModeContext';

const MODULE_COOKIE_NAME = 'postsig_active_module';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Routes that are shared between modules and should not determine the active module.
 * When on these routes, the module context is read from the persisted cookie.
 */
export const SHARED_ROUTES = ['/settings', '/account', '/welcome'] as const;

/**
 * Checks if a pathname is a shared route that should not determine module context.
 */
export function isSharedRoute(pathname: string): boolean {
  return SHARED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * Sets the last active module in a cookie.
 * Called when navigating to module-specific routes or when explicitly switching modules.
 */
export function setLastActiveModule(module: AppMode): void {
  if (typeof document === 'undefined') return;

  document.cookie = `${MODULE_COOKIE_NAME}=${module}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * Gets the last active module from the cookie.
 * Returns null if no cookie is set or if running on the server.
 */
export function getLastActiveModule(): AppMode | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === MODULE_COOKIE_NAME) {
      if (value === 'contracts' || value === 'venture') {
        return value;
      }
    }
  }
  return null;
}
