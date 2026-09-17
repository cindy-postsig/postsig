import Loading from '@/components/Loading';

export default function ReportsLoading() {
  return (
    <div>
      <div className="mb-8 mt-8 flex w-full items-start justify-between">
        <div>
          <h1 className="mb-2 font-serif leading-none">Renewals Report</h1>
        </div>
      </div>
      <div className="flex w-full items-center justify-center p-12">
        <Loading />
      </div>
    </div>
  );
}
