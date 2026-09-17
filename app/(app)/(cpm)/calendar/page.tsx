import { CalendarServer } from './server-components';

type SearchParams = {
  query?: string | null;
  page?: string | null;
  view?: 'month' | 'quarter' | 'year';
  start?: string | null;
  end?: string | null;
  sort?: string;
  order?: string;
  tag?: string;
  renewal?: string;
  tags?: string;
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { view = 'quarter' } = await searchParams;
  return (
    <div>
      <div className="flex flex-grow flex-col">
        <main className="flex-grow overflow-y-auto overflow-x-hidden">
          <CalendarServer view={view} />
        </main>
      </div>
    </div>
  );
}
