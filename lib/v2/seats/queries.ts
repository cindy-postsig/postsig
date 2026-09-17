import { fetchAllPages, fetchByIds } from '@/lib/v2/cost-allocation/paging';
import { createClient } from '@/utils/supabase/service_server';

// The one `contract_users` reader behind every seat surface. The service
// client bypasses RLS and `contract_users` has no organization_id of its own,
// so tenancy rides the `contracts!inner(organization_id)` embed.

type ServiceClient = ReturnType<typeof createClient>;

/** One live seat (`released_at is null`) with everything a seat surface renders about it. */
export interface ContractSeatRow {
  id: number;
  contract_id: number;
  product_id: number | null;
  org_employee_id: number | null;
  /** Denormalized holder name; the fallback label for a seat with no linked employee. */
  name: string;
  email: string | null;
  start_date: string | null;
  created_at: string;
  product_name: string | null;
  delivery_methods: string[];
}

interface DeliveryTypeName {
  name: string | null;
}

interface SeatSelectRow {
  id: number;
  contract_id: number | null;
  product_id: number | null;
  org_employee_id: number | null;
  name: string;
  email: string | null;
  start_date: string | null;
  created_at: string;
  contract: {
    contract_data_delivery_types:
      | { data_delivery_types: DeliveryTypeName | null }[]
      | null;
  } | null;
  vendor_products: {
    id: number;
    name: string | null;
    data_delivery_types: DeliveryTypeName | null;
  } | null;
}

const SEAT_SELECT = `
  id,
  contract_id,
  product_id,
  org_employee_id,
  name,
  email,
  start_date,
  created_at,
  contract:contracts!inner(
    organization_id,
    contract_data_delivery_types(data_delivery_types(name))
  ),
  vendor_products(id, name, vendor_id, data_delivery_types(name))
`;

/**
 * The product's own delivery method when it has one, else every method
 * recorded on the contract — the same precedence the inventory transform
 * applies, restated here because that helper is private to its module.
 */
function deliveryMethodsOf(row: SeatSelectRow): string[] {
  const productMethod = row.vendor_products?.data_delivery_types?.name;
  if (productMethod) return [productMethod];
  const contractMethods = row.contract?.contract_data_delivery_types ?? [];
  return contractMethods
    .map((entry) => entry.data_delivery_types?.name)
    .filter((name): name is string => Boolean(name));
}

const liveSeats = (client: ServiceClient, organizationId: string) =>
  client
    .from('contract_users')
    .select(SEAT_SELECT)
    .eq('contract.organization_id', organizationId)
    .is('released_at', null);

/**
 * Every live seat in the org, or only those on `contractIds` when the caller
 * knows which contracts it needs (the allocation context reads by need, so an
 * org of 1,500 seats with one `active_users` contract reads that contract's).
 */
export async function readContractSeats(
  organizationId: string,
  client: ServiceClient = createClient(),
  options: { contractIds?: readonly number[] } = {},
): Promise<ContractSeatRow[]> {
  const { contractIds } = options;
  const rows =
    contractIds === undefined
      ? await fetchAllPages<SeatSelectRow>(
          (from, to) =>
            liveSeats(client, organizationId).order('id').range(from, to),
          organizationId,
          'contract seats',
        )
      : await fetchByIds<SeatSelectRow>(
          contractIds,
          (chunk, from, to) =>
            liveSeats(client, organizationId)
              .in('contract_id', chunk)
              .order('id')
              .range(from, to),
          organizationId,
          'contract seats',
        );

  const seats: ContractSeatRow[] = [];
  for (const row of rows) {
    // A seat whose contract went away is not an assignment to anything.
    if (row.contract_id === null) continue;
    seats.push({
      id: row.id,
      contract_id: row.contract_id,
      product_id: row.product_id,
      org_employee_id: row.org_employee_id,
      name: row.name,
      email: row.email,
      start_date: row.start_date,
      created_at: row.created_at,
      product_name: row.vendor_products?.name ?? null,
      delivery_methods: deliveryMethodsOf(row),
    });
  }
  return seats;
}
