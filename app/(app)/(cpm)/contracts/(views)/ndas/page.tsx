import SystemFolderPage from '@/app/(app)/(cpm)/contracts/(views)/SystemFolderPage';
import { contractTypes } from '@/app/lib/constants';

export default async function NDAsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{
    query?: string;
    page?: string;
    size?: string;
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
  return (
    <SystemFolderPage typeId={contractTypes.NDA} searchParams={searchParams} />
  );
}
