import { getUserMetadata } from '@/data/users';
import type { InventoryItem } from '@/lib/v2/inventory/types';
import type { SeatRoster } from '@/lib/v2/seats/types';
import {
  fetchFirmwideAccounts,
  fetchFirmwideAccountsByVendor,
  fetchLatestSidProducts,
  fetchSidReport,
  type FirmwideAccount,
} from './queries';
import type { SidProductSummary, SidReport } from './report';
import { sidVendorInventoryItem } from './transforms';

export type { FirmwideAccount };

export async function getVendorFirmwideAccounts(
  vendorId: number,
): Promise<FirmwideAccount[]> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) return [];

  return fetchFirmwideAccountsByVendor(userMetadata.organizationId, vendorId);
}

export async function getVendorSidReport(
  vendorId: number,
  options: { firmwideId?: number | null; month?: string | null } = {},
): Promise<SidReport | null> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) return null;

  const accounts = await fetchFirmwideAccountsByVendor(
    userMetadata.organizationId,
    vendorId,
  );

  const account =
    options.firmwideId != null
      ? accounts.find(({ firmwideId }) => firmwideId === options.firmwideId)
      : accounts[0];

  if (!account) return null;

  return fetchSidReport(
    userMetadata.organizationId,
    account,
    options.month ?? null,
  );
}

export async function getVendorSidProducts(
  vendorId: number,
): Promise<SidProductSummary[]> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) return [];

  const accounts = await fetchFirmwideAccountsByVendor(
    userMetadata.organizationId,
    vendorId,
  );

  const account = accounts[0];
  if (!account) return [];

  return fetchLatestSidProducts(
    userMetadata.organizationId,
    account.firmwideId,
  );
}

/**
 * One rolled-up inventory row per vendor with SID data, for the Inventory
 * tab. A vendor billed through several firmwide accounts rolls them all into
 * its one row. The roster is only needed once the products are in, so a
 * caller still loading it need not hold the product reads back.
 */
export async function getSidVendorInventoryItems(
  organizationId: string,
  roster: SeatRoster | PromiseLike<SeatRoster>,
): Promise<InventoryItem[]> {
  const accounts = await fetchFirmwideAccounts(organizationId);
  if (accounts.length === 0) return [];

  const productsByAccount = await Promise.all(
    accounts.map((account) =>
      fetchLatestSidProducts(organizationId, account.firmwideId),
    ),
  );
  const byVendor = new Map<
    number,
    { vendor: FirmwideAccount['vendor']; products: SidProductSummary[] }
  >();
  accounts.forEach((account, index) => {
    const entry = byVendor.get(account.vendorId) ?? {
      vendor: account.vendor,
      products: [],
    };
    entry.products.push(...productsByAccount[index]);
    byVendor.set(account.vendorId, entry);
  });

  const holders = await roster;
  return [...byVendor]
    .map(([vendorId, { vendor, products }]) =>
      sidVendorInventoryItem(products, { id: vendorId, ...vendor }, holders),
    )
    .filter((item): item is InventoryItem => item !== null);
}
