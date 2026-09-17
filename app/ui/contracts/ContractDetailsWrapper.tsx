'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import ConfigurableDetails from './ConfigurableDetails';
import DiscussionViewer from './discussion-viewer';
import { Citation } from '@/constants/types';
import { ContractActivity as Activity } from '@/lib/v2';
import type { OriginalProductVersions } from '@/lib/v2';
import type { LineageGraphExtras } from '@/lib/contracts/lineageGraph';
import { UserMetadata } from '@/constants/types';
import { CommentOrder } from '@/data/contracts';
import { useDiscussionVisibility } from './toggleDiscussion';
import { usePdfVisibility } from './togglePdf';
import { useStableDocumentUrl } from '@/hooks/useStableDocumentUrl';
import type { ContractDocument } from '@/lib/v2/contracts/documents';
import type { InvoiceValidation } from '@/lib/v2/invoices/validation';

// Dynamically import EnhancedPDFViewer with SSR disabled
const EnhancedPDFViewer = dynamic(() => import('./enhanced-pdf-viewer'), {
  ssr: false,
});

interface ContractDetailsWrapperProps {
  contract: any;
  documentsWithSignedUrls?: ContractDocument[];
  activities?: Activity[];
  allBlocks: any[];
  citations: Citation[];
  userMetadata?: UserMetadata | null;
  initialUnreadCommentsCount?: number;
  initialComments?: any[];
  initialCommentOrder?: CommentOrder;
  completeHierarchy?: any;
  allContractsInHierarchy?: any[];
  lineageGraphExtras?: LineageGraphExtras;
  folderACLs?: Array<{
    folderId: number;
    folderName: string;
    folderPath: string;
    acl: { users: any[]; groups: any[] };
  }>;
  latestVersionSignedUrl?: string;
  hasVersions?: boolean;
  isViewingOriginal?: boolean;
  originalVersionData?: Record<string, unknown> | null;
  originalProductVersions?: OriginalProductVersions | null;
  orgGroups?: Array<{ id: number; name: string }>;
  costAllocationEnabled?: boolean;
  invoiceValidation?: InvoiceValidation | null;
}

export default function ContractDetailsWrapper({
  contract,
  documentsWithSignedUrls,
  activities,
  allBlocks,
  citations,
  userMetadata,
  initialUnreadCommentsCount,
  initialComments,
  initialCommentOrder,
  completeHierarchy,
  allContractsInHierarchy,
  lineageGraphExtras,
  folderACLs,
  latestVersionSignedUrl,
  hasVersions,
  isViewingOriginal,
  originalVersionData,
  originalProductVersions,
  orgGroups,
  costAllocationEnabled,
  invoiceValidation,
}: ContractDetailsWrapperProps) {
  const pdfCtx = usePdfVisibility();
  const discussionCtx = useDiscussionVisibility();

  const [activePanel, setActivePanel] = useState<'pdf' | 'discussion'>('pdf');

  // The viewer always shows the uploaded original, never the English
  // translation extraction reads.
  const pdfFile = useStableDocumentUrl(documentsWithSignedUrls?.[0]);

  useEffect(() => {
    if (pdfCtx?.isPdfOpen) setActivePanel('pdf');
  }, [pdfCtx?.isPdfOpen]);

  useEffect(() => {
    if (discussionCtx?.isDiscussionOpen) setActivePanel('discussion');
  }, [discussionCtx?.isDiscussionOpen]);

  return (
    <>
      <ConfigurableDetails
        contract={contract}
        initialUnreadCommentsCount={initialUnreadCommentsCount}
        initialCommentsLoaded={Array.isArray(initialComments)}
        documentsWithSignedUrls={documentsWithSignedUrls}
        activities={activities}
        citations={citations}
        completeHierarchy={completeHierarchy}
        allContractsInHierarchy={allContractsInHierarchy}
        lineageGraphExtras={lineageGraphExtras}
        folderACLs={folderACLs}
        latestVersionSignedUrl={latestVersionSignedUrl}
        hasVersions={hasVersions}
        isViewingOriginal={isViewingOriginal}
        originalVersionData={originalVersionData}
        originalProductVersions={originalProductVersions}
        orgGroups={orgGroups}
        costAllocationEnabled={costAllocationEnabled}
        invoiceValidation={invoiceValidation}
      />
      {userMetadata && (
        <DiscussionViewer
          contractId={contract.id}
          user={userMetadata}
          initialComments={initialComments}
          initialCommentOrder={initialCommentOrder}
          isActive={activePanel === 'discussion'}
        />
      )}
      {pdfFile && (
        <EnhancedPDFViewer
          file={pdfFile}
          pdfWidth={0.9}
          textractResponse={allBlocks}
          citations={citations}
        />
      )}
    </>
  );
}
