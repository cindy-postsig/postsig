import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getUserMetadata } from '@/data/users';
import {
  CompanyHeaderServer,
  CompanyDetailsServer,
  RoundFilterServer,
} from './server-components';
import { CompanyHeaderSkeleton, CompanyDetailsLoading } from './skeletons';
import { Separator } from '@/components/ui/separator';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CompanyPage({ params }: PageProps) {
  const { id } = await params;

  const userMetadata = await getUserMetadata();
  if (userMetadata?.investorTrialEnabled) {
    redirect('/investor/documents');
  }

  return (
    <div className="mx-auto w-full">
      <RoundFilterServer id={id}>
        <div className="py-12">
          <Suspense fallback={<CompanyHeaderSkeleton />}>
            <CompanyHeaderServer id={id} />
          </Suspense>
        </div>

        <div className="px-12">
          <Separator />
        </div>

        <Suspense fallback={<CompanyDetailsLoading />}>
          <CompanyDetailsServer id={id} />
        </Suspense>
      </RoundFilterServer>
    </div>
  );
}
