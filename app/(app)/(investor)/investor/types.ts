/**
 * Investor portfolio types.
 *
 * Canonical definitions live in the data layer at `lib/v2/inv/types`. This file
 * re-exports them so investor UI code can import from a local path. Import from
 * the pure types module (not the `@/lib/v2/inv` barrel) to keep server-only
 * service code out of client bundles.
 */
export type * from '@/lib/v2/inv/types';
