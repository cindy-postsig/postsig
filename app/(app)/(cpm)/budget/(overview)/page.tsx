import { BudgetOverviewServer } from '@/app/(app)/(cpm)/budget/(overview)/server-components';

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{
    page?: string;
    sort?: string;
    order?: string;
    tag?: string;
    renewal?: string;
    tags?: string;
    fy?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <BudgetOverviewServer searchParams={resolvedSearchParams} />;
}
