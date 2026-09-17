import { Suspense } from 'react';
import { PdfVisibilityProvider } from '@/app/ui/contracts/togglePdf';
import { DiscussionVisibilityProvider } from '@/app/ui/contracts/toggleDiscussion';
import ContractLayoutWrapper from '@/components/contracts/ContractLayoutWrapper';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  panelLayoutCookieName,
  parsePanelLayout,
} from '@/lib/panel-layout-cookie';
import {
  ContractSidebarServer,
  ContractContentServer,
} from '@/app/(app)/(cpm)/contracts/[id]/server-components';
import {
  ContractSidebarSkeleton,
  ContractContentSkeleton,
} from '@/app/(app)/(cpm)/contracts/[id]/skeletons';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ viewOriginal?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const id = Number(resolvedParams.id);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }
  const isViewingOriginal = resolvedSearchParams.viewOriginal === 'true';

  const cookieStore = await cookies();
  const defaultLayout = parsePanelLayout(
    cookieStore.get(panelLayoutCookieName('contract-sidebar'))?.value,
    2,
  );

  return (
    <div className="relative h-[calc(100vh-3.5rem)] overflow-hidden">
      <PdfVisibilityProvider initialIsPdfOpen={false}>
        <DiscussionVisibilityProvider initialIsDiscussionOpen={false}>
          <div className="h-full bg-background">
            <ContractLayoutWrapper
              defaultLayout={defaultLayout}
              sidebar={
                <Suspense fallback={<ContractSidebarSkeleton />}>
                  <ContractSidebarServer contractId={id} />
                </Suspense>
              }
            >
              <Suspense fallback={<ContractContentSkeleton />}>
                <ContractContentServer
                  contractId={id}
                  isViewingOriginal={isViewingOriginal}
                />
              </Suspense>
            </ContractLayoutWrapper>
          </div>
        </DiscussionVisibilityProvider>
      </PdfVisibilityProvider>
    </div>
  );
}
