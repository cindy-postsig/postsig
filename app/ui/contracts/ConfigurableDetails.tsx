'use client';

import Tab from '@/app/ui/Tab';
import TabRowWrapper from '@/app/ui/contracts/TabRowWrapper';
import Label1 from '@/components/Label1';
import { Database } from '@/database.types';
import { getMissingFields } from '@/lib/v2/reports/transforms/missing-clauses';
import ProductsLicensed from '@/components/contracts/ProductsLicensed';
import ProductCredits from '@/components/contracts/ProductCredits';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import TermCard from '@/components/contracts/TermCard';
import _ from 'lodash';
import {
  useState,
  useEffect,
  useContext,
  memo,
  useRef,
  useLayoutEffect,
  ReactNode,
  useMemo,
} from 'react';
import { fetchContractActivity } from '@/app/lib/contracts/actions';
import { parseISO, format, startOfDay } from 'date-fns';
import { formatDate, DATE_FORMAT_DEFAULT } from '@/lib/date-format';
import ContractOwner from './owner';
import CostAllocationTab from '@/components/contracts/cost-allocation/CostAllocationTab';
import { ActiveUsers } from './active-users';
import { useContractUsers } from '@/app/hooks/useContractUsers';
import { usePdfVisibility } from '@/app/ui/contracts/togglePdf';
import DoraAnalysis from './DoraAnalysis';
import AuditLog from './AuditLog';
import { ContractActivity as Activity } from '@/lib/v2';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserContext } from '@/app/userProvider';
import { contractTypes, isInvoiceType } from '@/app/lib/constants';
import {
  hasLineageContent,
  type LineageGraphExtras,
} from '@/lib/contracts/lineageGraph';
import { documentExportFilename } from '@/lib/csv-export/filename';
import Link from 'next/link';
import VendorIcon from '@/components/vendors/VendorIcon';
import { Suspense } from 'react';
import { ErrorBoundary } from 'next/dist/client/components/error-boundary';
import { postsigAdminRoles, userRoles } from '@/constants/data';
import NoteCard from '@/components/contracts/NoteCard';
import { Alert } from '@/components/ui/alert';
import StatusDropdown from '@/components/contracts/StatusDropdown';
import { useContractStatusUpdate } from '@/hooks/useContractStatusUpdate';
import { Badge } from '@/components/ui/badge';
import { Dates, VendorProductUser } from '@/constants/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ChatBubbleIcon,
  DownloadIcon,
  InfoCircledIcon,
  Pencil2Icon,
  ReloadIcon,
} from '@radix-ui/react-icons';
import ContractTags from './ContractTags';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  CircleBackslashIcon,
  DotsHorizontalIcon,
  ReaderIcon,
} from '@radix-ui/react-icons';
import { ShareIcon } from '@heroicons/react/24/outline';
import { useAbility } from '@/components/providers/AbilityProvider';
import { useSharingDialog } from '@/app/(app)/SharingDialogContext';
import { exportCSV } from '@/app/lib/actions/contract';
import { handleDownload } from '@/app/lib/utils';
import { logExportBeacon } from '@/utils/audit-export';
import { useCanExportCsv } from '@/hooks/useCanExportCsv';
import { RenewedIcon } from '@/components/contracts/icons';
import Comments from '@/components/contracts/comments/Comments';
import { Citation } from '@/constants/types';
import CitationField from '@/components/contracts/CitationField';
import { calculateLifetimeContractValue } from '@/app/lib/budget/lifetimeValueCalculator';
import { useAttachmentStorage } from '@/hooks/useAttachmentStorage';
import AmendedClausesCard from './AmendedClausesCard';
import ContractLineageMap from '@/components/contracts/ContractLineageMap';
import AmendmentAccordion from '@/components/contracts/amendments/AmendmentAccordion';
import { buildCompleteAmendmentChain } from '@/lib/amendments/amendmentService';
import { formatJsxField } from '@/components/contracts/FieldFormatters';
import {
  getAmendmentData,
  formatForAccordion,
} from '@/lib/amendments/amendmentDisplayUtils';
import CompactAmendmentPopover from '@/components/contracts/CompactAmendmentPopover';
import {
  getContractConfig,
  getFieldDefinition,
  getFieldValue,
  getFieldTooltip,
  shouldDisplayField,
  getAllConfiguredFields,
  DetailSection,
} from './contractFieldConfigs';
import { useRenewStatus } from '@/hooks/useRenewStatus';
import { Checkbox } from '@/components/ui/checkbox';
import { NdaRiskLevelIndicator } from './nda-risk-level';
import UploadContractVersionButton from '@/components/contracts/UploadContractVersionButton';
import {
  EditProvider,
  useEdit,
  useContractFieldEdit,
} from './edit/EditContext';
import { EditToolbar } from './edit/EditToolbar';
import { EditableField } from './edit/EditableField';
import { OriginalPreviewToolbar } from './edit/OriginalPreviewToolbar';
import { InlineEditWrapper, FieldEditMenu } from './edit/InlineEditWrapper';
import { EyeOpenIcon } from '@radix-ui/react-icons';
import {
  EDITABLE_TEXT_FIELDS,
  isEditableField,
} from '@/lib/v2/contracts/edit/utils';
import { isFieldEditable } from '@/lib/v2/contracts/edit/field-registry';
import { EditableMetadataField } from './edit/EditableMetadataField';
import { useDataDeliveryTypes } from '@/hooks/api/useDataDeliveryTypes';
import InvoiceStatusDropdown from '@/components/contracts/InvoiceStatusDropdown';
import { useInvoiceStatusUpdate } from '@/hooks/useInvoiceStatusUpdate';
import { DEFAULT_INVOICE_STATUS } from '@/constants/invoiceStatus';
import InvoiceValidationSummary from '@/components/contracts/InvoiceValidationSummary';
import type { InvoiceValidation } from '@/lib/v2/invoices/validation';
import { useDiscussionVisibility } from '@/app/ui/contracts/toggleDiscussion';
import DiscussionButton from '@/components/contracts/comments/DiscussionButton';

interface AssetClass {
  id: number;
  name: string;
}

interface GroupedFieldAmendmentContentProps {
  item: { key: string; title: string; text?: string; jsx?: React.ReactNode };
  amendmentData: ReturnType<typeof getAmendmentData>;
  contract: any;
  currentContractWithLocalId: any;
  menuSlot?: ReactNode;
}

function GroupedFieldAmendmentContent({
  item,
  amendmentData,
  contract,
  currentContractWithLocalId,
  menuSlot,
}: GroupedFieldAmendmentContentProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const accordionData = formatForAccordion(amendmentData);

  const displayValue =
    item.key === 'number_of_users' || item.key === 'data_delivery_types'
      ? formatJsxField(item.key, currentContractWithLocalId || contract)
      : item.jsx ||
        (amendmentData?.currentValue
          ? String(amendmentData.currentValue).charAt(0).toUpperCase() +
            String(amendmentData.currentValue).slice(1)
          : '');

  useLayoutEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [displayValue]);

  return (
    <div>
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: isHistoryOpen ? 0 : `${contentHeight}px`,
          opacity: isHistoryOpen ? 0 : 1,
        }}
      >
        <div
          ref={contentRef}
          className="flex items-start justify-between gap-2"
        >
          <div className="flex-1">{displayValue}</div>
          {menuSlot}
        </div>
      </div>

      <AmendmentAccordion
        fieldKey={item.key}
        fieldTitle={item.title}
        currentValue={amendmentData?.currentValue}
        relatedContracts={accordionData?.relatedContracts || []}
        viewContext="chain"
        currentContractId={contract?.id}
        isHistoryOpen={isHistoryOpen}
        onToggleHistory={setIsHistoryOpen}
      />
    </div>
  );
}

function OptimisticTextDisplay({
  fieldKey,
  originalValue,
  contractId,
}: {
  fieldKey: string;
  originalValue: string | null;
  contractId: number;
}) {
  const edit = useEdit();
  const value =
    edit?.getFieldValue('contracts', contractId, fieldKey, originalValue) ??
    originalValue;
  if (!value) return null;
  return <>{String(value).charAt(0).toUpperCase() + String(value).slice(1)}</>;
}

function EditMenuItem({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  const edit = useEdit();
  const hasInlineEditInProgress = (edit?.inlineEditingFields.size ?? 0) > 0;

  return (
    <DropdownMenuItem
      onClick={onClick}
      disabled={disabled || hasInlineEditInProgress}
    >
      <Pencil2Icon className="h-4 w-4" />
      <span>Edit</span>
    </DropdownMenuItem>
  );
}

function GroupedFieldRow({
  item,
  isSidePanelOpen,
  isEditMode,
  citations,
  renderContent,
}: {
  item: any;
  isSidePanelOpen: boolean;
  isEditMode: boolean;
  citations: Citation[];
  renderContent: (menuSlot?: ReactNode) => ReactNode;
}) {
  const edit = useEdit();
  const contractId = edit?.contractId ?? 0;
  const isInlineEditing =
    edit?.isFieldInlineEditing('contracts', contractId, item.key) ?? false;
  const canEdit = edit?.canEdit ?? false;
  const isFieldEditable =
    item.key && isEditableField(item.key) && !item.jsx && canEdit;

  const handleStartEdit = () => {
    if (!edit || !item.key) return;
    edit.startInlineEdit('contracts', contractId, item.key, item.text);
  };

  const menuElement =
    isFieldEditable && !isInlineEditing && !isEditMode ? (
      <FieldEditMenu onEdit={handleStartEdit} />
    ) : undefined;

  const fieldContent = (
    <div className="grid grid-cols-4 gap-0 py-2">
      <div
        className={`${isSidePanelOpen ? 'pt-[.3rem] text-[0.75rem]' : 'pt-[.4rem] text-[0.825rem]'} col-span-1 font-label uppercase leading-tight tracking-wide text-foreground/85`}
      >
        <div className="flex items-start gap-2 px-2">
          {item.title}
          {item.tooltip && (
            <TooltipProvider>
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <InfoCircledIcon className="inline h-4 w-4 shrink-0 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{item.tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      <div
        className={`${!isSidePanelOpen && 'text-lg'} col-span-3 pl-2 font-serif`}
      >
        {renderContent(menuElement)}
      </div>
    </div>
  );

  if (isEditMode) {
    return <div>{fieldContent}</div>;
  }

  if (isFieldEditable) {
    if (isInlineEditing) {
      return <div>{fieldContent}</div>;
    }

    return (
      <div className="group/field">
        <CitationField
          citation={citations.find((c) => c.id === item.key)}
          className="block"
          row={true}
        >
          {fieldContent}
        </CitationField>
      </div>
    );
  }

  return (
    <CitationField
      citation={citations.find((c) => c.id === item.key)}
      className="block"
      row={true}
    >
      {fieldContent}
    </CitationField>
  );
}

export default memo(function ConfigurableDetails({
  contract,
  initialUnreadCommentsCount,
  initialCommentsLoaded = false,
  documentsWithSignedUrls,
  activities,
  orgGroups,
  citations,
  completeHierarchy,
  allContractsInHierarchy = [],
  lineageGraphExtras,
  folderACLs,
  latestVersionSignedUrl,
  hasVersions = false,
  isViewingOriginal = false,
  originalVersionData,
  originalProductVersions,
  costAllocationEnabled = false,
  invoiceValidation = null,
}: {
  contract: any;
  initialUnreadCommentsCount?: number;
  initialCommentsLoaded?: boolean;
  documentsWithSignedUrls?: any[];
  activities?: Activity[];
  orgGroups?: Array<{ id: number; name: string }>;
  citations: Citation[];
  completeHierarchy?: any;
  allContractsInHierarchy?: any[];
  /** Billing-linked chains + edges for the lineage map. */
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
  originalProductVersions?: import('@/lib/v2').OriginalProductVersions | null;
  /** The org's cost-allocation flag, evaluated server-side; the tab is absent when false. */
  costAllocationEnabled?: boolean;
  /** Discrepancy data for the Invoice Validation Summary module; null for non-invoice contracts. */
  invoiceValidation?: InvoiceValidation | null;
}) {
  // Find current contract with local ID from allContractsInHierarchy
  const currentContractWithLocalId =
    allContractsInHierarchy.find((c) => c.id === contract.id) || null;
  const context = usePdfVisibility();
  const discussionContext = useDiscussionVisibility();
  const { togglePdf, isPdfOpen } = context || {};
  const { isDiscussionOpen } = discussionContext || {};
  const [activityData, setActivityData] = useState<any>(null);
  const [error, setError] = useState<unknown | null>(null);
  const { openSharingDialog } = useSharingDialog();
  const userContext = useContext(UserContext);
  const ability = useAbility();
  const canShareContract = ability.can('share', 'Contract');
  const canUpdateContract = ability.can('update', 'Contract');
  const { data: deliveryMethods = [] } = useDataDeliveryTypes();
  const [archiveLocked, setArchiveLocked] = useState(false);

  const isSidePanelOpen = isPdfOpen || isDiscussionOpen;
  const userRole = userContext?.userMetadata?.userRole;
  const userMetadata = userContext?.userMetadata;
  const dateFormat = userMetadata?.dateFormat ?? DATE_FORMAT_DEFAULT;
  const canUploadContractVersion =
    userRole === userRoles.clientSupervisor ||
    (userRole === userRoles.clientAdmin &&
      contract?.user_id === userMetadata?.userId);

  const isPostSig = userMetadata?.userProfile?.email?.includes('@postsig.com');
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view');
  const initialView =
    viewParam &&
    [
      'overview',
      'cost-allocation',
      'owner',
      'users',
      'dora',
      'audit',
      'lineage',
    ].includes(viewParam)
      ? viewParam
      : 'overview';
  const [currentView, setCurrentView] = useState<string>(initialView);
  const isEditMode =
    searchParams.get('edit') === 'true' &&
    !isViewingOriginal &&
    canUpdateContract;

  // When viewing original, overlay the original version data on the contract.
  // For product fields we rebuild vendor_products_details, vendor_products_users,
  // and other_attributes.invoice_fields.sales_tax_details from the version snapshots.
  const effectiveContract = (() => {
    if (!isViewingOriginal) return contract;

    let base: typeof contract = originalVersionData
      ? { ...contract, ...originalVersionData }
      : { ...contract };

    if (originalProductVersions) {
      // Merge original fees into vendor_products_details
      if (originalProductVersions.vendorProductsDetails.length > 0) {
        const originalDetailFees = new Map(
          originalProductVersions.vendorProductsDetails.map((d) => [
            d.id,
            d.fees,
          ]),
        );
        base = {
          ...base,
          vendor_products_details: (base.vendor_products_details ?? []).map(
            (d: { id: number; fees: number | null }) =>
              originalDetailFees.has(d.id)
                ? { ...d, fees: originalDetailFees.get(d.id) }
                : d,
          ),
        };
      }

      // Merge original number_of_users into vendor_products_users
      if (originalProductVersions.vendorProductsUsers.length > 0) {
        const originalUserCounts = new Map(
          originalProductVersions.vendorProductsUsers.map((u) => [
            u.id,
            u.number_of_users,
          ]),
        );
        base = {
          ...base,
          vendor_products_users: (base.vendor_products_users ?? []).map(
            (u: { id: number; number_of_users: number | null }) =>
              originalUserCounts.has(u.id)
                ? { ...u, number_of_users: originalUserCounts.get(u.id) }
                : u,
          ),
        };
      }

      // Merge original delivery_method_id into vendor_products (nested inside details)
      if (originalProductVersions.vendorProducts.length > 0) {
        const originalDelivery = new Map(
          originalProductVersions.vendorProducts.map((p) => [
            p.id,
            p.delivery_method_id,
          ]),
        );
        base = {
          ...base,
          vendor_products_details: (base.vendor_products_details ?? []).map(
            (d: {
              vendor_products?: {
                id: number;
                delivery_method_id: number | null;
              } | null;
            }) => {
              if (!d.vendor_products) return d;
              return originalDelivery.has(d.vendor_products.id)
                ? {
                    ...d,
                    vendor_products: {
                      ...d.vendor_products,
                      delivery_method_id: originalDelivery.get(
                        d.vendor_products.id,
                      ),
                    },
                  }
                : d;
            },
          ),
        };
      }

      // Restore original sales_tax_details.
      // undefined means no v1 snapshot exists — leave current data alone.
      // null means v1 existed but had no sales_tax, so we overlay with empty.
      if (originalProductVersions.salesTaxDetails !== undefined) {
        base = {
          ...base,
          other_attributes: {
            ...(base.other_attributes ?? {}),
            invoice_fields: {
              ...((base.other_attributes as Record<string, unknown>)
                ?.invoice_fields ?? {}),
              sales_tax_details: originalProductVersions.salesTaxDetails,
            },
          },
        };
      }
    }

    return base;
  })();

  const canExportCsv = useCanExportCsv('cpm');
  const isExportDisabled =
    contract.ai_extraction_status === 'h_failed' || contract.status_id !== 4;

  const { updateContractStatus, isLoading } = useContractStatusUpdate({
    onSuccess: () => {
      router.refresh();
    },
  });

  const { updateInvoiceStatus, isLoading: isInvoiceStatusLoading } =
    useInvoiceStatusUpdate();

  // Clear the lock once server-updated props confirm we're archived
  useEffect(() => {
    if (contract.status === 'inactive') setArchiveLocked(false);
  }, [contract.status]);
  const {
    updateRenewStatus,
    loading: isRenewStatusLoading,
    renewStatus,
  } = useRenewStatus(contract);

  const lifetimeContractValue = calculateLifetimeContractValue(
    contract,
    userMetadata?.organizationFY,
  );

  // Build unified map of current field values for disabling revert buttons
  // Key format: "${table}:${recordId}:${fieldKey}"
  const currentFieldValuesMap = useMemo(() => {
    const values: Record<string, string | number | null> = {};

    // Contract fields (editable text fields)
    for (const fieldKey of Array.from(EDITABLE_TEXT_FIELDS)) {
      values[`contracts:${contract.id}:${fieldKey}`] =
        contract[fieldKey] ?? null;
    }

    // vendor_products (delivery_method_id)
    const vendorProducts =
      contract.vendor_products_details
        ?.map(
          (d: {
            vendor_products?: { id: number; delivery_method_id: number | null };
          }) => d.vendor_products,
        )
        .filter(Boolean) || [];

    for (const product of vendorProducts) {
      if (product?.id) {
        values[`vendor_products:${product.id}:delivery_method_id`] =
          product.delivery_method_id ?? null;
      }
    }

    // vendor_products_details (fees)
    for (const detail of contract.vendor_products_details || []) {
      if (detail?.id) {
        values[`vendor_products_details:${detail.id}:fees`] =
          detail.fees ?? null;
      }
    }

    // vendor_products_users (number_of_users)
    for (const user of contract.vendor_products_users || []) {
      if (user?.id) {
        values[`vendor_products_users:${user.id}:number_of_users`] =
          user.number_of_users ?? null;
      }
    }

    const orderNumber =
      contract.metadata?.lineage?.order_number != null
        ? String(contract.metadata.lineage.order_number).trim() || null
        : null;
    values[`contracts_metadata:${contract.id}:order_number`] = orderNumber;
    values[`contracts_metadata:${contract.id}:invoice_number`] = orderNumber;

    // contracts_other_attributes (sales_tax per year)
    const salesTaxDetails =
      contract.other_attributes?.invoice_fields?.sales_tax_details ?? [];
    for (const entry of salesTaxDetails) {
      if (entry?.year != null) {
        values[`contracts_other_attributes:${entry.year}:sales_tax`] =
          entry.sales_tax != null
            ? parseFloat(String(entry.sales_tax)) || 0
            : null;
      }
    }

    return values;
  }, [contract]);

  // Lifted out of ActiveUsers so the Users tab can show an inactive-seat
  // indicator before the tab is opened
  const contractVendorProducts = useMemo(
    () =>
      (contract.vendor_products_details ?? [])
        .filter(
          (detail: {
            vendor_products: Database['public']['Tables']['vendor_products']['Row'];
          }) => detail.vendor_products,
        )
        .map(
          (detail: {
            vendor_products: Database['public']['Tables']['vendor_products']['Row'];
          }) => detail.vendor_products,
        ),
    [contract.vendor_products_details],
  );
  const contractUsersState = useContractUsers(
    contract.id,
    contractVendorProducts,
  );
  const inactiveSeatCount = contractUsersState.users.filter(
    (u) => u.status === 'inactive',
  ).length;
  const canEditCostAllocation = ability.can('manage', 'Organization');

  // Get folder info for sharing dialog from contract data
  const folderInfo = contract.folder_id
    ? { folderId: contract.folder_id, folderName: contract.folderName || null }
    : null;

  const fetchActivity = async () => {
    try {
      const data = await fetchContractActivity(contract.id);
      setActivityData(data);
      setError(null);
    } catch (error) {
      console.error('Error fetching activity data:', error);
      setError(error);
      setActivityData(null);
    }
  };

  function generateComponents(
    key: string,
    data: any,
    title: string,
    index: any,
    contractId: number,
    on: boolean,
  ) {
    switch (key) {
      case 'missing_fields':
        return (
          <>
            {Boolean(data.length) && (
              <div className="mb-4">
                <Card className="bg-gray-700/5 dark:bg-secondary/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Contract Omissions ({data.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-4 font-serif">
                      Consider addressing these in future negotiations.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {data.map((field: string, index: number) => (
                        <Badge
                          key={index}
                          variant={'outline'}
                          className="whitespace-nowrap"
                        >
                          {field}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        );

      case 'status':
        const cancelDate = contract.cancel_date?.[0]?.date;
        const endDate = contract.term_end_date?.[0]?.date;

        const hasCancelDatePassed =
          cancelDate && new Date(cancelDate) < new Date();
        const hasEndDatePassed = endDate && new Date(endDate) < new Date();
        const dateHasPassed =
          hasCancelDatePassed || (!cancelDate && hasEndDatePassed);

        // Gated on the Invoices module too, not just contract type — a
        // disabled org shouldn't still expose a live status control.
        const isInvoice =
          userMetadata?.cpmInvoicesEnabled === true &&
          isInvoiceType(contract.contract_types?.id);

        const showExpiredBanner =
          (contract.status === 'unconfirmed' && dateHasPassed) ||
          contract.status === 'inactive';

        return (
          <>
            {isInvoice && (
              <div className="mb-8">
                <div className="flex items-center gap-3 rounded-md border px-4 py-3 font-sans text-sm tracking-wide">
                  <span className="font-medium">Invoice Status</span>
                  <InvoiceStatusDropdown
                    currentStatus={
                      contract.invoice_status || DEFAULT_INVOICE_STATUS
                    }
                    onStatusUpdate={(newStatus, reason) =>
                      updateInvoiceStatus(contract.id, newStatus, reason)
                    }
                    isLoading={isInvoiceStatusLoading}
                    currentReason={contract.decision_reason ?? undefined}
                    externalInvoiceStatus={
                      contract.external_invoice_status ?? undefined
                    }
                    externalSource={contract.external_source ?? undefined}
                  />
                  {contract.external_invoice_status && (
                    <Badge variant="outline" className="whitespace-nowrap">
                      External: {contract.external_invoice_status}
                    </Badge>
                  )}
                  {contract.decision_reason && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoCircledIcon className="h-4 w-4 shrink-0 cursor-default text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="max-w-[280px] text-xs"
                        >
                          {contract.decision_reason}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            )}
            {showExpiredBanner && (
              <div className="mb-8">
                <Alert
                  variant={'destructive'}
                  className="flex items-center justify-between gap-2 bg-pink-100/30 py-4 font-sans text-sm tracking-wide dark:bg-pink-950/10"
                >
                  <span>
                    {contract.status === 'inactive' ? (
                      <span>
                        This contract has been <strong>archived</strong>.
                      </span>
                    ) : hasCancelDatePassed ? (
                      <span>
                        The <strong>cancellation date</strong> has passed. Is
                        this contract still active?
                      </span>
                    ) : (
                      <span>
                        The <strong>term end date</strong> has passed. Is this
                        contract still active?
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-right font-sans text-xs leading-tight">
                      Contract Status
                    </span>
                    <StatusDropdown
                      currentStatus={contract.status}
                      onStatusUpdate={(newStatus) =>
                        updateContractStatus(
                          contract.id,
                          newStatus,
                          contract.vendors.name,
                          contract.term_end_date?.[0]?.date,
                          contract.status,
                        )
                      }
                      isLoading={isLoading}
                      isDuplicate={contract.is_duplicate}
                    />
                  </div>
                </Alert>
              </div>
            )}
          </>
        );

      case 'invoiceValidationSummary':
        return (
          <div className="mb-8">
            <InvoiceValidationSummary
              validation={data as InvoiceValidation}
              currency={contract.currency}
            />
          </div>
        );

      case 'keyTerms':
        return (
          <>
            <TabRowWrapper
              cellWidth={4}
              key={index}
              title={title}
              components={
                data &&
                data.map((label: any, index: number) => {
                  if (isEditMode && label.metadataFieldKey) {
                    return (
                      <Label1
                        key={index}
                        title={label.title}
                        text={
                          <EditableMetadataField
                            fieldKey={label.metadataFieldKey}
                            value={label.metadataValue}
                          />
                        }
                        on={true}
                      />
                    );
                  }

                  // Check for amendment data using the same logic as grouped sections
                  const amendmentData =
                    label.key && currentContractWithLocalId
                      ? getAmendmentData({
                          fieldKey: label.key,
                          currentContract: currentContractWithLocalId,
                          hierarchy: completeHierarchy,
                          allContractsInHierarchy,
                        })
                      : null;

                  return (
                    <Label1
                      key={index}
                      title={label.title}
                      text={
                        <div className="flex items-center gap-2">
                          <CitationField
                            citation={citations.find((c) => c.id === label.key)}
                          >
                            {label.text}
                          </CitationField>
                          {label.showRenewedIcon && (
                            <RenewedIcon
                              dateType={label.dateType}
                              originalDate={label.originalDate}
                            />
                          )}
                          {label.tooltip && (
                            <TooltipProvider>
                              <Tooltip delayDuration={100}>
                                <TooltipTrigger asChild>
                                  <InfoCircledIcon className="inline h-4 w-4 shrink-0 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  className="max-w-[240px]"
                                >
                                  <p>{label.tooltip}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {amendmentData?.hasAmendmentChain && (
                            <CompactAmendmentPopover
                              fieldKey={label.key}
                              fieldTitle={label.title}
                              relatedContracts={
                                formatForAccordion(amendmentData)
                                  ?.relatedContracts || []
                              }
                              fullContractData={
                                formatForAccordion(amendmentData)
                                  ?.fullContractData || []
                              }
                            />
                          )}
                        </div>
                      }
                      on={label.on}
                    />
                  );
                })
              }
            />
          </>
        );

      case 'asset_classes':
        return (
          <div>
            <Card key={index} className="mb-4 flex items-start bg-gray-700/5">
              <CardHeader className="min-w-40 px-5 py-4">
                <CardTitle className="flex h-6 items-center text-sm">
                  Asset Classes
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  {data.map((assetClass: any) => (
                    <Badge
                      key={assetClass.id}
                      variant={'secondary'}
                      className="whitespace-nowrap"
                    >
                      {assetClass.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'tags':
        return (
          <div>
            <Card key={index} className="mb-4 flex items-start bg-gray-700/5">
              <CardHeader className="min-w-40 px-5 py-4">
                <CardTitle className="flex h-6 items-center text-sm">
                  Tags
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 py-4">
                <div className="flex flex-wrap gap-1">
                  <ContractTags contractId={contractId} />
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'nda_risks':
        const risks = data || {};
        const riskLabels = {
          perpetual_nda: 'Perpetual NDA',
          unilateral_nda: 'Unilateral NDA',
          non_solicitation: 'Non-Solicitation',
          uncapped_liability: 'Uncapped Liability',
          foreign_jurisdiction: 'Foreign Jurisdiction',
          no_carve_out_provisions: 'No Carve-Out Provisions',
          post_end_of_term_obligations: 'Post End-of-Term Obligations',
        };

        const riskDescriptions = {
          perpetual_nda: 'This is ongoing with no end of term date specified.',
          unilateral_nda:
            'This will obligate ONLY the signing party to confidentiality.',
          non_solicitation:
            'This obligates one or both parties to not to hire or attempt to hire an employee of the counterparty.',
          uncapped_liability:
            'This has no upward limit on monetary damages or other liabilities that can be incurred by one or both parties.',
          foreign_jurisdiction:
            'This stipulates any controversies arising will be adjudicated outside of the United States.',
          no_carve_out_provisions:
            "This fails to stipulate what doesn't constitute confidential information (i.e. publicly known information, compelled disclosure by courts).",
          post_end_of_term_obligations:
            'This has a term beyond the end of term that obliges continued confidentiality to one or both parties.',
        };

        const activeRisks = Object.entries(risks)
          .filter(([key, value]) => value === true)
          .map(([key]) => key);
        const riskFlags = activeRisks.length;
        const totalFlags = Object.keys(riskLabels).length;

        const riskLevel: 1 | 2 | 3 =
          riskFlags >= 4 ? 3 : riskFlags >= 1 ? 2 : 1;

        if (riskFlags === 0) return null;

        return (
          <div>
            <Card key={index} className="mb-4 bg-gray-700/5">
              <CardHeader className="px-5 py-4">
                <CardTitle className="text-sm">Identified Risks</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {riskLevel === 3 ? 'High Risk' : 'Medium Risk'}
                    </span>

                    <NdaRiskLevelIndicator
                      riskLevel={riskLevel}
                      riskFlags={riskFlags}
                      size="md"
                      showLabel={false}
                      showTooltip={false}
                    />

                    <span
                      className="align-middle text-sm tabular-nums leading-none"
                      aria-label={`${riskFlags} of ${totalFlags}`}
                    >
                      <span className="font-medium">({riskFlags}</span>
                      <span className="text-xs opacity-60">/{totalFlags}</span>
                      <span className="font-medium">)</span>
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-4">
                  {activeRisks.map((riskKey: string) => (
                    <div key={riskKey} className="bg-white/40 px-4 py-2">
                      <CitationField
                        citation={citations.find((c) => c.id === riskKey)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            {riskLabels[riskKey as keyof typeof riskLabels] ||
                              riskKey}
                          </span>
                          <TooltipProvider>
                            <Tooltip delayDuration={100}>
                              <TooltipTrigger asChild>
                                <InfoCircledIcon className="inline h-4 w-4 shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="w-72">
                                <p>
                                  {
                                    riskDescriptions[
                                      riskKey as keyof typeof riskDescriptions
                                    ]
                                  }
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </CitationField>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'notes':
        return (
          <Card key={index} className="mb-4 bg-psblue/5 dark:bg-psblue/10">
            <NoteCard title={'PostSig Notes'} text={data} />
          </Card>
        );

      case 'summary':
        return (
          <div className="mb-4">
            <TermCard
              key={index}
              contractId={contractId}
              title={'Summary'}
              text={data}
              on={on}
              citations={citations.find((c) => c.id === key)}
              fieldKey={key}
              currentContract={currentContractWithLocalId || contract}
              hierarchy={completeHierarchy}
              allContractsInHierarchy={allContractsInHierarchy}
            />
          </div>
        );

      case 'productsLicensed':
        return (
          <ProductsLicensed
            data={data}
            citations={citations.find((c) => c.id === 'products_list')}
            deliveryMethods={deliveryMethods}
          />
        );

      case 'productCredits':
        return <ProductCredits data={data} />;

      case 'grouped':
        const filteredSectionData = data.filter(
          (item: any) =>
            ((item.text && item.text.trim() !== '') || item.jsx) && item.on,
        );

        if (filteredSectionData.length === 0) return null;

        const renderGroupedFieldContent = (item: any, menuSlot?: ReactNode) => {
          if (isEditMode && item.text !== undefined && !item.jsx) {
            return (
              <EditableField fieldKey={item.key} value={item.text}>
                {item.text
                  ? item.text.charAt(0).toUpperCase() + item.text.slice(1)
                  : ''}
              </EditableField>
            );
          }

          const fieldIsEditable =
            item.key && isEditableField(item.key) && !item.jsx;
          const amendmentData =
            !isEditMode && item.key && currentContractWithLocalId
              ? getAmendmentData({
                  fieldKey: item.key,
                  currentContract: currentContractWithLocalId,
                  hierarchy: completeHierarchy,
                  allContractsInHierarchy,
                })
              : null;

          if (!isEditMode && fieldIsEditable && item.text !== undefined) {
            const displayContent = amendmentData?.hasAmendmentChain ? (
              <GroupedFieldAmendmentContent
                item={item}
                amendmentData={amendmentData}
                contract={contract}
                currentContractWithLocalId={currentContractWithLocalId}
                menuSlot={menuSlot}
              />
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <OptimisticTextDisplay
                    fieldKey={item.key}
                    originalValue={item.text}
                    contractId={contract.id}
                  />
                </div>
                {menuSlot}
              </div>
            );

            return (
              <InlineEditWrapper fieldKey={item.key} value={item.text}>
                {displayContent}
              </InlineEditWrapper>
            );
          }

          if (amendmentData?.hasAmendmentChain) {
            return (
              <GroupedFieldAmendmentContent
                item={item}
                amendmentData={amendmentData}
                contract={contract}
                currentContractWithLocalId={currentContractWithLocalId}
                menuSlot={menuSlot}
              />
            );
          }

          return (
            item.jsx ||
            (item.text
              ? item.text.charAt(0).toUpperCase() + item.text.slice(1)
              : '')
          );
        };

        return (
          <div className="mb-4 mt-4">
            <Card key={index}>
              <CardHeader className="h-[60px] flex-row items-center">
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`space-y-4 ${contract.status_id !== 4 ? 'opacity-20' : ''}`}
                >
                  <div className="divide-y divide-foreground/10">
                    {filteredSectionData.map((item: any, idx: number) => (
                      <GroupedFieldRow
                        key={idx}
                        item={item}
                        isSidePanelOpen={isSidePanelOpen ?? false}
                        isEditMode={isEditMode}
                        citations={citations}
                        renderContent={(menuSlot) =>
                          renderGroupedFieldContent(item, menuSlot)
                        }
                      />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'permissionsAndScopeOfUse':
        return data.some(
          (item: any) =>
            ((item.text && item.text.trim() !== '') || item.jsx) && item.on,
        ) ? (
          <div className="mb-4 mt-4">
            <Card key={index}>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`space-y-4 ${contract.status_id !== 4 ? 'opacity-20' : ''}`}
                >
                  <div className="divide-y divide-foreground/10">
                    {data
                      .filter(
                        (item: any) =>
                          (item.text && item.text.trim() !== '') || item.jsx,
                      )
                      .map((item: any, idx: number) => (
                        <div key={idx} className="grid grid-cols-4 gap-0 py-2">
                          <div className="col-span-1 pt-[.4rem] font-label text-[0.825rem] uppercase leading-tight tracking-wide text-foreground/85">
                            <div className="flex items-center gap-2">
                              {item.title}
                              {item.isLegacy && (
                                <Badge
                                  variant="secondary"
                                  className="ml-2 text-[0.7rem]"
                                >
                                  Legacy
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div
                            className={`${!isSidePanelOpen && 'pr-10 text-lg'} col-span-3 font-serif`}
                          >
                            {item.jsx || (
                              <CitationField
                                citation={citations.find(
                                  (c) => c.id === item.key,
                                )}
                              >
                                {item.text}
                              </CitationField>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null;

      case 'terms':
        return (
          <>
            <TabRowWrapper
              cellWidth={2}
              key={index}
              title={title}
              components={
                data &&
                data.map((label: any, index: number) => {
                  if (label.key === 'amended_clauses') {
                    return (
                      <AmendedClausesCard
                        amendedClauses={label.text}
                        title="Amended Clauses"
                        key={index}
                      />
                    );
                  }
                  return (
                    <TermCard
                      key={index}
                      contractId={contractId}
                      title={label.title}
                      text={label.text}
                      on={label.on}
                      citations={_.find(citations, { id: label.key })}
                      fieldKey={label.key}
                      currentContract={currentContractWithLocalId || contract}
                      hierarchy={completeHierarchy}
                      allContractsInHierarchy={allContractsInHierarchy}
                    />
                  );
                })
              }
            />
          </>
        );

      case 'ndaTermsCore':
      case 'ndaTermsRestrictions':
      case 'ndaTermsLegal':
        const filteredNdaData = data.filter(
          (item: any) =>
            ((item.text && item.text.trim() !== '') || item.jsx) && item.on,
        );

        return filteredNdaData.length > 0 ? (
          <div className="mb-4 mt-4">
            <Card key={index}>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`space-y-4 ${contract.status_id !== 4 ? 'opacity-20' : ''}`}
                >
                  <div className="divide-y divide-foreground/10">
                    {filteredNdaData.map((item: any, idx: number) => (
                      <div key={idx} className="grid grid-cols-4 gap-0 py-2">
                        <div className="col-span-1 pt-[.4rem] font-label text-[0.825rem] uppercase leading-tight tracking-wide text-foreground/85">
                          <div className="flex items-center gap-2">
                            {item.title}
                          </div>
                        </div>
                        <div
                          className={`${!isSidePanelOpen && 'pr-10 text-lg'} col-span-3 font-serif`}
                        >
                          {item.jsx || (
                            <CitationField
                              citation={citations.find(
                                (c) => c.id === item.key,
                              )}
                            >
                              {item.text}
                            </CitationField>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null;

      default:
        break;
    }
  }

  function formatLabelsDataFromConfig(contract: any) {
    const config = getContractConfig(contract.type_id || contractTypes.MSA);
    const statusItem = {
      key: 'status',
      title: 'Contract Status',
      data: contract,
      on: contract.status,
    };

    if (contract.status_id !== 4) {
      const overview = [];
      // Archival is independent of extraction progress — the archived
      // banner must show even if status_id hasn't reached 4 yet.
      if (contract.status === 'inactive') overview.push(statusItem);
      overview.push(
        {
          key: 'keyTerms',
          title: 'Key Terms',
          data: [
            { title: 'Start Date', text: 'Pending', on: false },
            { title: 'End Date', text: 'Pending', on: false },
            { title: 'Cancel By Date', text: 'Pending', on: false },
            { title: 'Subscription Term', text: 'Pending', on: false },
            { title: 'Renewal Type', text: 'Pending', on: false },
            { title: 'Multi-Year Agreement', text: 'Pending', on: false },
          ],
        },
        {
          key: 'summary',
          title: 'PostSig Summary',
          data: contract.summary,
          on: true,
        },
      );
      return { overview };
    }

    const overview = [];

    // Always add status first
    overview.push(statusItem);

    // Add overview zone fields as keyTerms
    const overviewFieldKeys = config.overview || [];
    if (overviewFieldKeys.length > 0) {
      const keyTermsData = overviewFieldKeys
        .map((fieldKey) => {
          const field = getFieldDefinition(fieldKey);
          if (!field) return null;

          const rawValue = getFieldValue(effectiveContract, field);
          const value = field.isDate
            ? formatDate(rawValue, dateFormat, rawValue)
            : rawValue;

          // Contract No./Invoice No. are stored in contracts.metadata, so they
          // edit through the metadata pseudo-table rather than a contracts column.
          const metadataFieldKey = isFieldEditable(
            'contracts_metadata',
            field.key,
          )
            ? field.key
            : null;

          // Check if this is a date field that should show the renewed icon
          const isDateField =
            fieldKey === 'term_start_date' || fieldKey === 'term_end_date';
          const isContractRenewed =
            contract.renewed || contract.term_end_date?.length > 1;
          const shouldShowRenewedIcon =
            isDateField && isContractRenewed && Boolean(value);

          let originalDate = null;
          let dateType = null;

          if (shouldShowRenewedIcon) {
            dateType = fieldKey === 'term_start_date' ? 'start' : 'end';

            // Get original date from processed fields if available, otherwise calculate from raw data
            if (fieldKey === 'term_start_date') {
              originalDate =
                contract.originalStartDate ||
                (contract.term_start_date?.length > 1
                  ? contract.term_start_date[
                      contract.term_start_date.length - 1
                    ]?.date
                  : null);
            } else if (fieldKey === 'term_end_date') {
              originalDate =
                contract.originalEndDate ||
                (contract.term_end_date?.length > 1
                  ? contract.term_end_date[contract.term_end_date.length - 1]
                      ?.date
                  : null);
            }
          }

          return {
            key: field.citationId || field.key,
            title: field.title,
            text: value || 'N/A',
            metadataFieldKey,
            metadataValue: metadataFieldKey ? value || null : null,
            on: Boolean(value),
            showRenewedIcon: shouldShowRenewedIcon,
            dateType: dateType,
            originalDate: originalDate,
            tooltip: getFieldTooltip(effectiveContract, field),
          };
        })
        .filter((item) => item !== null);

      if (keyTermsData.length > 0) {
        overview.push({
          key: 'keyTerms',
          title: 'Key Terms',
          data: keyTermsData,
        });
      }
    }

    // Add postsigMetadata zone items
    const postsigMetadataKeys = config.postsigMetadata || [];
    postsigMetadataKeys.forEach((fieldKey) => {
      switch (fieldKey) {
        case 'postsig_notes':
          overview.push({
            key: 'notes',
            title: 'PostSig Notes',
            data: contract.postsig_notes,
            on: contract.postsig_notes,
          });
          break;
        case 'missing_fields':
          overview.push({
            key: 'missing_fields',
            title: 'Missing Fields',
            data: getMissingFields(
              contract,
              userMetadata?.organizationMissingClauseSettings?.settings,
            ),
          });
          break;
        case 'asset_classes':
          if (contract.asset_classes?.length > 0) {
            overview.push({
              key: 'asset_classes',
              title: 'Asset Classes',
              data: contract.asset_classes,
              on: contract.asset_classes,
            });
          }
          break;
        case 'tags':
          overview.push({
            key: 'tags',
            title: 'Tags',
            data: contract.id,
            on: true,
          });
          break;
        case 'summary':
          overview.push({
            key: 'summary',
            title: 'PostSig Summary',
            data: contract.summary,
            on: contract.summary,
          });
          break;
        case 'nda_risks':
          const ndaRisks = contract.other_attributes?.nda_fields?.nda_insights;
          if (ndaRisks && typeof ndaRisks === 'object') {
            overview.push({
              key: 'nda_risks',
              title: 'Identified Risks',
              data: ndaRisks,
              on: true,
            });
          }
          break;
      }
    });

    if (isInvoiceType(contract.type_id) && invoiceValidation) {
      overview.push({
        key: 'invoiceValidationSummary',
        title: 'Invoice Validation Summary',
        data: invoiceValidation,
        on: true,
      });
    }

    // Add contractDetails zone sections
    const contractDetailsSections = config.contractDetails || [];
    contractDetailsSections.forEach((section: DetailSection) => {
      if (section.fields.includes('products_licensed')) {
        overview.push({
          key: 'productsLicensed',
          title: section.title,
          data: effectiveContract,
        });
        return;
      }

      if (section.fields.includes('product_credits')) {
        overview.push({
          key: 'productCredits',
          title: section.title,
          data: effectiveContract,
        });
        return;
      }

      // Handle regular field sections
      const sectionData = section.fields
        .map((fieldKey) => {
          const field = getFieldDefinition(fieldKey);
          if (!field) return null;

          if (
            field.jsx ||
            field.key === 'number_of_users' ||
            field.key === 'data_delivery_types'
          ) {
            // Handle JSX fields specially
            if (field.key === 'number_of_users') {
              const jsx = formatJsxField(field.key, contract);

              return {
                key: field.citationId || field.key,
                title: field.title,
                jsx: jsx,
                on: shouldDisplayField(effectiveContract, field),
                isLegacy: field.isLegacy,
              };
            }

            if (field.key === 'data_delivery_types') {
              const jsx = formatJsxField(field.key, contract);

              return {
                key: field.citationId || field.key,
                title: field.title,
                jsx: jsx,
                on: shouldDisplayField(effectiveContract, field),
                isLegacy: field.isLegacy,
              };
            }

            return {
              key: field.citationId || field.key,
              title: field.title,
              jsx: field.jsx ? field.jsx(null, contract) : null,
              on: shouldDisplayField(effectiveContract, field),
              isLegacy: field.isLegacy,
            };
          }

          const value = getFieldValue(effectiveContract, field);
          return {
            key: field.citationId || field.key,
            title: field.title,
            text:
              (field.isDate ? formatDate(value, dateFormat, value) : value) ||
              '',
            on: shouldDisplayField(effectiveContract, field),
            isLegacy: field.isLegacy,
            tooltip: getFieldTooltip(effectiveContract, field),
          };
        })
        .filter((item) => item !== null);

      // Determine section render type based on number of fields
      if (section.fields.length > 1) {
        // Multi-field sections use grouped rendering
        const sectionKey = 'grouped';
        const filteredData = sectionData.filter(
          (item) => item !== null && item.on,
        );
        if (filteredData.length > 0) {
          overview.push({
            key: sectionKey,
            title: section.title,
            data: filteredData,
          });
        }
      } else {
        // Single field sections use individual TermCard rendering
        const sectionKey = 'terms';
        const filteredData = sectionData.filter(
          (item) => item !== null && item.on,
        );
        if (filteredData.length > 0) {
          overview.push({
            key: sectionKey,
            title: section.title,
            data: filteredData,
          });
        }
      }
    });

    // Group consecutive individual terms sections into a single terms grid
    const groupedOverview = [];
    let pendingTerms = [];

    for (const item of overview) {
      if (item.key === 'terms' && item.data.length === 1) {
        // This is an individual term - add to pending group
        pendingTerms.push(...item.data);
      } else {
        // Not an individual term - flush any pending terms first
        if (pendingTerms.length > 0) {
          groupedOverview.push({
            key: 'terms',
            title: 'Additional Terms',
            data: pendingTerms,
          });
          pendingTerms = [];
        }
        // Add the current non-terms item
        groupedOverview.push(item);
      }
    }

    // Don't forget to flush any remaining pending terms
    if (pendingTerms.length > 0) {
      groupedOverview.push({
        key: 'terms',
        title: 'Additional Terms',
        data: pendingTerms,
      });
    }

    return { overview: groupedOverview };
  }

  const labelsData: any = formatLabelsDataFromConfig(contract);

  function generateTabContent(
    tabKey: any,
    labelsData: any,
    contractId: number,
  ) {
    return (
      <div className="">
        {labelsData[tabKey].map(
          (
            {
              title,
              data,
              key,
              on,
            }: { title: any; data: any; key: string; on: boolean },
            index: any,
          ) => (
            <div key={`${key}-${title}-${index}`}>
              {data &&
                generateComponents(key, data, title, index, contractId, on)}
            </div>
          ),
        )}
      </div>
    );
  }

  const config = getContractConfig(contract.type_id || contractTypes.MSA);
  const availableTabs = config.tabs || ['owner', 'dora', 'audit'];

  const tabs = [
    {
      key: 'overview',
      label: 'Overview',
      content: generateTabContent('overview', labelsData, contract.id),
    },
    ...(costAllocationEnabled && availableTabs.includes('allocation')
      ? [
          {
            key: 'cost-allocation',
            label: 'Cost Allocation',
            content: (
              <CostAllocationTab
                contractId={contract.id}
                canEdit={canEditCostAllocation && !isViewingOriginal}
              />
            ),
          },
        ]
      : []),
    ...(availableTabs.includes('owner')
      ? [
          {
            key: 'owner',
            label: 'Contract Owner',
            content: (
              <div className="space-y-4">
                <ContractOwner contract={contract} />
              </div>
            ),
          },
        ]
      : []),
    ...(availableTabs.includes('users')
      ? [
          {
            key: 'users',
            label: 'Active Users',
            indicator:
              inactiveSeatCount > 0 ? (
                <TooltipProvider>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {inactiveSeatCount} seat
                      {inactiveSeatCount > 1 ? 's' : ''} held by departed
                      employees
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : undefined,
            content: (
              <ActiveUsers
                contract={{
                  id: contract.id,
                  vendor_products_users: contract.vendor_products_users,
                  vendor_products: contractVendorProducts,
                }}
                orgGroups={orgGroups}
                contractUsers={contractUsersState}
              />
            ),
          },
        ]
      : []),
    ...(availableTabs.includes('dora')
      ? [
          {
            key: 'dora',
            label: 'DORA Analysis',
            content: (
              <DoraAnalysis
                contract={contract}
                isSidePanelOpen={isSidePanelOpen}
                isPostSig={isPostSig}
              />
            ),
          },
        ]
      : []),
    ...(availableTabs.includes('audit')
      ? [
          {
            key: 'log',
            label: 'Audit Log',
            content: (
              <AuditLog
                activities={activities || []}
                contractId={contract.id}
                vendorName={contract.vendors?.name}
                currentFieldValues={currentFieldValuesMap}
                deliveryMethods={deliveryMethods}
              />
            ),
          },
        ]
      : []),
    ...(availableTabs.includes('lineage') &&
    completeHierarchy &&
    hasLineageContent(completeHierarchy, lineageGraphExtras?.billingEdges)
      ? [
          {
            key: 'lineage',
            label: 'Lineage',
            content: (
              <div className="space-y-4">
                <ContractLineageMap
                  completeHierarchy={completeHierarchy}
                  currentContract={currentContractWithLocalId || contract}
                  currentId={contract.id}
                  allContractsInHierarchy={allContractsInHierarchy}
                  additionalHierarchies={
                    lineageGraphExtras?.additionalHierarchies
                  }
                  additionalContracts={lineageGraphExtras?.additionalContracts}
                  billingEdges={lineageGraphExtras?.billingEdges}
                />
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <EditProvider
      contractId={contract.id}
      isEditMode={isEditMode}
      canEdit={
        canUpdateContract &&
        contract.status !== 'inactive' &&
        contract.ai_extraction_status === 'h_success' &&
        contract.type_id !== contractTypes.NDA
      }
      contractUpdatedAt={contract.updated_at}
    >
      <div
        id="detailsPane"
        className={`${isSidePanelOpen ? 'w-1/2 border-r' : 'w-full'} top-0 z-10 flex h-[calc(100vh-3.5rem)] flex-col`}
      >
        <div className="scrollbar-track-gray/20 scrollbar-thumb-gray flex-1 overflow-y-auto pb-8 scrollbar-thin">
          <div
            id="detailsPaneHeader"
            className="mx-auto flex max-w-7xl items-start px-6 py-12"
          >
            <div className="flex min-w-[72px] flex-grow items-center gap-6">
              {contract.ai_extraction_status === 'h_success' ? (
                <div className="flex items-center">
                  <ErrorBoundary
                    errorComponent={() => (
                      <div className="h-[72px] w-[72px] rounded-sm border bg-gray-700/10" />
                    )}
                  >
                    <Suspense
                      fallback={
                        <div
                          style={{
                            display: 'flex',
                            position: 'relative',
                            width: 72,
                            height: 72,
                            fontSize: 72 / 2,
                          }}
                          className="rounded-sm"
                        ></div>
                      }
                    >
                      <Link
                        href={
                          contract.ai_extraction_status === 'h_success'
                            ? `/vendors/${contract.vendors.id}`
                            : ''
                        }
                        className="flex items-center"
                      >
                        <VendorIcon
                          name={contract.vendors?.name ?? ''}
                          domain={contract.vendors?.domain ?? ''}
                          width={72}
                          height={72}
                        />
                      </Link>
                    </Suspense>
                  </ErrorBoundary>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    position: 'relative',
                    width: 72,
                    height: 72,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                  className="rounded-sm border bg-gray-700/10"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="100%"
                    height="100%"
                    viewBox="0 0 72 72"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth=".5"
                    className="text-neutral-400"
                  >
                    <line x1="0" y1="0" x2="72" y2="72"></line>{' '}
                    <line x1="72" y1="0" x2="0" y2="72"></line>{' '}
                  </svg>
                </div>
              )}
              <h1
                className={`${isSidePanelOpen && 'text-4xl'} flex flex-col items-start gap-3 font-serif leading-none transition-all duration-300 ease-in-out`}
              >
                <Link
                  href={
                    contract.ai_extraction_status === 'h_success'
                      ? `/vendors/${contract.vendors.id}`
                      : ''
                  }
                  className="-mt-1"
                >
                  {contract?.vendors?.name || 'Contract Error'}
                </Link>

                {contract.ai_extraction_status === 'h_success' ? (
                  <div className="font-normal flex gap-2 text-xs text-gray-700">
                    {contract?.contract_types && (
                      <CitationField
                        citation={citations.find(
                          (c) => c.id === 'contract_type',
                        )}
                      >
                        <Badge variant={'outline'}>
                          {contract.contract_types.name}
                        </Badge>
                      </CitationField>
                    )}
                    {contract.all_parties_signed === 'No' &&
                      !isInvoiceType(contract.contract_types.id) &&
                      contract.contract_types.id !== contractTypes.TOS && (
                        <Badge variant={'secondary'}>Not Executed</Badge>
                      )}
                    {contract.will_not_renew && (
                      <Badge variant={'secondary'}>Will Not Renew</Badge>
                    )}
                    {contract.external_source && (
                      <Badge variant={'outline'}>
                        {String(contract.external_source)
                          .charAt(0)
                          .toUpperCase() +
                          String(contract.external_source).slice(1)}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <Badge variant={'outline'}>{contract.file_name}</Badge>
                )}
              </h1>
            </div>
            <div className="flex justify-center gap-3">
              {contract.all_parties_signed === 'No' &&
                canUploadContractVersion && (
                  <UploadContractVersionButton
                    contractId={contract.id}
                    originalUserId={contract.user_id}
                  />
                )}
              <Button
                onClick={() =>
                  openSharingDialog({
                    itemId: contract.id,
                    itemType: 'contract',
                    contract: {
                      id: contract.id,
                      vendors: contract.vendors,
                      contract_types: contract.contract_types,
                      uploaded_by: contract.uploaded_by,
                    },
                    folderACLs,
                  })
                }
                className="gap-1"
                disabled={!canShareContract}
              >
                Share
              </Button>
              <DiscussionButton
                userId={userContext?.userMetadata?.userId}
                contractId={contract.id}
                initialUnreadCommentsCount={initialUnreadCommentsCount}
              />
              <Button
                variant={'outline'}
                onClick={togglePdf}
                className={`h-9 w-9 ${isPdfOpen && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'}`}
              >
                <ReaderIcon width={18} height={18} />
              </Button>
              {userRole && postsigAdminRoles.includes(userRole) && (
                <Link
                  href={`/ext/contracts/${contract.id}/`}
                  target="_blank"
                  className="font-medium flex items-center gap-2 rounded-sm border border-yellow bg-yellow px-4 text-sm"
                >
                  Extract
                </Link>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger className="flex h-9 w-9 items-center justify-center rounded-sm outline-none hover:bg-gray-700/10">
                  <DotsHorizontalIcon width={20} height={20} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <EditMenuItem
                    onClick={() => {
                      const params = new URLSearchParams(
                        searchParams.toString(),
                      );
                      params.set('edit', 'true');
                      params.delete('viewOriginal');
                      router.push(`?${params.toString()}`);
                    }}
                    disabled={
                      !canUpdateContract ||
                      contract.status === 'inactive' ||
                      contract.ai_extraction_status !== 'h_success' ||
                      contract.type_id === contractTypes.NDA
                    }
                  />
                  {hasVersions && (
                    <DropdownMenuItem
                      onClick={() => {
                        const params = new URLSearchParams(
                          searchParams.toString(),
                        );
                        params.set('viewOriginal', 'true');
                        params.delete('edit');
                        router.push(`?${params.toString()}`);
                      }}
                    >
                      <EyeOpenIcon className="h-4 w-4" />
                      <span>View Original</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={
                      isExportDisabled ||
                      !documentsWithSignedUrls?.[0]?.signedUrl
                    }
                  >
                    <DownloadIcon className="h-4 w-4 flex-shrink-0" />
                    <a
                      href={documentsWithSignedUrls?.[0]?.signedUrl || '#'}
                      className="block w-full text-sm"
                      target="_blank"
                      rel="noopener noreferrer"
                      download={
                        documentsWithSignedUrls?.[0]?.file_path
                          ?.split('/')
                          .pop() ||
                        contract?.vendors?.name?.replace(/[^a-zA-Z0-9]/g, '_') +
                          '.pdf'
                      }
                    >
                      Download PDF
                    </a>
                  </DropdownMenuItem>
                  {latestVersionSignedUrl && (
                    <DropdownMenuItem disabled={isExportDisabled}>
                      <DownloadIcon className="h-4 w-4 flex-shrink-0" />
                      <a
                        href={latestVersionSignedUrl || '#'}
                        className="block w-full px-4 py-2 text-sm"
                        target="_blank"
                        rel="noopener noreferrer"
                        download={
                          latestVersionSignedUrl?.split('/').pop() ||
                          contract?.vendors?.name?.replace(
                            /[^a-zA-Z0-9]/g,
                            '_',
                          ) + '.pdf'
                        }
                      >
                        Download Executed PDF
                      </a>
                    </DropdownMenuItem>
                  )}
                  {canExportCsv && (
                    <DropdownMenuItem
                      disabled={isExportDisabled}
                      className={
                        isExportDisabled ? 'cursor-not-allowed opacity-50' : ''
                      }
                    >
                      <DownloadIcon className="h-4 w-4 flex-shrink-0" />
                      <a
                        href="#"
                        className="block w-full text-sm"
                        onClick={(e) => {
                          e.preventDefault();
                          if (isExportDisabled) return;

                          // Get the contract configuration for this contract type
                          const contractConfig = getContractConfig(
                            contract.type_id || contractTypes.MSA,
                          );

                          // Get all configured fields that should be included in the export
                          const fieldsToInclude = getAllConfiguredFields(
                            contract,
                            contractConfig,
                          );

                          exportCSV({
                            id: contract.id,
                            fiscalYearStartMonth:
                              userMetadata?.organizationFY || 1,
                            fieldsToInclude,
                          })
                            .then((blob: any) => {
                              if (blob) {
                                const filename = documentExportFilename(
                                  contract.type_id,
                                  contract.id,
                                );
                                handleDownload(blob, filename);
                                logExportBeacon('contract-configurable-csv', {
                                  format: 'csv',
                                  filename,
                                  resourceIds: [contract.id],
                                  fieldCount: fieldsToInclude?.length,
                                });
                              } else {
                                console.error(
                                  'Export failed: No blob returned',
                                );
                              }
                            })
                            .catch((err) =>
                              console.error('Export failed:', err),
                            );
                        }}
                      >
                        Export as CSV
                      </a>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="w-full"
                    disabled={
                      contract.status !== 'active' || !canUpdateContract
                    }
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="flex w-full items-center justify-between">
                      <span className="inline-flex items-center gap-2">
                        <CircleBackslashIcon className="h-4 w-4" />
                        Will Not Renew
                      </span>
                      {isRenewStatusLoading ? (
                        <ReloadIcon className="h-4 w-4 animate-spin" />
                      ) : (
                        <Checkbox
                          checked={renewStatus}
                          onCheckedChange={(value) =>
                            updateRenewStatus(value === true)
                          }
                          disabled={
                            isRenewStatusLoading || contract.status !== 'active'
                          }
                        />
                      )}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      setArchiveLocked(true);
                      const ok = await updateContractStatus(
                        contract.id,
                        'inactive',
                        contract.vendors.name,
                        contract.term_end_date?.[0]?.date,
                        contract.status,
                      );
                      // If the request failed, unlock so the user can retry
                      if (!ok) setArchiveLocked(false);
                    }}
                    disabled={
                      isLoading ||
                      archiveLocked ||
                      contract.status === 'inactive' ||
                      !canUpdateContract
                    }
                  >
                    <span className="flex w-4 justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <g clipPath="url(#clip0_4467_5596)">
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M10.875 1.125H1.125V2.7H10.875V1.125ZM0 0V3.75H12V0H0Z"
                            fill="currentColor"
                          />
                          <rect
                            x="3.75"
                            y="5.475"
                            width="4.35"
                            height="1.125"
                            fill="currentColor"
                          />
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M0.525 3.75H1.65V10.875H10.35V3.75H11.475V12H0.525V3.75Z"
                            fill="currentColor"
                          />
                        </g>
                      </svg>
                    </span>
                    <span className="pt-[1px]">
                      {isLoading ? 'Archiving...' : 'Archive'}
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="">
            <Tab
              tabs={tabs}
              defaultTab={initialView}
              onViewChange={setCurrentView}
              showFooterOnTab="overview"
              useUrlState={true}
              urlParamName="view"
            />
          </div>
        </div>
        {isEditMode && <EditToolbar />}
        {isViewingOriginal && <OriginalPreviewToolbar />}
      </div>
    </EditProvider>
  );
});
