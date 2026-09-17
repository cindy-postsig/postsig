import Loading from '@/components/Loading';

export default function InventoryLoading() {
  return (
    <div>
      <div className="mb-6 flex w-full items-center justify-between">
        <h1 className="font-serif">Inventory</h1>
      </div>
      <div className="flex w-full items-center justify-center p-12">
        <Loading />
      </div>
    </div>
  );
}
