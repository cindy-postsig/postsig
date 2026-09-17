import { Metadata } from 'next';
import { InventoryTableClient } from './InventoryTableClient';
import { getInventoryList } from '@/lib/v2/inventory/service';
import { getUserMetadata } from '@/data/users';
import { isCostAllocationEnabled } from '@/lib/v2/cost-allocation/flag';
import { timed } from '@/utils/logging/timed';

export const metadata: Metadata = {
  title: 'Inventory | PostSig',
  description:
    'Interactive inventory table for data and other licenses for capital markets',
};

export default async function InventoryPage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{
    page?: string;
    sort?: string;
    order?: string;
    vendor?: string;
    delivery?: string;
  }>;
}) {
  const searchParams = searchParamsPromise
    ? await searchParamsPromise
    : undefined;
  const [inventoryData, userMetadata] = await Promise.all([
    timed('inventory.getInventoryList', getInventoryList),
    timed('inventory.getUserMetadata', getUserMetadata),
  ]);

  if (!userMetadata) {
    return null;
  }

  const costAllocationEnabled = await timed(
    'inventory.isCostAllocationEnabled',
    () => isCostAllocationEnabled(userMetadata),
  );

  return (
    <div>
      <div className="mb-6 flex w-full items-center justify-between">
        <h1 className="font-serif">Inventory</h1>
      </div>

      <InventoryTableClient
        initialData={inventoryData.items}
        groupByVendor={true}
        defaultSortColumn={searchParams?.sort || 'endDate'}
        defaultSortDirection={(searchParams?.order as 'asc' | 'desc') || 'asc'}
        userMetadata={userMetadata}
        costAllocationEnabled={costAllocationEnabled}
      />
    </div>
  );
}
