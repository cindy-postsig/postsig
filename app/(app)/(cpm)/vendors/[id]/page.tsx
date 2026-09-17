import { format } from 'date-fns';
import Link from 'next/link';
import { isInvoiceType } from '@/app/lib/constants';
import ContractsTable from '@/components/contracts/ContractsTable';
import { InvoicesTable } from '@/components/invoices/InvoicesTable';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { VendorHeader } from '@/components/vendors/VendorHeader';
import { VendorProductsTable } from '@/components/vendors/VendorProductsTable';
import { VendorProfile } from '@/components/vendors/VendorProfile';
import { VendorTabs } from '@/components/vendors/VendorTabs';
import { getUserMetadata } from '@/data/users';
import { getVendorSidProducts } from '@/lib/v2/bloomberg-sid/service';
import { SID_RENEWAL_INCREASE_PERCENT } from '@/lib/v2/bloomberg-sid/spend';
import {
  sidProductInventoryItems,
  sidProductTermBounds,
} from '@/lib/v2/bloomberg-sid/transforms';
import { getContractsList } from '@/lib/v2/contracts/service';
import { isCostAllocationEnabled } from '@/lib/v2/cost-allocation/flag';
import { hasInvoicesAccess } from '@/lib/v2/invoices/access';
import { getSeatRoster } from '@/lib/v2/seats/roster';
import {
  getAllInvoiceValidations,
  toInvoiceRows,
} from '@/lib/v2/invoices/service';
import type { InvoiceValidation } from '@/lib/v2/invoices/validation';
import {
  fetchVendorDetails,
  getVendorContractsWithMetrics,
  getVendorCurrentFySpend,
  getVendorInventory,
} from '@/lib/v2/vendors/service';
import { timed } from '@/utils/logging/timed';

const CONTRACT_COLUMNS = [
  'expander',
  'vendor',
  'product',
  'type',
  'termStartDate',
  'cancelByDate',
  'termEndDate',
  'totalContractValue',
  'businessSponsor',
  'businessGroup',
];

const toIsoDate = (date: Date | null) =>
  date ? format(date, 'yyyy-MM-dd') : null;

export default async function Page({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ sort?: string; order?: string }>;
}) {
  const [params, searchParams] = await Promise.all([
    paramsPromise,
    searchParamsPromise,
  ]);
  const id = Number(params.id);

  const [
    vendor,
    { contracts: allContracts, relationships },
    inventory,
    invoiceValidations,
    userMetadata,
    sidProducts,
    currentFySpend,
    roster,
  ] = await Promise.all([
    timed('vendor.fetchVendorDetails', () => fetchVendorDetails(id)),
    timed('vendor.getContractsList', getContractsList),
    timed('vendor.getVendorInventory', () => getVendorInventory(id)),
    // Shares getUserMetadata() with the explicit call below (both
    // cache()-wrapped), so this skips the validation fetch when the module's
    // off without serializing ahead of the rest of the batch.
    timed('vendor.getAllInvoiceValidations', () =>
      hasInvoicesAccess().then((enabled) =>
        enabled
          ? getAllInvoiceValidations()
          : Promise.resolve(new Map<number, InvoiceValidation>()),
      ),
    ),
    timed('vendor.getUserMetadata', getUserMetadata),
    timed('vendor.getVendorSidProducts', () => getVendorSidProducts(id)),
    timed('vendor.getVendorCurrentFySpend', () => getVendorCurrentFySpend(id)),
    timed('vendor.getSeatRoster', getSeatRoster),
  ]);

  if (!vendor || !userMetadata) {
    return null;
  }

  const invoicesEnabled = userMetadata.cpmInvoicesEnabled === true;
  const costAllocationEnabled = await timed(
    'vendor.isCostAllocationEnabled',
    () => isCostAllocationEnabled(userMetadata),
  );
  const { contracts: vendorContracts, metrics } = getVendorContractsWithMetrics(
    id,
    allContracts,
    sidProductTermBounds(sidProducts),
  );
  const agreements = vendorContracts.filter(
    (c) => !isInvoiceType(c.contract.type_id),
  );
  const invoices = invoicesEnabled
    ? toInvoiceRows(
        vendorContracts.filter((c) => isInvoiceType(c.contract.type_id)),
        invoiceValidations,
      )
    : [];
  const products = [
    ...inventory,
    ...sidProductInventoryItems(
      sidProducts,
      { id, name: vendor.name, domain: vendor.domain ?? null },
      roster,
    ),
  ];

  return (
    <div
      id="detailsPaneHeader"
      className="mx-auto flex max-w-7xl flex-col gap-16 px-8 py-12"
    >
      <div className="flex w-full flex-col gap-8">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/vendors">Vendors</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{vendor.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <VendorHeader
          name={vendor.name}
          domain={vendor.domain}
          currentFySpend={currentFySpend?.amount ?? 0}
          currentFySpendNote={
            sidProducts.length > 0
              ? `Includes Bloomberg seats; renewals are projected at an estimated ${SID_RENEWAL_INCREASE_PERCENT}% price increase, and months after the latest import are at the latest report's rate.`
              : undefined
          }
          relationshipStartDate={toIsoDate(metrics.relationshipStartDate)}
          projectedEndDate={toIsoDate(metrics.projectedEndDate)}
          relationshipLengthDisplay={metrics.relationshipLengthDisplay}
        />
      </div>
      <VendorTabs
        productCount={products.length}
        contractCount={agreements.length}
        invoiceCount={invoices.length}
        products={
          <VendorProductsTable
            items={products}
            userMetadata={userMetadata}
            costAllocationEnabled={costAllocationEnabled}
          />
        }
        contracts={
          <ContractsTable
            contracts={agreements}
            columns={CONTRACT_COLUMNS}
            isVendorsPage={true}
            stickyHeader
            nestByLineage
            relationships={relationships}
            defaultSortColumn={searchParams?.sort || 'termEndDate'}
            defaultSortDirection={
              (searchParams?.order as 'asc' | 'desc') || 'asc'
            }
          />
        }
        invoices={
          invoicesEnabled ? (
            <InvoicesTable rows={invoices} showDateFilter={false} />
          ) : undefined
        }
        profile={<VendorProfile vendor={vendor} />}
      />
    </div>
  );
}
