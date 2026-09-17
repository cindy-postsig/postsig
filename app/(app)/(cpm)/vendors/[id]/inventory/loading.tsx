import Loading from '@/components/Loading';

export default function BloombergSidLoading() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center px-8 py-12">
      <div className="flex w-full items-center justify-center p-12">
        <Loading />
      </div>
    </div>
  );
}
