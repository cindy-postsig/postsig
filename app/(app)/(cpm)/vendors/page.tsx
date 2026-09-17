import { Metadata } from 'next';
import { VendorsTable } from '@/components/vendors/VendorsTable';
import { getContractsList } from '@/lib/v2/contracts/service';
import { getVendorSpendIndex } from '@/lib/v2/vendors/service';
import { buildVendorListRows } from '@/lib/v2/vendors/transforms';

export const metadata: Metadata = {
  title: 'Vendors | PostSig',
  description:
    'Every vendor with a published contract, with relationship metrics',
};

export default async function VendorsPage() {
  const [{ contracts }, spend] = await Promise.all([
    getContractsList(),
    getVendorSpendIndex(),
  ]);
  const rows = buildVendorListRows(contracts, spend);

  return (
    <div>
      <div className="mb-6 flex w-full items-center justify-between">
        <h1 className="font-serif">Vendors</h1>
      </div>
      <VendorsTable rows={rows} />
    </div>
  );
}
