import Loading from '@/components/Loading';

export default function PriceHistoryLoading() {
  return (
    <div>
      <div className="mb-8 mt-6 flex w-full items-start justify-between">
        <div>
          <h1 className="mb-2 font-serif leading-none">Price History</h1>
          <p className="text-sm text-muted-foreground">
            Vendor pricing trends over time.
          </p>
        </div>
      </div>
      <div className="flex w-full items-center justify-center p-12">
        <Loading />
      </div>
    </div>
  );
}
