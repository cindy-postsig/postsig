import { createClient } from '@/utils/supabase/client';
import { unstable_noStore as noStore } from 'next/cache';

interface Results {
  id: number;
  vendor_name: string | null;
}

export async function searchVendorContracts(query: string): Promise<Results[]> {
  const supabase = createClient();
  noStore();

  try {
    let { data: vendors, error: vendorError } = await supabase
      .from('vendors')
      .select<string, { id: number; name: string }>('id, name')
      .ilike('name', `%${query}%`);

    if (vendorError) {
      throw new Error('Failed to search vendors.');
    }

    if (vendors && vendors.length > 0) {
      const vendorIds = vendors.map((vendor) => vendor.id);

      let { data: contracts, error: contractError } = await supabase
        .from('contracts')
        .select<string, { id: number; vendor_id: number }>('id, vendor_id')
        .in('vendor_id', vendorIds);

      if (contractError) {
        throw new Error('Failed to fetch contracts.');
      }

      if (contracts) {
        const results: Results[] = contracts.map((contract) => ({
          id: contract.id,
          vendor_name:
            vendors.find((vendor) => vendor.id === contract.vendor_id)?.name ||
            '',
        }));

        return results;
      }
    }

    return [];
  } catch (error) {
    console.error('Supabase Error:', error);
    throw new Error('Failed to search vendor contracts.');
  }
}
