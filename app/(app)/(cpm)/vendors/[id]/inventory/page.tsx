import { notFound } from 'next/navigation';
import { BloombergSidView } from '@/components/bloomberg-sid/BloombergSidView';
import type { SidReport } from '@/lib/v2/bloomberg-sid/report';
import { getVendorSidReport } from '@/lib/v2/bloomberg-sid/service';
import { fetchVendorDetails } from '@/lib/v2/vendors/service';

interface VendorSummary {
  name: string;
  domain: string | null;
}

export default async function Page({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ month?: string; firmwide?: string }>;
}) {
  const [params, searchParams] = await Promise.all([
    paramsPromise,
    searchParamsPromise,
  ]);
  const id = Number(params.id);

  const [vendor, report]: [VendorSummary | null, SidReport | null] =
    await Promise.all([
      fetchVendorDetails(id),
      getVendorSidReport(id, {
        firmwideId: Number(searchParams?.firmwide) || null,
        month: searchParams?.month ?? null,
      }),
    ]);

  if (!vendor || !report) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-16">
      <BloombergSidView
        key={report.selected.reportId}
        vendor={{ id, name: vendor.name, domain: vendor.domain ?? null }}
        report={report}
      />
    </div>
  );
}
