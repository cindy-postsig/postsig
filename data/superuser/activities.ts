'use server';
import { createClient } from '@/utils/supabase/service_server';
import { getUserMetadata } from '../users';
import {
  ActivityData,
  AllocationActivityScope,
  ContractActivityType,
  LogContractActivityParams,
  UserActivityType,
  getActivityDataType,
} from '@/constants/types';
import { Json } from '@/database.types';
import logger from '@/utils/pino';

export async function logContractActivity<T extends ActivityData>({
  contractId,
  activityType,
  activityData,
  userId,
}: LogContractActivityParams<T> & { contractId?: number }) {
  try {
    const supabase = createClient();

    let effectiveUserId = userId;
    if (!effectiveUserId) {
      try {
        const user = await getUserMetadata();
        effectiveUserId = user?.userId;
      } catch (error) {
        logger.warn(
          { error },
          'Could not determine current user for activity logging',
        );
      }
    }

    const activityRecord = {
      contract_id: contractId ?? null, // Needed for folder-level activities
      user_id: effectiveUserId,
      activity_type: activityType,
      activity_data: activityData as unknown as Json,
    };

    const { error } = await supabase.from('activities').insert(activityRecord);

    if (error) {
      logger.error({ error }, 'Error logging contract activity');
    }

    return true;
  } catch (error) {
    logger.error({ error }, 'Failed to log contract activity');
    return false;
  }
}

export async function logProcessingStatusChange({
  contractId,
  oldStatusId,
  newStatusId,
  reason,
  userId,
  changedBy,
}: {
  contractId: number;
  oldStatusId?: number;
  newStatusId: number;
  reason?: string;
  userId?: string;
  changedBy?: string;
}) {
  const activityData = getActivityDataType(ContractActivityType.STATUS_CHANGED);
  activityData.oldStatusId = oldStatusId;
  activityData.newStatusId = newStatusId;
  activityData.reason = reason;
  activityData.changedBy = changedBy;
  return logContractActivity({
    contractId,
    activityType: ContractActivityType.STATUS_CHANGED,
    activityData,
    userId,
  });
}

export async function logContractStatusChange({
  contractId,
  oldStatus,
  newStatus,
  reason,
  userId,
  changedBy,
}: {
  contractId: number;
  oldStatus?: string;
  newStatus: string;
  reason?: string;
  userId?: string;
  changedBy?: string;
}) {
  const activityData = getActivityDataType(
    ContractActivityType.CONTRACT_STATUS_CHANGED,
  );
  activityData.oldStatus = oldStatus;
  activityData.newStatus = newStatus;
  activityData.reason = reason;
  activityData.changedBy = changedBy;
  return logContractActivity({
    contractId,
    activityType: ContractActivityType.CONTRACT_STATUS_CHANGED,
    activityData,
    userId,
  });
}

export async function logInvoiceStatusChange({
  contractId,
  oldStatus,
  newStatus,
}: {
  contractId: number;
  oldStatus?: string;
  newStatus: string;
}) {
  const activityData = getActivityDataType(
    ContractActivityType.INVOICE_STATUS_CHANGED,
  );
  activityData.oldStatus = oldStatus;
  activityData.newStatus = newStatus;
  return logContractActivity({
    contractId,
    activityType: ContractActivityType.INVOICE_STATUS_CHANGED,
    activityData,
  });
}

export async function logContractUploaded({
  contractId,
  fileName,
  changedBy,
  userId,
  isExecutedVersion,
}: {
  contractId: number;
  fileName?: string;
  changedBy?: string;
  userId?: string;
  isExecutedVersion?: boolean;
}) {
  const activityData = getActivityDataType(
    ContractActivityType.CONTRACT_UPLOADED,
  );
  activityData.fileName = fileName;
  activityData.changedBy = changedBy;
  return logContractActivity({
    contractId,
    activityType: isExecutedVersion
      ? ContractActivityType.EXECUTED_CONTRACT_UPLOADED
      : ContractActivityType.CONTRACT_UPLOADED,
    activityData,
    userId,
  });
}

export async function logDocumentTranslated({
  contractId,
  fileName,
  language,
  translatedPath,
  billedCharacters,
  userId,
}: {
  contractId: number;
  fileName?: string;
  language?: string;
  translatedPath?: string;
  billedCharacters?: number;
  userId?: string;
}) {
  const activityData = getActivityDataType(
    ContractActivityType.DOCUMENT_TRANSLATED,
  );
  activityData.fileName = fileName;
  activityData.language = language;
  activityData.translatedPath = translatedPath;
  activityData.billedCharacters = billedCharacters;
  return logContractActivity({
    contractId,
    activityType: ContractActivityType.DOCUMENT_TRANSLATED,
    activityData,
    userId,
  });
}

export async function logDocumentTranslationQuotaExceeded({
  contractId,
  fileName,
  language,
  service,
  reason,
  userId,
}: {
  contractId: number;
  fileName?: string;
  language?: string;
  service?: string;
  reason?: string;
  userId?: string;
}) {
  const activityData = getActivityDataType(
    ContractActivityType.DOCUMENT_TRANSLATION_QUOTA_EXCEEDED,
  );
  activityData.fileName = fileName;
  activityData.language = language;
  activityData.service = service;
  activityData.reason = reason;
  return logContractActivity({
    contractId,
    activityType: ContractActivityType.DOCUMENT_TRANSLATION_QUOTA_EXCEEDED,
    activityData,
    userId,
  });
}

export async function logContractAutoRenewed({
  contractId,
  renewalPeriod,
  changedBy,
  userId,
}: {
  contractId: number;
  renewalPeriod?: string;
  changedBy?: string;
  userId?: string;
}) {
  const activityData = getActivityDataType(
    ContractActivityType.CONTRACT_AUTO_RENEWED,
  );
  activityData.renewalPeriod = renewalPeriod;
  activityData.changedBy = changedBy;
  return logContractActivity({
    contractId,
    activityType: ContractActivityType.CONTRACT_AUTO_RENEWED,
    activityData,
    userId,
  });
}

export async function logSubscriptionTermChanged({
  contractId,
  oldTerm,
  newTerm,
  changedBy,
  userId,
}: {
  contractId: number;
  oldTerm?: string;
  newTerm: string;
  changedBy?: string;
  userId?: string;
}) {
  const activityData = getActivityDataType(
    ContractActivityType.SUBSCRIPTION_TERM_CHANGED,
  );
  activityData.oldTerm = oldTerm;
  activityData.newTerm = newTerm;
  activityData.changedBy = changedBy;
  return logContractActivity({
    contractId,
    activityType: ContractActivityType.SUBSCRIPTION_TERM_CHANGED,
    activityData,
    userId,
  });
}

export async function logContractDatesUpdated({
  contractId,
  updatedFields,
  changedBy,
  userId,
}: {
  contractId: number;
  updatedFields: Array<{
    fieldName: string;
    oldValue?: string;
    newValue: string;
  }>;
  changedBy?: string;
  userId?: string;
}) {
  const activityData = getActivityDataType(
    ContractActivityType.CONTRACT_DATES_UPDATED,
  );
  activityData.updatedFields = updatedFields;
  activityData.changedBy = changedBy;
  return logContractActivity({
    contractId,
    activityType: ContractActivityType.CONTRACT_DATES_UPDATED,
    activityData,
    userId,
  });
}

export async function logOwnerChanged({
  contractId,
  action,
  ownerName,
  ownerGroup,
  changedBy,
  userId,
}: {
  contractId: number;
  action: 'added' | 'removed';
  ownerName?: string;
  ownerGroup?: string;
  changedBy?: string;
  userId?: string;
}) {
  const activityData = getActivityDataType(ContractActivityType.OWNER_CHANGED);
  activityData.action = action;
  activityData.ownerName = ownerName ? ownerName : undefined;
  activityData.ownerGroup = ownerGroup ? ownerGroup : undefined;
  activityData.changedBy = changedBy;
  return logContractActivity({
    contractId,
    activityType: ContractActivityType.OWNER_CHANGED,
    activityData,
    userId,
  });
}

export async function logUserChanged({
  contractId,
  action,
  userName,
  userNames,
  productIds,
  changedBy,
  userId,
}: {
  contractId: number;
  action: 'added' | 'removed' | 'released';
  userName?: string; // For single user operations
  userNames?: string[]; // For bulk operations
  productIds?: number[]; // Product IDs involved
  changedBy?: string;
  userId?: string;
}) {
  const activityData = getActivityDataType(ContractActivityType.USER_CHANGED);
  activityData.action = action;
  activityData.userName = userName;
  activityData.userNames = userNames;
  activityData.productIds = productIds;
  activityData.changedBy = changedBy;
  return logContractActivity({
    contractId,
    activityType: ContractActivityType.USER_CHANGED,
    activityData,
    userId,
  });
}

export async function logWillNotRenew({
  contractId,
  changedBy,
  reason,
  status,
  userId,
}: {
  contractId: number;
  changedBy?: string;
  reason?: string;
  status: boolean;
  userId?: string;
}) {
  const activityData = getActivityDataType(ContractActivityType.WILL_NOT_RENEW);
  activityData.changedBy = changedBy;
  activityData.reason = reason;
  activityData.status = status;
  return logContractActivity({
    contractId,
    activityType: ContractActivityType.WILL_NOT_RENEW,
    activityData,
    userId,
  });
}

export async function logContractShared({
  contractId,
  sharedWith,
  changedBy,
  reason,
  userId,
}: {
  contractId: number;
  sharedWith: Array<{
    type: 'user' | 'group';
    id: string | number;
    name: string;
    email?: string;
    permissionLevel: 'read' | 'write' | 'admin';
  }>;
  changedBy?: string;
  reason?: string;
  userId?: string;
}) {
  const activityData = getActivityDataType(
    ContractActivityType.CONTRACT_SHARED,
  );
  activityData.sharedWith = sharedWith;
  activityData.changedBy = changedBy;
  activityData.reason = reason;
  return logContractActivity({
    contractId,
    activityType: ContractActivityType.CONTRACT_SHARED,
    activityData,
    userId,
  });
}

export async function logContractUnshared({
  contractId,
  unsharedFrom,
  changedBy,
  reason,
  userId,
}: {
  contractId: number;
  unsharedFrom: Array<{
    type: 'user' | 'group';
    id: string | number;
    name: string;
    email?: string;
  }>;
  changedBy?: string;
  reason?: string;
  userId?: string;
}) {
  const activityData = getActivityDataType(
    ContractActivityType.CONTRACT_UNSHARED,
  );
  activityData.unsharedFrom = unsharedFrom;
  activityData.changedBy = changedBy;
  activityData.reason = reason;
  return logContractActivity({
    contractId,
    activityType: ContractActivityType.CONTRACT_UNSHARED,
    activityData,
    userId,
  });
}

export async function logFolderShared({
  contractId,
  folderId,
  folderName,
  sharedWith,
  changedBy,
  reason,
  userId,
}: {
  contractId?: number;
  folderId: number;
  folderName: string;
  sharedWith: Array<{
    type: 'user' | 'group';
    id: string | number;
    name: string;
    email?: string;
    permissionLevel: 'read' | 'write' | 'admin';
  }>;
  changedBy?: string;
  reason?: string;
  userId?: string;
}) {
  const activityData = getActivityDataType(ContractActivityType.FOLDER_SHARED);
  activityData.folderId = folderId;
  activityData.folderName = folderName;
  activityData.sharedWith = sharedWith;
  activityData.changedBy = changedBy;
  activityData.reason = reason;

  return logContractActivity({
    contractId,
    activityType: ContractActivityType.FOLDER_SHARED,
    activityData,
    userId,
  });
}

export async function logFolderUnshared({
  contractId,
  folderId,
  folderName,
  unsharedFrom,
  changedBy,
  reason,
  userId,
}: {
  contractId?: number;
  folderId: number;
  folderName: string;
  unsharedFrom: Array<{
    type: 'user' | 'group';
    id: string | number;
    name: string;
    email?: string;
  }>;
  changedBy?: string;
  reason?: string;
  userId?: string;
}) {
  const activityData = getActivityDataType(
    ContractActivityType.FOLDER_UNSHARED,
  );
  activityData.folderId = folderId;
  activityData.folderName = folderName;
  activityData.unsharedFrom = unsharedFrom;
  activityData.changedBy = changedBy;
  activityData.reason = reason;

  return logContractActivity({
    contractId,
    activityType: ContractActivityType.FOLDER_UNSHARED,
    activityData,
    userId,
  });
}

export async function logContractFolderAssignment({
  contractId,
  action,
  folderId,
  folderName,
  oldFolderId,
  oldFolderName,
  newFolderId,
  newFolderName,
  changedBy,
  userId,
}: {
  contractId: number;
  action: 'added' | 'removed' | 'reassigned';
  folderId?: number;
  folderName?: string;
  oldFolderId?: number;
  oldFolderName?: string;
  newFolderId?: number;
  newFolderName?: string;
  changedBy?: string;
  userId?: string;
}) {
  const activityData = getActivityDataType(
    ContractActivityType.CONTRACT_FOLDER_ASSIGNED,
  );
  activityData.action = action;
  activityData.folderId = folderId;
  activityData.folderName = folderName;
  activityData.oldFolderId = oldFolderId;
  activityData.oldFolderName = oldFolderName;
  activityData.newFolderId = newFolderId;
  activityData.newFolderName = newFolderName;
  activityData.changedBy = changedBy;
  return logContractActivity({
    contractId,
    activityType: ContractActivityType.CONTRACT_FOLDER_ASSIGNED,
    activityData,
    userId,
  });
}

export async function logFolderRenamed({
  contractId,
  folderId,
  oldName,
  newName,
  changedBy,
  userId,
}: {
  contractId?: number;
  folderId: number;
  oldName: string;
  newName: string;
  changedBy?: string;
  userId?: string;
}) {
  const activityData = getActivityDataType(ContractActivityType.FOLDER_RENAMED);
  activityData.folderId = folderId;
  activityData.oldName = oldName;
  activityData.newName = newName;
  activityData.changedBy = changedBy;

  // Always log, even without contractId
  return logContractActivity({
    contractId: contractId ?? undefined, // Pass undefined if no contractId
    activityType: ContractActivityType.FOLDER_RENAMED,
    activityData,
    userId,
  });
}

export async function logAllocationChanged({
  contractId,
  before,
  after,
  changedBy,
  userId,
}: {
  contractId: number;
  before: AllocationActivityScope[];
  after: AllocationActivityScope[];
  changedBy?: string;
  userId?: string;
}) {
  const activityData = getActivityDataType(
    ContractActivityType.ALLOCATION_CHANGED,
  );
  activityData.before = before;
  activityData.after = after;
  activityData.changedBy = changedBy;
  return logContractActivity({
    contractId,
    activityType: ContractActivityType.ALLOCATION_CHANGED,
    activityData,
    userId,
  });
}

export async function logVendorWhitelistUploaded({
  totalEntries,
  added,
  updated,
  replaced,
  skippedInvalid,
  skippedDuplicates,
  changedBy,
  userId,
}: {
  totalEntries: number;
  added: number;
  updated: number;
  replaced: boolean;
  skippedInvalid: number;
  skippedDuplicates: number;
  changedBy?: string;
  userId?: string;
}) {
  const activityData = getActivityDataType(
    UserActivityType.VENDOR_WHITELIST_UPLOADED,
  );
  activityData.totalEntries = totalEntries;
  activityData.added = added;
  activityData.updated = updated;
  activityData.replaced = replaced;
  activityData.skippedInvalid = skippedInvalid;
  activityData.skippedDuplicates = skippedDuplicates;
  activityData.changedBy = changedBy;
  return logContractActivity({
    activityType: UserActivityType.VENDOR_WHITELIST_UPLOADED,
    activityData,
    userId,
  });
}
