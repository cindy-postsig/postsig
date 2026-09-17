/**
 * The key a surface shows Bloomberg under when every seat is rolled into one
 * row: a string with a prefix, so it can never collide with a contract id or
 * with the engine's negative seat ids. Client code imports this leaf file
 * rather than the spend module.
 */
const SID_ROLLUP_KEY_PREFIX = 'bloomberg:';
const RENEWING_SEGMENT = 'renewing';

export const SID_ROLLUP_PRODUCT_NAME = 'Terminals and exchange entitlements';

/**
 * A terminal's exchange entitlements ride on the terminal's own product line;
 * this names their share wherever a surface shows the split.
 */
export const SID_ENTITLEMENTS_PRODUCT_NAME = 'Exchange entitlements';

export const sidRollupKey = (vendorId: number): string =>
  `${SID_ROLLUP_KEY_PREFIX}${vendorId}`;

/** The renewals report's row: the vendor's seats renewing within `days`. */
export const sidRenewingRollupKey = (vendorId: number, days: number): string =>
  `${sidRollupKey(vendorId)}:${RENEWING_SEGMENT}:${days}`;

const positiveInt = (value: string | undefined): number | null => {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
};

function parseSidRollupKey(
  key: string,
): { vendorId: number; renewingDays: number | null } | null {
  if (!key.startsWith(SID_ROLLUP_KEY_PREFIX)) return null;
  const [vendor, segment, days, ...rest] = key
    .slice(SID_ROLLUP_KEY_PREFIX.length)
    .split(':');
  const vendorId = positiveInt(vendor);
  if (vendorId === null) return null;
  if (segment === undefined) return { vendorId, renewingDays: null };
  const renewingDays =
    segment === RENEWING_SEGMENT && rest.length === 0
      ? positiveInt(days)
      : null;
  return renewingDays === null ? null : { vendorId, renewingDays };
}

/** The vendor a rollup key names, or null for any other key. */
export const sidRollupVendorId = (key: string): number | null =>
  parseSidRollupKey(key)?.vendorId ?? null;

/** The renewal window a renewals-report rollup key carries, else null. */
export const sidRollupRenewingDays = (key: string): number | null =>
  parseSidRollupKey(key)?.renewingDays ?? null;

export const isSidRollupKey = (key: string): boolean =>
  parseSidRollupKey(key) !== null;

/** The engine keys a Bloomberg account negative, so a seat's contract id tells its source. */
export const isSidContractId = (contractId: number): boolean => contractId < 0;

export const sidRollupInventoryHref = (vendorId: number): string =>
  `/vendors/${vendorId}/inventory`;

/** The inventory view's Terminal Subscriptions tab, optionally narrowed. */
export function sidSubscriptionsHref(
  vendorId: number,
  filters: { product?: string; renewingWithinDays?: number } = {},
): string {
  const params = ['tab=subscriptions'];
  if (filters.product !== undefined) {
    params.push(`product=${encodeURIComponent(filters.product)}`);
  }
  if (filters.renewingWithinDays !== undefined) {
    params.push(`renewing=${filters.renewingWithinDays}`);
  }
  return `${sidRollupInventoryHref(vendorId)}?${params.join('&')}`;
}

/** The inventory view's Exchange Entitlements tab. */
export const sidExchangeHref = (vendorId: number): string =>
  `${sidRollupInventoryHref(vendorId)}?tab=exchange`;

/**
 * Where a rolled-up Bloomberg row opens: the vendor's inventory view, and for
 * the renewals report's row the Terminal Subscriptions tab narrowed to the
 * seats renewing in the report's window. Null for any other key.
 */
export function sidRollupHref(key: string): string | null {
  const parsed = parseSidRollupKey(key);
  if (!parsed) return null;
  return parsed.renewingDays === null
    ? sidRollupInventoryHref(parsed.vendorId)
    : sidSubscriptionsHref(parsed.vendorId, {
        renewingWithinDays: parsed.renewingDays,
      });
}
