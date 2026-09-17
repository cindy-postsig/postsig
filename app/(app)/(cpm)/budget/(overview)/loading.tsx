import Loading from '@/components/Loading';

export default function BudgetLoading() {
  return (
    <div>
      <div className="mb-8 mt-6">
        <h1 className="font-serif">Spend Overview</h1>
      </div>
      <div className="flex w-full items-center justify-center p-12">
        <Loading />
      </div>
    </div>
  );
}
