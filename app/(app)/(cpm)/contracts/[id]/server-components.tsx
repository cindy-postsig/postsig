import {
  getContract,
  getContractDocuments,
  getContractActivities,
  getContractCitations,
  getAmendmentChain,
  getContractACL,
  getLatestVersion,
  hasContractVersions,
  getOriginalContractVersion,
  getOriginalProductVersions,
  deriveCancelByDateFromParent,
} from '@/lib/v2';
import type { OriginalProductVersions } from '@/lib/v2';
import PDFViewer from '@/app/ui/contracts/pdf-viewer';
import ContractSidebar from '@/components/contracts/ContractSidebar';
import { notFound } from 'next/navigation';
import ContractDetailsWrapper from '@/app/ui/contracts/ContractDetailsWrapper';
import { getUserMetadata } from '@/data/users';
import UniversalFtuxProvider from '@/components/ftux/UniversalFtuxProvider';
import { HierarchyProvider } from '@/contexts/HierarchyContext';
import {
  TextractBlock,
  extractTextFromPdf,
  organizeTextBlocks,
} from '@/app/lib/aws/textract';
import {
  isArchivedStatus,
  filterHierarchyForInvoicesAccess,
} from '@/lib/contracts/lineageNodes';
import { getUnreadContractCommentsCountWithPref } from '@/data/contracts';
import { fetchCommentsWithSignedAttachmentUrls } from '@/data/contracts';
import { getOrgBusinessGroupNodes } from '@/data/superuser/org-units';
import { isCostAllocationEnabled } from '@/lib/v2/cost-allocation/flag';
import {
  fetchConfirmedEventsForContracts,
  type ConfirmedProductLineageEvent,
} from '@/data/superuser/productLineageEvents';
import {
  contractsToChainContracts,
  type ContractRowInput,
} from '@/lib/contracts/productLineageResolution';
import { resolveRemovedProductsForContracts } from '@/lib/contracts/resolveRemovedProductsForContracts';
import { resolveContractReplacementSurfaces } from '@/lib/contracts/replacementSurfaces';
import ContractReplacementBanner from '@/components/contracts/ContractReplacementBanner';
import ContractReplacedByBadge from '@/components/contracts/ContractReplacedByBadge';
import logger from '@/utils/pino';
import { logAlert } from '@/utils/logging/alert';
import {
  fetchBillingParentsByUserRoles,
  fetchBillingChildrenByUserRoles,
  type BillingParent,
  type BillingChildInvoice,
} from '@/data/superuser/contracts';
import { isInvoiceType } from '@/app/lib/constants';
import { hasInvoicesAccess } from '@/lib/v2/invoices/access';
import { getInvoiceValidationSummary } from '@/lib/v2/invoices/validation';
import { hasLineageContent } from '@/lib/contracts/lineageGraph';
import { fetchLineageGraphExtras } from '@/lib/contracts/fetchLineageGraphExtras';

/**
 * Invoices that are structural hierarchy children (not just "billing"
 * co-payers, gated separately) don't belong in the tree at all once the
 * org's Invoices module is off. Shared by the sidebar and the lineage tab
 * below, which both start from the same `getAmendmentChain` result.
 */
function getFilteredHierarchy(
  amendmentData: Awaited<ReturnType<typeof getAmendmentChain>>,
  invoicesEnabled: boolean,
  contractId: number,
) {
  return filterHierarchyForInvoicesAccess(
    amendmentData.completeHierarchy,
    amendmentData.allContractsInHierarchy,
    invoicesEnabled,
    contractId,
  );
}

interface ContractSidebarServerProps {
  contractId: number;
}

export async function ContractSidebarServer({
  contractId,
}: ContractSidebarServerProps) {
  const [contract, amendmentData, userMetadata, invoicesEnabled] =
    await Promise.all([
      getContract(contractId),
      getAmendmentChain(contractId),
      getUserMetadata(),
      hasInvoicesAccess(),
    ]);

  if (!contract) {
    notFound();
  }

  const {
    hierarchy: completeHierarchy,
    allContracts: allContractsInHierarchy,
  } = getFilteredHierarchy(amendmentData, invoicesEnabled, contractId);

  // Confirmed cancellations (PSK-1830), resolved here because the sidebar
  // renders in a parallel layout slot OUTSIDE HierarchyProvider. Serialized
  // as a plain record — Map/Set do not cross the RSC boundary.
  const removedByContractPromise = userMetadata
    ? resolveRemovedProductsForContracts({
        organizationId: userMetadata.organizationId,
        chainContracts: contractsToChainContracts(
          allContractsInHierarchy as unknown as ContractRowInput[],
        ),
      })
    : Promise.resolve(new Map<number, Set<number>>());

  // Only an invoice can carry 'billing' edges so every other type skips the
  // parents query. A lookup failure degrades to a missing section rather than
  // taking down the page — the tree is the sidebar's primary content. Also
  // gated on the Invoices module — this is invoice data either way.
  const billingParentsPromise: Promise<BillingParent[]> =
    userMetadata && invoicesEnabled && isInvoiceType(contract.type_id)
      ? fetchBillingParentsByUserRoles({
          childContractId: contractId,
          userMetadata,
        }).catch((error) => {
          logger.error({ error, contractId }, 'Error fetching billing parents');
          return [];
        })
      : Promise.resolve([]);

  // Invoices billed under any contract in the tree, rendered as leaf rows
  // beneath their billing parent. Same degrade-to-nothing posture as above.
  const billingChildrenPromise: Promise<Record<number, BillingChildInvoice[]>> =
    userMetadata && invoicesEnabled && allContractsInHierarchy.length > 0
      ? fetchBillingChildrenByUserRoles({
          parentContractIds: allContractsInHierarchy.map((c) => c.id),
          userMetadata,
        }).catch((error) => {
          logger.error(
            { error, contractId },
            'Error fetching sidebar billing children',
          );
          return {};
        })
      : Promise.resolve({});

  const [removedByContract, billingParents, billingChildrenByParent] =
    await Promise.all([
      removedByContractPromise,
      billingParentsPromise,
      billingChildrenPromise,
    ]);
  const removedProductsByContract = Object.fromEntries(
    [...removedByContract].map(([id, ids]) => [id, [...ids]]),
  );

  return (
    <ContractSidebar
      completeHierarchy={completeHierarchy}
      currentContract={contract}
      allContractsWithLocalIds={allContractsInHierarchy.map((c) => ({
        id: c.id,
        localId: c.localId,
        isArchived: isArchivedStatus(c.status),
      }))}
      removedProductsByContract={removedProductsByContract}
      billingParents={billingParents}
      billingChildrenByParent={billingChildrenByParent}
    />
  );
}
interface ContractContentServerProps {
  contractId: number;
  isViewingOriginal: boolean;
}

export async function ContractContentServer({
  contractId,
  isViewingOriginal,
}: ContractContentServerProps) {
  const user = await getUserMetadata();
  if (!user) {
    notFound();
  }

  const [
    contract,
    documentsResult,
    activitiesResult,
    citationsResult,
    amendmentData,
    aclResult,
    latestVersionResult,
    contractHasVersions,
    { count: unreadCommentsCount, order: commentOrder },
    initialComments,
    orgGroups,
    costAllocationEnabled,
    invoicesEnabled,
  ] = await Promise.all([
    getContract(contractId),
    getContractDocuments(contractId),
    getContractActivities(contractId),
    getContractCitations(contractId),
    getAmendmentChain(contractId),
    getContractACL(contractId),
    getLatestVersion(contractId),
    hasContractVersions(contractId),
    getUnreadContractCommentsCountWithPref(contractId, user.userId),
    fetchCommentsWithSignedAttachmentUrls(contractId),
    getOrgBusinessGroupNodes(),
    isCostAllocationEnabled(user),
    hasInvoicesAccess(),
  ]);

  const [originalVersionData, originalProductVersions] = isViewingOriginal
    ? await Promise.all([
        getOriginalContractVersion(contractId),
        getOriginalProductVersions(contractId),
      ])
    : [null, null];

  if (!contract) {
    notFound();
  }

  const documentsWithSignedUrls = documentsResult.documents;
  const activities = activitiesResult.activities;
  const citations = citationsResult.citations;
  const { folderACLs } = aclResult;
  const {
    hierarchy: completeHierarchy,
    allContracts: allContractsInHierarchy,
  } = getFilteredHierarchy(amendmentData, invoicesEnabled, contractId);

  // Confirmed declarations that later contracts cancelled earlier products
  // (PSK-1830). Started here, next to the chain it applies to, so the client
  // needs no extra query. Only confirmed events are returned, so a pending or
  // rejected declaration renders nothing. Deliberately not awaited yet — it is
  // independent of the PDF extraction below, so the two waits overlap instead
  // of stacking on the critical path of every contract page render.
  //
  // A failure degrades to no strike-throughs rather than a failed page: the
  // lineage view is supplementary to the contract itself. It pages a monitor,
  // because silently under-reporting cancellations is not something a user can
  // notice from the rendered page.
  const productLineageEventsPromise = fetchConfirmedEventsForContracts({
    contractIds: allContractsInHierarchy.map((c: { id: number }) => c.id),
    organizationId: user.organizationId,
  }).catch((error): ConfirmedProductLineageEvent[] => {
    logAlert(
      'product-lineage-fetch-failure',
      error,
      { contractId, organizationId: user.organizationId },
      'Failed to fetch confirmed product lineage events',
    );
    return [];
  });

  // A service order usually leaves the cancel-by date to its MSA (psk-1855)
  const contractWithInheritedDates = {
    ...contract,
    inherited_cancel_by_date: deriveCancelByDateFromParent(
      contract,
      amendmentData.parentContract,
    ),
  };

  // Billing-linked chains for the lineage map — independent of the PDF
  // extraction below, so the waits overlap like the lineage events above.
  const lineageGraphExtrasPromise = fetchLineageGraphExtras(
    amendmentData,
    user,
    contractId,
    invoicesEnabled,
  );

  const primarySignedUrl = documentsWithSignedUrls[0]?.signedUrl;
  const extractBlocks = async (): Promise<TextractBlock[]> => {
    if (contract.ai_extraction_status === 'h_failed' || !primarySignedUrl) {
      return [];
    }
    try {
      const textractResponse = await extractTextFromPdf(primarySignedUrl);
      const organizedText = organizeTextBlocks(textractResponse);
      return Array.from(organizedText.values()).flat();
    } catch (error) {
      logger.error({ error, contractId }, 'Failed to extract text from PDF');
      return [];
    }
  };

  // Feeds the Invoice Validation Summary module. Same degrade-to-nothing
  // posture as the sidebar's billing parents fetch: a failure hides the
  // module rather than failing the whole page. Also gated on the Invoices
  // module — a stray invoice-type contract shouldn't surface discrepancy
  // data once it's off.
  const invoiceValidationPromise =
    invoicesEnabled && isInvoiceType(contract.type_id)
      ? getInvoiceValidationSummary(contractId).catch((error) => {
          logger.error(
            { error, contractId },
            'Error fetching invoice validation summary',
          );
          return null;
        })
      : Promise.resolve(null);

  const [
    productLineageEvents,
    allBlocks,
    replacementSurfaces,
    lineageExtras,
    invoiceValidation,
  ] = await Promise.all([
    productLineageEventsPromise,
    extractBlocks(),
    resolveContractReplacementSurfaces({
      contractId,
      organizationId: user.organizationId,
      dateFormat: user.dateFormat,
    }),
    lineageGraphExtrasPromise,
    invoiceValidationPromise,
  ]);

  const contractPageFtuxKeys: string[] = [];
  if (hasLineageContent(completeHierarchy, lineageExtras.billingEdges)) {
    contractPageFtuxKeys.push('contract_lineage');
  }

  return (
    <UniversalFtuxProvider
      ftuxKeys={contractPageFtuxKeys}
      userFtuxStatus={user.userProfile?.ftux_status}
    >
      <HierarchyProvider
        completeHierarchy={completeHierarchy}
        allContractsInHierarchy={allContractsInHierarchy}
        productLineageEvents={productLineageEvents}
      >
        <div className="flex h-full flex-col overflow-hidden">
          <main className="flex-grow overflow-y-auto overflow-x-hidden">
            {replacementSurfaces.prompt ? (
              <div className="px-4 pt-4">
                <ContractReplacementBanner
                  prompt={replacementSurfaces.prompt}
                  oldContractVendorName={contract.vendors?.name ?? 'this'}
                  surface="old"
                />
              </div>
            ) : null}
            {replacementSurfaces.promptsAsReplacement.map((entry) => (
              <div className="px-4 pt-4" key={entry.eventId}>
                <ContractReplacementBanner
                  prompt={entry}
                  oldContractVendorName={entry.oldContractVendorName}
                  surface="new"
                />
              </div>
            ))}
            {replacementSurfaces.replacedBy ? (
              <div className="px-4 pt-4">
                <ContractReplacedByBadge
                  newContractId={replacementSurfaces.replacedBy.newContractId}
                  newContractNumber={
                    replacementSurfaces.replacedBy.newContractNumber
                  }
                />
              </div>
            ) : null}
            <div className="flex">
              {contract.ai_extraction_status === 'h_failed' ? (
                primarySignedUrl && (
                  <PDFViewer
                    file={primarySignedUrl}
                    pdfWidth={0.65}
                    contractPaneStyles="w-full"
                  />
                )
              ) : (
                <ContractDetailsWrapper
                  contract={contractWithInheritedDates}
                  documentsWithSignedUrls={documentsWithSignedUrls}
                  activities={activities}
                  allBlocks={allBlocks}
                  citations={citations}
                  completeHierarchy={completeHierarchy}
                  allContractsInHierarchy={allContractsInHierarchy}
                  lineageGraphExtras={lineageExtras}
                  folderACLs={folderACLs}
                  userMetadata={user}
                  initialUnreadCommentsCount={unreadCommentsCount}
                  initialComments={initialComments}
                  initialCommentOrder={commentOrder}
                  latestVersionSignedUrl={
                    latestVersionResult.version?.signedUrl ?? undefined
                  }
                  hasVersions={contractHasVersions}
                  isViewingOriginal={isViewingOriginal}
                  originalVersionData={originalVersionData}
                  originalProductVersions={originalProductVersions}
                  orgGroups={orgGroups}
                  costAllocationEnabled={costAllocationEnabled}
                  invoiceValidation={invoiceValidation}
                />
              )}
            </div>
          </main>
        </div>
      </HierarchyProvider>
    </UniversalFtuxProvider>
  );
}
