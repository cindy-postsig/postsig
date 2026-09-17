import Loading from '@/components/Loading';

export default function MonthlyReportLoading() {
  const now = new Date();
  const monthYear = `${now.toLocaleDateString('en-US', { month: 'long' })} ${now.getFullYear()}`;

  return (
    <div className="mt-6 space-y-8">
      <div className="sticky top-24 z-20 flex justify-between bg-background py-2 backdrop-blur-sm">
        <div className="space-y-2">
          <div className="h-[45px] overflow-hidden leading-none">
            <h1 className="font-serif">Monthly Budget Intelligence</h1>
          </div>
          <p className="font-label text-xs uppercase tracking-wider text-muted-foreground">
            {monthYear}
          </p>
        </div>
      </div>
      <div className="flex w-full items-center justify-center p-12">
        <Loading />
      </div>
    </div>
  );
}
