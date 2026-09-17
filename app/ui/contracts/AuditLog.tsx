import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { parseISO } from 'date-fns';
import { ContractActivityType } from '@/constants/types';
import { ContractActivity as Activity } from '@/lib/v2';
import ExportTableCSVButton from '@/components/contracts/ExportTableCSVButton';
import EditActivityRow from './EditActivityRow';
import BulkUsersList from './BulkUsersList';
import { getInvoiceStatusLabel } from '@/constants/invoiceStatus';
import { useDateFormat } from '@/hooks/useDateFormat';
import type { AllocationChangedActivityData } from '@/constants/types';
import {
  allocationChangeHeadline,
  summarizeAllocationChange,
} from '@/lib/v2/cost-allocation/activity-labels';

interface DeliveryMethod {
  id: number;
  name: string;
}

type FieldValueKey = `${string}:${number}:${string}`;

interface AuditLogProps {
  activities: Activity[];
  contractId: number;
  vendorName?: string;
  currentFieldValues?: Record<FieldValueKey, string | number | null>;
  deliveryMethods?: DeliveryMethod[];
}

export default function AuditLog({
  activities,
  contractId,
  vendorName,
  currentFieldValues,
  deliveryMethods = [],
}: AuditLogProps) {
  const { formatDateTime } = useDateFormat();
  const formatProviderName = (provider?: string | null) => {
    if (!provider) return 'Integration';
    if (provider.toLowerCase() === 'xero') return 'Xero';
    if (provider.toLowerCase() === 'ramp') return 'Ramp';

    return provider.charAt(0).toUpperCase() + provider.slice(1);
  };

  const formatExternalStatus = (status?: string | null) => status || 'Unknown';

  const formatLocalInvoiceStatus = (status?: string | null) =>
    status ? getInvoiceStatusLabel(status) : 'Unknown';

  const didExternalStatusChange = (data: Record<string, any>) =>
    data.external_status_old !== data.external_status_new;

  const isXeroOutboundNote = (data: Record<string, any>) =>
    data.provider?.toLowerCase?.() === 'xero' && data.syncType === 'outbound';

  // Helper function to format date in user's local timezone
  const formatLocalDateTime = (dateString: string) => {
    if (!dateString) {
      return 'Unknown date';
    }

    // The database timestamps are in UTC but don't have the 'Z' suffix
    // So we need to explicitly treat them as UTC. Timestamptz values may
    // already include an offset, and appending Z to those makes an invalid date.
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(dateString);
    const utcTimestamp = hasTimezone ? dateString : dateString + 'Z';
    const date = new Date(utcTimestamp);

    if (Number.isNaN(date.getTime())) {
      return 'Unknown date';
    }

    // Date part follows the user's format preference; time/timezone appended.
    return formatDateTime(date, 'Unknown date');
  };
  function formatActivityDescription(activity: Activity): React.ReactNode {
    const data = activity.activity_data as Record<string, any>;

    switch (activity.activity_type) {
      case ContractActivityType.CONTRACT_UPLOADED:
        return 'Contract uploaded';

      case ContractActivityType.WILL_NOT_RENEW:
        if (data.status) {
          return (
            <>
              Set contract status to <strong>Will Not Renew</strong>
            </>
          );
        } else {
          return (
            <>
              Removed contract status <strong>Will Not Renew</strong>
            </>
          );
        }

      case ContractActivityType.CONTRACT_STATUS_CHANGED:
        const oldStatus = data.oldStatus || 'unknown';
        const newStatus = data.newStatus;

        if (oldStatus === 'unconfirmed' && newStatus === 'active') {
          return 'Contract renewal confirmed';
        } else if (oldStatus === 'inactive' && newStatus === 'active') {
          return 'Contract unarchived';
        } else if (oldStatus === 'active' && newStatus === 'inactive') {
          return 'Contract archived';
        } else {
          return `Contract status changed from ${oldStatus} to ${newStatus}`;
        }

      case ContractActivityType.INVOICE_STATUS_CHANGED:
        return `Invoice status changed from ${getInvoiceStatusLabel(data.oldStatus)} to ${getInvoiceStatusLabel(data.newStatus)}`;

      case ContractActivityType.INVOICE_IMPORTED:
        return `Invoice imported from ${formatProviderName(data.provider)}`;

      case ContractActivityType.EXTERNAL_INVOICE_STATUS_CHANGED:
        if (
          data.invoice_status_old &&
          data.invoice_status_new &&
          data.invoice_status_old !== data.invoice_status_new
        ) {
          return didExternalStatusChange(data) ? (
            <>
              {formatProviderName(data.provider)} invoice status changed from{' '}
              <strong>{formatExternalStatus(data.external_status_old)}</strong>{' '}
              to{' '}
              <strong>{formatExternalStatus(data.external_status_new)}</strong>;
              invoice status updated from{' '}
              <strong>
                {formatLocalInvoiceStatus(data.invoice_status_old)}
              </strong>{' '}
              to{' '}
              <strong>
                {formatLocalInvoiceStatus(data.invoice_status_new)}
              </strong>
            </>
          ) : (
            <>
              {formatProviderName(data.provider)} status did not change (
              <strong>{formatExternalStatus(data.external_status_new)}</strong>
              ); invoice status updated from{' '}
              <strong>
                {formatLocalInvoiceStatus(data.invoice_status_old)}
              </strong>{' '}
              to{' '}
              <strong>
                {formatLocalInvoiceStatus(data.invoice_status_new)}
              </strong>
            </>
          );
        }

        if (!didExternalStatusChange(data)) {
          return `${formatProviderName(data.provider)} status did not change (${formatExternalStatus(data.external_status_new)})`;
        }

        return `${formatProviderName(data.provider)} invoice status changed from ${formatExternalStatus(data.external_status_old)} to ${formatExternalStatus(data.external_status_new)}`;

      case ContractActivityType.INVOICE_STATUS_SYNCED:
        return (
          <>
            Invoice status changed from{' '}
            <strong>{formatLocalInvoiceStatus(data.invoice_status_old)}</strong>{' '}
            to{' '}
            <strong>{formatLocalInvoiceStatus(data.invoice_status_new)}</strong>
            ;{' '}
            {isXeroOutboundNote(data) ? (
              <>note sent to Xero</>
            ) : didExternalStatusChange(data) ? (
              <>
                synced {formatProviderName(data.provider)} status from{' '}
                <strong>
                  {formatExternalStatus(data.external_status_old)}
                </strong>{' '}
                to{' '}
                <strong>
                  {formatExternalStatus(data.external_status_new)}
                </strong>
              </>
            ) : (
              <>
                {formatProviderName(data.provider)} status did not change (
                <strong>
                  {formatExternalStatus(data.external_status_new)}
                </strong>
                )
              </>
            )}
          </>
        );

      case ContractActivityType.OWNER_CHANGED:
        const ownerAction = data.action === 'added' ? 'Added' : 'Removed';
        if (data.ownerGroup) {
          return (
            <>
              {ownerAction} <strong>Contract Owner Group</strong>:{' '}
              {data.ownerGroup}
            </>
          );
        }
        return (
          <>
            {ownerAction} <strong>Contract Owner</strong>: {data.ownerName}
          </>
        );

      case ContractActivityType.USER_CHANGED:
        const userAction =
          data.action === 'added'
            ? 'Added'
            : data.action === 'released'
              ? 'Released'
              : 'Removed';

        // Handle bulk operations
        if (
          data.userNames &&
          Array.isArray(data.userNames) &&
          data.userNames.length > 1
        ) {
          return (
            <BulkUsersList action={userAction} userNames={data.userNames} />
          );
        }

        // Handle single user operations
        const userName =
          data.userName || (data.userNames && data.userNames[0]) || 'System';
        return (
          <>
            {userAction} <strong>Active User</strong>: {userName}
          </>
        );

      case ContractActivityType.CONTRACT_SHARED:
        return (
          <>
            Shared contract with{' '}
            {data.sharedWith?.map((entity: any, idx: number) => (
              <span key={idx}>
                {idx > 0 && ', '}
                <strong>{entity.name}</strong>
                {entity.email && ` (${entity.email})`}
              </span>
            ))}
          </>
        );

      case ContractActivityType.CONTRACT_UNSHARED:
        return (
          <>
            Removed contract access from{' '}
            {data.unsharedFrom?.map((entity: any, idx: number) => (
              <span key={idx}>
                {idx > 0 && ', '}
                <strong>{entity.name}</strong>
                {entity.email && ` (${entity.email})`}
              </span>
            ))}
          </>
        );

      case ContractActivityType.FOLDER_SHARED:
        return (
          <>
            Shared folder <strong>{data.folderName}</strong> with{' '}
            {data.sharedWith?.map((entity: any, idx: number) => (
              <span key={idx}>
                {idx > 0 && ', '}
                <strong>{entity.name}</strong>
                {entity.email && ` (${entity.email})`}
                {' with '}
                <Badge variant="outline" className="text-xs">
                  {entity.permissionLevel}
                </Badge>
                {' permission'}
              </span>
            ))}
          </>
        );

      case ContractActivityType.FOLDER_UNSHARED:
        return (
          <>
            Removed access from folder <strong>{data.folderName}</strong> for{' '}
            {data.unsharedFrom?.map((entity: any, idx: number) => (
              <span key={idx}>
                {idx > 0 && ', '}
                <strong>{entity.name}</strong>
                {entity.email && ` (${entity.email})`}
              </span>
            ))}
          </>
        );

      case ContractActivityType.CONTRACT_FOLDER_ASSIGNED:
        if (data.action === 'added') {
          return (
            <>
              Added contract to folder <strong>{data.folderName}</strong>
            </>
          );
        } else if (data.action === 'removed') {
          return (
            <>
              Removed contract from folder <strong>{data.folderName}</strong>
            </>
          );
        } else if (data.action === 'reassigned') {
          return (
            <>
              Moved contract from folder <strong>{data.oldFolderName}</strong>{' '}
              to <strong>{data.newFolderName}</strong>
            </>
          );
        }
        return '';

      case ContractActivityType.FOLDER_RENAMED:
        return (
          <>
            Renamed folder from <strong>{data.oldName}</strong> to{' '}
            <strong>{data.newName}</strong>
          </>
        );

      case ContractActivityType.EXECUTED_CONTRACT_UPLOADED:
        return 'Executed contract version uploaded';

      case ContractActivityType.CONTRACT_EDITED:
        return (
          <>
            Made{' '}
            <strong>
              {data.changeCount} change{data.changeCount !== 1 ? 's' : ''}
            </strong>{' '}
            in the contract
          </>
        );

      case ContractActivityType.CONTRACT_FIELD_REVERTED:
        return (
          <>
            Reverted <strong>{data.fieldTitle}</strong> to a previous version
          </>
        );

      case ContractActivityType.PRODUCT_FIELD_REVERTED:
        return (
          <>
            Reverted <strong>{data.fieldTitle}</strong> for{' '}
            <strong>{data.productName}</strong> to a previous value
          </>
        );

      case ContractActivityType.USER_ADDED:
        return (
          <>
            Added <strong>{data.userName}</strong> to the contract
          </>
        );

      case ContractActivityType.ALLOCATION_CHANGED: {
        const change = data as AllocationChangedActivityData;
        const { before, after } = summarizeAllocationChange(change);
        return (
          <div className="space-y-1">
            <div>
              <strong>{allocationChangeHeadline(change)}</strong>
            </div>
            {before.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Before: {before.join('; ')}
              </div>
            )}
            {after.length > 0 && (
              <div className="text-xs">After: {after.join('; ')}</div>
            )}
          </div>
        );
      }

      case ContractActivityType.DOCUMENT_TRANSLATED:
        return (
          <>
            Translated the document to English
            {data.language ? (
              <>
                {' '}
                from <strong>{data.language}</strong>
              </>
            ) : null}
          </>
        );

      case ContractActivityType.DOCUMENT_TRANSLATION_QUOTA_EXCEEDED:
        return (
          <>
            Could not translate the document: the translation service character
            allowance is exhausted
          </>
        );

      default:
        return '';
    }
  }

  function formatActivityDescriptionForExport(activity: Activity): string {
    const data = activity.activity_data as Record<string, any>;

    switch (activity.activity_type) {
      case ContractActivityType.CONTRACT_UPLOADED:
        return 'Contract uploaded';

      case ContractActivityType.WILL_NOT_RENEW:
        if (data.status) {
          return 'Set contract status to Will Not Renew';
        } else {
          return 'Removed contract status Will Not Renew';
        }

      case ContractActivityType.CONTRACT_STATUS_CHANGED:
        const oldStatus = data.oldStatus || 'unknown';
        const newStatus = data.newStatus;

        if (oldStatus === 'unconfirmed' && newStatus === 'active') {
          return 'Contract renewal confirmed';
        } else if (oldStatus === 'inactive' && newStatus === 'active') {
          return 'Contract unarchived';
        } else if (oldStatus === 'active' && newStatus === 'inactive') {
          return 'Contract archived';
        } else {
          return `Contract status changed from ${oldStatus} to ${newStatus}`;
        }

      case ContractActivityType.INVOICE_STATUS_CHANGED:
        return `Invoice status changed from ${getInvoiceStatusLabel(data.oldStatus)} to ${getInvoiceStatusLabel(data.newStatus)}`;

      case ContractActivityType.EXTERNAL_INVOICE_STATUS_CHANGED:
        if (
          data.invoice_status_old &&
          data.invoice_status_new &&
          data.invoice_status_old !== data.invoice_status_new
        ) {
          if (!didExternalStatusChange(data)) {
            return `${formatProviderName(data.provider)} status did not change (${formatExternalStatus(data.external_status_new)}); invoice status updated from ${formatLocalInvoiceStatus(data.invoice_status_old)} to ${formatLocalInvoiceStatus(data.invoice_status_new)}`;
          }

          return `${formatProviderName(data.provider)} invoice status changed from ${formatExternalStatus(data.external_status_old)} to ${formatExternalStatus(data.external_status_new)}; invoice status updated from ${formatLocalInvoiceStatus(data.invoice_status_old)} to ${formatLocalInvoiceStatus(data.invoice_status_new)}`;
        }

        if (!didExternalStatusChange(data)) {
          return `${formatProviderName(data.provider)} status did not change (${formatExternalStatus(data.external_status_new)})`;
        }

        return `${formatProviderName(data.provider)} invoice status changed from ${formatExternalStatus(data.external_status_old)} to ${formatExternalStatus(data.external_status_new)}`;

      case ContractActivityType.INVOICE_STATUS_SYNCED:
        if (isXeroOutboundNote(data)) {
          return `Invoice status changed from ${formatLocalInvoiceStatus(data.invoice_status_old)} to ${formatLocalInvoiceStatus(data.invoice_status_new)}; note sent to Xero`;
        }

        if (!didExternalStatusChange(data)) {
          return `Invoice status changed from ${formatLocalInvoiceStatus(data.invoice_status_old)} to ${formatLocalInvoiceStatus(data.invoice_status_new)}; ${formatProviderName(data.provider)} status did not change (${formatExternalStatus(data.external_status_new)})`;
        }

        return `Invoice status changed from ${formatLocalInvoiceStatus(data.invoice_status_old)} to ${formatLocalInvoiceStatus(data.invoice_status_new)}; synced ${formatProviderName(data.provider)} status from ${formatExternalStatus(data.external_status_old)} to ${formatExternalStatus(data.external_status_new)}`;

      case ContractActivityType.OWNER_CHANGED:
        const ownerAction = data.action === 'added' ? 'Added' : 'Removed';
        if (data.ownerGroup) {
          return `${ownerAction} Contract Owner Group  "${data.ownerGroup}"`;
        }
        return `${ownerAction} Contract Owner "${data.ownerName}"`;

      case ContractActivityType.USER_CHANGED:
        const userAction =
          data.action === 'added'
            ? 'Added'
            : data.action === 'released'
              ? 'Released'
              : 'Removed';

        // Handle bulk operations
        if (
          data.userNames &&
          Array.isArray(data.userNames) &&
          data.userNames.length > 1
        ) {
          return `${userAction} ${data.userNames.length} Active Users: ${data.userNames.join(', ')}`;
        }

        // Handle single user operations
        const userName =
          data.userName || (data.userNames && data.userNames[0]) || 'System';
        return `${userAction} Active User: ${userName}`;

      case ContractActivityType.CONTRACT_SHARED: {
        const sharedWith =
          data.sharedWith && data.sharedWith.length
            ? data.sharedWith
                ?.map(
                  (entity: any) =>
                    `${entity.name}${entity.email ? ` (${entity.email})` : ''}`,
                )
                .join(', ')
            : 'Unknown recipients';
        return `Shared contract with ${sharedWith}`;
      }

      case ContractActivityType.CONTRACT_UNSHARED: {
        const unsharedFrom = data.unsharedFrom
          ?.map(
            (entity: any) =>
              `${entity.name}${entity.email ? ` (${entity.email})` : ''}`,
          )
          .join(', ');
        return `Removed contract access from ${unsharedFrom}`;
      }

      case ContractActivityType.FOLDER_SHARED: {
        const folderSharedWith = data.sharedWith
          ?.map(
            (entity: any) =>
              `${entity.name}${entity.email ? ` (${entity.email})` : ''} with ${entity.permissionLevel} permission`,
          )
          .join(', ');
        return `Shared folder "${data.folderName}" with ${folderSharedWith}`;
      }

      case ContractActivityType.FOLDER_UNSHARED: {
        const folderUnsharedFrom = data.unsharedFrom
          ?.map(
            (entity: any) =>
              `${entity.name}${entity.email ? ` (${entity.email})` : ''}`,
          )
          .join(', ');
        return `Removed access from folder "${data.folderName}" for ${folderUnsharedFrom}`;
      }

      case ContractActivityType.CONTRACT_FOLDER_ASSIGNED:
        if (data.action === 'added') {
          return `Added contract to folder "${data.folderName}"`;
        } else if (data.action === 'removed') {
          return `Removed contract from folder "${data.folderName}"`;
        } else if (data.action === 'reassigned') {
          return `Moved contract from folder "${data.oldFolderName}" to "${data.newFolderName}"`;
        }
        return '';

      case ContractActivityType.FOLDER_RENAMED:
        return `Renamed folder from "${data.oldName}" to "${data.newName}"`;

      case ContractActivityType.EXECUTED_CONTRACT_UPLOADED:
        return 'Executed contract version uploaded';

      case ContractActivityType.CONTRACT_EDITED:
        return `Made ${data.changeCount} change(s) in the contract`;

      case ContractActivityType.CONTRACT_FIELD_REVERTED:
        return `Reverted "${data.fieldTitle}" to a previous value`;

      case ContractActivityType.PRODUCT_EDITED:
        return `Made ${data.changeCount} change(s) to products`;

      case ContractActivityType.PRODUCT_FIELD_REVERTED:
        return `Reverted "${data.fieldTitle}" for "${data.productName}" to a previous value`;

      case ContractActivityType.ALLOCATION_CHANGED:
        return allocationChangeHeadline(data as AllocationChangedActivityData);

      case ContractActivityType.DOCUMENT_TRANSLATED:
        return data.language
          ? `Translated the document to English from ${data.language}`
          : 'Translated the document to English';

      case ContractActivityType.DOCUMENT_TRANSLATION_QUOTA_EXCEEDED:
        return 'Could not translate the document: the translation service character allowance is exhausted';

      default:
        return '';
    }
  }

  // Helper to resolve display values for export (e.g., delivery method ID → name)
  const resolveExportValue = (
    fieldKey: string,
    value: string | number | null,
  ): string => {
    if (value === null) return '(empty)';

    if (fieldKey === 'delivery_method_id' && typeof value === 'number') {
      const method = deliveryMethods.find((m) => m.id === value);
      return method?.name ?? `Unknown (ID: ${value})`;
    }

    return String(value);
  };

  function getActivityDetailsForExport(activity: Activity): string {
    const data = activity.activity_data as Record<string, any>;

    switch (activity.activity_type) {
      case ContractActivityType.CONTRACT_EDITED: {
        if (!data.changedFields || !Array.isArray(data.changedFields)) {
          return '';
        }
        return data.changedFields
          .map(
            (f: {
              fieldKey: string;
              fieldTitle: string;
              oldValue: string | number | null;
              newValue: string | number | null;
            }) =>
              `${f.fieldTitle}: "${resolveExportValue(f.fieldKey, f.oldValue)}" → "${resolveExportValue(f.fieldKey, f.newValue)}"`,
          )
          .join('\n');
      }

      case ContractActivityType.CONTRACT_FIELD_REVERTED:
        return `"${data.revertedFrom ?? '(empty)'}" → "${data.revertedTo ?? '(empty)'}"`;

      case ContractActivityType.PRODUCT_EDITED: {
        if (!data.changedFields || !Array.isArray(data.changedFields)) {
          return '';
        }
        return data.changedFields
          .map(
            (f: {
              productName: string;
              fieldTitle: string;
              oldValue: number | null;
              newValue: number | null;
            }) =>
              `${f.productName} - ${f.fieldTitle}: "${f.oldValue ?? '(empty)'}" → "${f.newValue ?? '(empty)'}"`,
          )
          .join('\n');
      }

      case ContractActivityType.PRODUCT_FIELD_REVERTED:
        return `${data.productName} - "${data.revertedFrom ?? '(empty)'}" → "${data.revertedTo ?? '(empty)'}"`;

      case ContractActivityType.EXTERNAL_INVOICE_STATUS_CHANGED:
      case ContractActivityType.INVOICE_STATUS_SYNCED: {
        const details = [
          `Provider: ${formatProviderName(data.provider)}`,
          `Direction: ${data.syncType || 'unknown'}`,
          data.syncStatus ? `Sync status: ${data.syncStatus}` : null,
          data.external_invoice_id
            ? `External invoice ID: ${data.external_invoice_id}`
            : null,
          data.reason ? `Reason: ${data.reason}` : null,
        ].filter(Boolean);

        return details.join('\n');
      }

      case ContractActivityType.ALLOCATION_CHANGED: {
        const { before, after } = summarizeAllocationChange(
          data as AllocationChangedActivityData,
        );
        return [
          ...before.map((line) => `Before: ${line}`),
          ...after.map((line) => `After: ${line}`),
        ].join('\n');
      }

      case ContractActivityType.DOCUMENT_TRANSLATED:
        return [
          data.fileName ? `File: ${data.fileName}` : '',
          data.language ? `Source language: ${data.language}` : '',
          data.billedCharacters
            ? `Billed characters: ${data.billedCharacters}`
            : '',
        ]
          .filter(Boolean)
          .join('\n');

      case ContractActivityType.DOCUMENT_TRANSLATION_QUOTA_EXCEEDED:
        return [
          data.fileName ? `File: ${data.fileName}` : '',
          data.language ? `Source language: ${data.language}` : '',
          data.reason ? `Reason: ${data.reason}` : '',
        ]
          .filter(Boolean)
          .join('\n');

      default:
        return '';
    }
  }

  function getActivityTypeLabel(activityType: ContractActivityType): string {
    switch (activityType) {
      case ContractActivityType.CONTRACT_UPLOADED:
        return 'Upload';
      case ContractActivityType.WILL_NOT_RENEW:
        return 'Renewal Status';
      case ContractActivityType.CONTRACT_STATUS_CHANGED:
        return 'Status Change';
      case ContractActivityType.INVOICE_STATUS_CHANGED:
        return 'Invoice Status';
      case ContractActivityType.INVOICE_IMPORTED:
        return 'Invoice Imported';
      case ContractActivityType.EXTERNAL_INVOICE_STATUS_CHANGED:
        return 'External Invoice Status';
      case ContractActivityType.INVOICE_STATUS_SYNCED:
        return 'Invoice Sync';
      case ContractActivityType.OWNER_CHANGED:
        return 'Owner';
      case ContractActivityType.USER_CHANGED:
        return 'Users';
      case ContractActivityType.CONTRACT_SHARED:
        return 'Shared';
      case ContractActivityType.CONTRACT_UNSHARED:
        return 'Unshared';
      case ContractActivityType.FOLDER_SHARED:
        return 'Folder Shared';
      case ContractActivityType.FOLDER_UNSHARED:
        return 'Folder Unshared';
      case ContractActivityType.CONTRACT_FOLDER_ASSIGNED:
        return 'Folder Assignment';
      case ContractActivityType.FOLDER_RENAMED:
        return 'Folder Renamed';
      case ContractActivityType.EXECUTED_CONTRACT_UPLOADED:
        return 'Executed Contract Upload';
      case ContractActivityType.CONTRACT_EDITED:
        return 'Edit';
      case ContractActivityType.CONTRACT_FIELD_REVERTED:
        return 'Revert';
      case ContractActivityType.PRODUCT_EDITED:
        return 'Product Edit';
      case ContractActivityType.PRODUCT_FIELD_REVERTED:
        return 'Product Revert';
      case ContractActivityType.ALLOCATION_CHANGED:
        return 'Cost Allocation';
      case ContractActivityType.DOCUMENT_TRANSLATED:
        return 'Translation';
      case ContractActivityType.DOCUMENT_TRANSLATION_QUOTA_EXCEEDED:
        return 'Translation Failed';
      default:
        return 'Activity';
    }
  }

  function getActivityTypeVariant(
    activityType: ContractActivityType,
  ): 'default' | 'secondary' | 'destructive' | 'outline' {
    switch (activityType) {
      case ContractActivityType.CONTRACT_UPLOADED:
        return 'default';
      case ContractActivityType.WILL_NOT_RENEW:
        return 'destructive';
      case ContractActivityType.CONTRACT_STATUS_CHANGED:
      case ContractActivityType.INVOICE_IMPORTED:
      case ContractActivityType.INVOICE_STATUS_CHANGED:
      case ContractActivityType.EXTERNAL_INVOICE_STATUS_CHANGED:
      case ContractActivityType.INVOICE_STATUS_SYNCED:
        return 'secondary';
      case ContractActivityType.OWNER_CHANGED:
      case ContractActivityType.USER_CHANGED:
        return 'outline';
      case ContractActivityType.CONTRACT_SHARED:
      case ContractActivityType.FOLDER_SHARED:
        return 'default';
      case ContractActivityType.CONTRACT_UNSHARED:
      case ContractActivityType.FOLDER_UNSHARED:
        return 'secondary';
      case ContractActivityType.CONTRACT_FOLDER_ASSIGNED:
      case ContractActivityType.FOLDER_RENAMED:
      case ContractActivityType.ALLOCATION_CHANGED:
      case ContractActivityType.DOCUMENT_TRANSLATED:
        return 'outline';
      case ContractActivityType.DOCUMENT_TRANSLATION_QUOTA_EXCEEDED:
        return 'destructive';
      default:
        return 'default';
    }
  }

  function getUserName(activity: Activity): string {
    const data = activity.activity_data as Record<string, any>;

    if (
      activity.activity_type ===
      ContractActivityType.EXTERNAL_INVOICE_STATUS_CHANGED
    ) {
      return `${formatProviderName(data.provider)} Sync`;
    }
    if (activity.activity_type === ContractActivityType.INVOICE_STATUS_SYNCED) {
      if (data.actor_name) {
        return data.actor_name;
      }
      if (activity.user_name) {
        return activity.user_name;
      }
    }
    if (activity.users?.name) {
      return activity.users.name;
    }
    if (activity.users?.email) {
      return activity.users.email;
    }
    return 'System';
  }

  // Prepare data for CSV export
  const exportData = activities.map((activity) => ({
    date: formatLocalDateTime(activity.created_at),
    user: getUserName(activity),
    activity: formatActivityDescriptionForExport(activity),
    details: getActivityDetailsForExport(activity),
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <CardTitle>Audit Log</CardTitle>
        {activities.length > 0 && (
          <ExportTableCSVButton
            data={exportData}
            headers={[
              { key: 'date', label: 'Date' },
              { key: 'user', label: 'User' },
              { key: 'activity', label: 'Activity' },
              { key: 'details', label: 'Details' },
            ]}
            emptyPlaceholder=""
            filename={`contract_${contractId}_audit_log.csv`}
            auditSource="contract-audit-log-csv"
            title="Audit Log Report"
            metadata={
              vendorName
                ? [
                    { label: 'Vendor Name', value: vendorName },
                    { label: 'Contract ID', value: contractId.toString() },
                  ]
                : [{ label: 'Contract ID', value: contractId.toString() }]
            }
            buttonText="Export Log"
          />
        )}
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No activities found for this contract.
          </div>
        ) : (
          <Table stickyHeader scrollClassName="mt-1 rounded border">
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/6">Date</TableHead>
                <TableHead className="w-1/6">User</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead className="w-0"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activities.map((activity) =>
                activity.activity_type ===
                ContractActivityType.CONTRACT_EDITED ? (
                  <EditActivityRow
                    key={activity.id}
                    activity={activity}
                    contractId={contractId}
                    formatLocalDateTime={formatLocalDateTime}
                    getUserName={getUserName}
                    currentFieldValues={currentFieldValues}
                    deliveryMethods={deliveryMethods}
                  />
                ) : (
                  <TableRow key={activity.id}>
                    <TableCell className="whitespace-nowrap py-1.5 font-label text-[0.8rem] text-muted-foreground">
                      {formatLocalDateTime(activity.created_at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 font-label text-[0.85rem]">
                      {getUserName(activity)}
                    </TableCell>
                    <TableCell className="py-1.5 font-label text-[0.85rem]">
                      {formatActivityDescription(activity)}
                    </TableCell>
                    <TableCell className="py-1.5 text-right"></TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
