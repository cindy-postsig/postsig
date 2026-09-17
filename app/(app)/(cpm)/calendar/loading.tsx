import Loading from '@/components/Loading';

export default function CalendarLoading() {
  return (
    <div>
      <h1 className="font-serif">&nbsp;</h1>
      <div className="flex w-full items-center justify-center p-12">
        <Loading />
      </div>
    </div>
  );
}
