import { sidRollupHref } from '@/lib/v2/bloomberg-sid/keys';

/**
 * Where a contract-keyed row or chart slice opens. A contract id is a
 * contract; the Bloomberg rollup key has no contract behind it and goes to the
 * vendor's inventory view instead.
 */
export function contractRowHref(id: string | number): string {
  return sidRollupHref(String(id)) ?? `/contracts/${id}`;
}
