import Search from '@/app/ui/search';
import {
  fetchContractsPages,
  fetchContracts,
} from '@/app/lib/contracts/actions';
import { Suspense } from 'react';
import { ContractsTableClient } from '@/components/contracts/ContractsTableClient';
import { ARCHIVED_STANDALONE_COLUMNS } from '@/components/contracts/listViewDefaults';
import Loading from '@/components/Loading';
import { getUser, getUserMetadata } from '@/data/users';
import dynamic from 'next/dynamic';
import StatusTabs from '@/app/ui/contracts/status-tabs';

// Dynamically import the client component
const ExportCSVButton = dynamic(
  () => import('@/components/contracts/ExportCSVButton'),
);

export default async function Page({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{
    query?: string;
    page?: string;
    sort?: string;
    order?: string;
    tag?: string;
    renewal?: string;
    tags?: string;
  }>;
}) {
  const searchParams = searchParamsPromise
    ? await searchParamsPromise
    : undefined;
  const [user, userMetadata] = await Promise.all([
    getUser(),
    getUserMetadata(),
  ]);

  if (!userMetadata) {
    return null;
  }

  const currentPage = Number(searchParams?.page) || 1;
  const [{ totalPages, totalContracts }, contracts] = await Promise.all([
    fetchContractsPages({ query: searchParams?.query || '' }),
    fetchContracts({
      query: searchParams?.query,
      currentPage,
      status: 'inactive',
      contractFields: [
        'renewal_type',
        'term_start_date',
        'current_term_start_date',
        'cancel_date',
        'cancel_by_date',
        'term_end_date',
        'current_cancel_by_date',
        'current_term_end_date',
        'currency',
        'is_duplicate',
      ],
    }),
  ]);

  const columns = ARCHIVED_STANDALONE_COLUMNS;

  return (
    <>
      <div className="mx-10 mb-24 mt-8">
        <div className="mb-4 flex w-full items-center justify-between">
          <h1 className="font-serif">Contracts</h1>
          <div className="flex">
            <Search placeholder="Search contracts" />
          </div>
        </div>

        <StatusTabs />

        {searchParams?.query && (
          <h4 className="mb-2 text-foreground/80">
            Searching &apos;{searchParams?.query}&apos;
          </h4>
        )}

        <Suspense
          key={currentPage}
          fallback={
            <div className="flex w-full items-center justify-center p-12">
              <Loading />
            </div>
          }
        >
          <ContractsTableClient
            data={contracts}
            columns={columns}
            groupByVendor={true}
            userMetadata={userMetadata}
            defaultSortColumn={searchParams?.sort || 'termEndDate'}
            defaultSortDirection={
              (searchParams?.order as 'asc' | 'desc') || 'asc'
            }
            actionType="export"
            layoutKey="archived.standalone"
          />
        </Suspense>
      </div>
    </>
  );
}
